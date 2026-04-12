import {
  DocumentAccessScope,
  Prisma,
  WikiNodeType,
} from '@prisma/client';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserContext } from 'src/auth/user-context';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { RedisService } from 'src/infra/redis/redis.service';
import { MwsService } from 'src/mws/mws.service';

export type DocumentRole = 'owner' | 'editor' | 'commentator' | 'guest';

export type DocumentCapabilities = {
  canView: boolean;
  canEdit: boolean;
  canComment: boolean;
  canManageAccess: boolean;
  canDelete: boolean;
  canUseAi: boolean;
  canUseAdvancedPlugins: boolean;
};

export type DocumentPolicySummary = {
  ownerUserId: string;
  viewAccess: DocumentAccessScope;
  commentAccess: DocumentAccessScope;
  editAccess: DocumentAccessScope;
};

export type PageAccessResult = {
  role: DocumentRole | null;
  capabilities: DocumentCapabilities;
  policy: DocumentPolicySummary;
  principal: 'authenticated' | 'anonymous';
  isSpaceMember: boolean;
  isOwner: boolean;
};

type PageRecord = {
  id: string;
  spaceId: string;
  createdBy: string;
  accessPolicy: {
    ownerUserId: string;
    viewAccess: DocumentAccessScope;
    commentAccess: DocumentAccessScope;
    editAccess: DocumentAccessScope;
  } | null;
};

const USER_SPACES_CACHE_TTL_SEC = 5 * 60;

@Injectable()
export class PageAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly mwsService: MwsService,
  ) {}

  async createDefaultPolicy(
    pageId: string,
    ownerUserId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return db.pageAccessPolicy.upsert({
      where: { pageId },
      create: {
        pageId,
        ownerUserId,
        viewAccess: DocumentAccessScope.space_members,
        commentAccess: DocumentAccessScope.space_members,
        editAccess: DocumentAccessScope.space_members,
      },
      update: {},
    });
  }

  async resolvePageAccess(
    pageId: string,
    user?: UserContext | null,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<PageAccessResult> {
    const page = await this.getPageRecord(pageId, db);
    const policy = page.accessPolicy ?? {
      ownerUserId: page.createdBy,
      viewAccess: DocumentAccessScope.space_members,
      commentAccess: DocumentAccessScope.space_members,
      editAccess: DocumentAccessScope.space_members,
    };

    if (!user?.userId) {
      return {
        role: null,
        capabilities: {
          canView: false,
          canEdit: false,
          canComment: false,
          canManageAccess: false,
          canDelete: false,
          canUseAi: false,
          canUseAdvancedPlugins: false,
        },
        policy,
        principal: 'anonymous',
        isSpaceMember: false,
        isOwner: false,
      };
    }

    const isOwner = policy.ownerUserId === user.userId;
    const isSpaceMember = isOwner ? true : await this.isSpaceMember(page.spaceId, user);

    const canView = isOwner || this.matchesScope(policy.viewAccess, isSpaceMember, user);
    const canComment = canView && (isOwner || this.matchesScope(policy.commentAccess, isSpaceMember, user));
    const canEdit = canView && (isOwner || this.matchesScope(policy.editAccess, isSpaceMember, user));
    const role = this.resolveRole({ isOwner, canEdit, canComment, canView });

    return {
      role,
      capabilities: {
        canView,
        canEdit,
        canComment,
        canManageAccess: isOwner,
        canDelete: isOwner,
        canUseAi: canEdit && Boolean(user?.userId),
        canUseAdvancedPlugins: Boolean(user?.userId),
      },
      policy,
      principal: user?.userId ? 'authenticated' : 'anonymous',
      isSpaceMember,
      isOwner,
    };
  }

  async assertCanView(pageId: string, user?: UserContext | null): Promise<PageAccessResult> {
    const access = await this.resolvePageAccess(pageId, user);
    if (!access.capabilities.canView) {
      throw new ForbiddenException('You do not have access to view this page');
    }
    return access;
  }

  async assertCanEdit(pageId: string, user?: UserContext | null): Promise<PageAccessResult> {
    const access = await this.resolvePageAccess(pageId, user);
    if (!access.capabilities.canEdit) {
      throw new ForbiddenException('You do not have access to edit this page');
    }
    return access;
  }

  async assertCanComment(pageId: string, user?: UserContext | null): Promise<PageAccessResult> {
    const access = await this.resolvePageAccess(pageId, user);
    if (!access.capabilities.canComment) {
      throw new ForbiddenException('You do not have access to comment on this page');
    }
    return access;
  }

  async assertCanManageAccess(pageId: string, user?: UserContext | null): Promise<PageAccessResult> {
    const access = await this.resolvePageAccess(pageId, user);
    if (!access.capabilities.canManageAccess) {
      throw new ForbiddenException('Only the owner can manage page access');
    }
    return access;
  }

  async assertCanDelete(pageId: string, user?: UserContext | null): Promise<PageAccessResult> {
    const access = await this.resolvePageAccess(pageId, user);
    if (!access.capabilities.canDelete) {
      throw new ForbiddenException('Only the owner can delete this page');
    }
    return access;
  }

  async invalidatePageAccessCache(pageId: string, spaceId?: string, userId?: string): Promise<void> {
    await this.redisService.del(this.pageAccessKey(pageId));
    if (spaceId) {
      await this.redisService.del(this.spacePagesKey(spaceId));
    }
    if (userId) {
      await this.redisService.del(this.userSpacesKey(userId));
    }
  }

  private async getPageRecord(
    pageId: string,
    db: Prisma.TransactionClient | PrismaService,
  ): Promise<PageRecord> {
    const page = await db.wikiNode.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        spaceId: true,
        createdBy: true,
        type: true,
        isArchived: true,
        page: {
          select: {
            accessPolicy: {
              select: {
                ownerUserId: true,
                viewAccess: true,
                commentAccess: true,
                editAccess: true,
              },
            },
          },
        },
      },
    });

    if (!page || page.type !== WikiNodeType.page || page.isArchived) {
      throw new NotFoundException('Page not found');
    }

    return {
      id: page.id,
      spaceId: page.spaceId,
      createdBy: page.createdBy,
      accessPolicy: page.page?.accessPolicy ?? null,
    };
  }

  private matchesScope(
    scope: DocumentAccessScope,
    isSpaceMember: boolean,
    user?: UserContext | null,
  ): boolean {
    switch (scope) {
      case DocumentAccessScope.owner_only:
        return false;
      case DocumentAccessScope.space_members:
        return isSpaceMember;
      case DocumentAccessScope.link_holders:
        return true;
      default:
        return Boolean(user?.userId);
    }
  }

  private resolveRole({
    isOwner,
    canEdit,
    canComment,
    canView,
  }: {
    isOwner: boolean;
    canEdit: boolean;
    canComment: boolean;
    canView: boolean;
  }): DocumentRole | null {
    if (isOwner) {
      return 'owner';
    }
    if (canEdit) {
      return 'editor';
    }
    if (canComment) {
      return 'commentator';
    }
    if (canView) {
      return 'guest';
    }
    return null;
  }

  private async isSpaceMember(spaceId: string, user?: UserContext | null): Promise<boolean> {
    if (!user?.userId) {
      return false;
    }

    // Preserve current local demo behavior when auth is bypassed.
    if (!user.mwsToken && !user.authToken) {
      return true;
    }

    const cacheKey = this.userSpacesKey(user.userId);
    const cached = await this.redisService.getJson<string[]>(cacheKey);
    if (cached) {
      return cached.includes(spaceId);
    }

    const response = await this.mwsService.listSpaces(user);
    const spaceIds = response.items.map((item) => item.id);
    await this.redisService.setJson(cacheKey, spaceIds, USER_SPACES_CACHE_TTL_SEC);
    return spaceIds.includes(spaceId);
  }

  private pageAccessKey(pageId: string): string {
    return `acl:page:${pageId}`;
  }

  private userSpacesKey(userId: string): string {
    return `acl:user:spaces:${userId}`;
  }

  private spacePagesKey(spaceId: string): string {
    return `acl:space:pages:${spaceId}`;
  }
}
