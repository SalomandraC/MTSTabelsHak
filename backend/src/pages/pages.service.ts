import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WikiNodeType } from '@prisma/client';
import { yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';
import { UserContext } from 'src/auth/user-context';
import { decodeBase64ToBuffer } from 'src/common/utils';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { ContextIndexingService } from 'src/context-engine/context-indexing.service';
import { DocumentIndexingService } from 'src/links/document-indexing.service';
import { MwsService } from 'src/mws/mws.service';
import { PageAccessService } from 'src/page-access/page-access.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { SearchService } from 'src/search/search.service';
import { UpdatePageAccessDto } from './dto/update-page-access.dto';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';

const WIKI_NODE_TYPE_MWS_FOLDER = 'mws_folder';

@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
    private readonly pageAccessService: PageAccessService,
    private readonly realtimeService: RealtimeService,
    private readonly mwsService: MwsService,
    private readonly contextIndexingService: ContextIndexingService,
    private readonly documentIndexingService: DocumentIndexingService,
  ) {}

  async listPages(spaceId: string, query?: string, limit = 20) {
    const items = await this.searchService.searchPages(spaceId, query, limit);

    return {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        icon: item.icon,
        excerpt: item.page?.plainTextPreview ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        backlinksCount: item.targetLinks.length,
      })),
      pageInfo: {
        hasNextPage: false,
        nextCursor: null,
      },
    };
  }

  async createPage(dto: CreatePageDto, user: UserContext, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const { parentId, externalParentNodeId } = await this.resolveParentId(dto, user, db);

    const position = await this.nextPosition(dto.spaceId, parentId, db);

    const snapshot = dto.initialContent
      ? decodeBase64ToBuffer(dto.initialContent.value)
      : Buffer.from(Y.encodeStateAsUpdate(new Y.Doc()));
    const stateVector = dto.initialContent
      ? Buffer.from(Y.encodeStateVector(this.fromSnapshot(snapshot)))
      : Buffer.from(Y.encodeStateVector(new Y.Doc()));

    const node = await db.wikiNode.create({
      data: {
        spaceId: dto.spaceId,
        parentId,
        type: WikiNodeType.page,
        title: dto.title,
        icon: dto.icon,
        position,
        mwsParentNodeId: externalParentNodeId,
        createdBy: user.userId,
        updatedBy: user.userId,
      },
    });

    await db.wikiPage.create({
      data: {
        nodeId: node.id,
        headingNumberingEnabled: false,
        lastSnapshotVersion: 0,
      },
    });

    await db.pageDocument.create({
      data: {
        pageId: node.id,
        ydocSnapshot: new Uint8Array(snapshot),
        stateVector: new Uint8Array(stateVector),
        serverVersion: 0,
      },
    });

    await this.pageAccessService.createDefaultPolicy(node.id, user.userId, db);

    return {
      page: {
        id: node.id,
        title: node.title,
        icon: node.icon,
        excerpt: null,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        backlinksCount: 0,
        access: await this.pageAccessService.resolvePageAccess(node.id, user, db),
      },
    };
  }

  async getPage(pageId: string, includeDocumentState = true, user?: UserContext, allowReadOnlyLinkAccess = false) {
    const resolvedAccess = await this.pageAccessService.resolvePageAccess(pageId, user);
    const access = !resolvedAccess.capabilities.canView && allowReadOnlyLinkAccess && !user?.userId
      ? {
          ...resolvedAccess,
          role: 'guest' as const,
          principal: 'anonymous' as const,
          capabilities: {
            ...resolvedAccess.capabilities,
            canView: true,
            canEdit: false,
            canComment: false,
            canManageAccess: false,
            canDelete: false,
            canUseAi: false,
            canUseAdvancedPlugins: false,
          },
        }
      : resolvedAccess;

    if (!access.capabilities.canView) {
      await this.pageAccessService.assertCanView(pageId, user);
    }

    const page = await this.prisma.wikiNode.findUnique({
      where: { id: pageId },
      include: {
        page: {
          include: {
            document: true,
          },
        },
        sourceLinks: true,
        targetLinks: true,
        embeds: true,
      },
    });

    if (!page || page.type !== WikiNodeType.page) {
      throw new NotFoundException('Page not found');
    }

    const documentJson =
      includeDocumentState && page.page?.document
        ? (() => {
            const ydoc = new Y.Doc();
            Y.applyUpdate(ydoc, new Uint8Array(page.page.document.ydocSnapshot));
            const prosemirrorDoc = yDocToProsemirrorJSON(ydoc, 'default') as { type: string; content?: unknown[] };
            ydoc.destroy();
            return prosemirrorDoc;
          })()
        : undefined;

    return {
      page: {
        id: page.id,
        title: page.title,
        icon: page.icon,
        isArchived: page.isArchived,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        plainTextPreview: page.page?.plainTextPreview ?? null,
        headingNumberingEnabled: page.page?.headingNumberingEnabled ?? false,
        outgoingLinksCount: page.sourceLinks.length,
        backlinksCount: page.targetLinks.length,
        access,
        document: documentJson,
        embeds: page.embeds.map((embed) => ({
          id: embed.id,
          type: 'mwsTableEmbed',
          title: embed.config && typeof embed.config === 'object' ? (embed.config as any).title ?? null : null,
          datasheetId: embed.mwsDatasheetId,
          viewId: embed.mwsViewId,
          displayMode: embed.displayMode,
        })),
            documentState:
          includeDocumentState && page.page?.document
            ? {
                encoding: 'base64-yjs-update-v2',
                value: Buffer.from(page.page.document.ydocSnapshot).toString('base64'),
                serverVersion: Number(page.page.document.serverVersion),
                checkpointId: page.page.latestCheckpointId,
                persistedAt: page.page.document.updatedAt,
              }
            : undefined,
      },
    };
  }

  async getPageAccess(pageId: string, user?: UserContext) {
    const access = await this.pageAccessService.assertCanView(pageId, user);
    return { access };
  }

  async updatePage(pageId: string, dto: UpdatePageDto, user: UserContext) {
    await this.pageAccessService.assertCanEdit(pageId, user);
    const page = await this.prisma.wikiNode.findUnique({ where: { id: pageId } });
    if (!page || page.type !== WikiNodeType.page) {
      throw new NotFoundException('Page not found');
    }

    await this.prisma.wikiNode.update({
      where: { id: pageId },
      data: {
        title: dto.title,
        icon: dto.icon,
        isArchived: dto.isArchived,
        updatedBy: user.userId,
      },
    });

    if (dto.headingNumberingEnabled !== undefined) {
      await this.prisma.wikiPage.update({
        where: { nodeId: pageId },
        data: {
          headingNumberingEnabled: dto.headingNumberingEnabled,
        },
      });
    }

    const response = await this.getPage(pageId, true, user);
    this.realtimeService.broadcastPageUpdated(page.spaceId, pageId);
    return response;
  }

  async updatePageAccess(pageId: string, dto: UpdatePageAccessDto, user: UserContext) {
    await this.pageAccessService.assertCanManageAccess(pageId, user);
    const page = await this.prisma.wikiNode.findUnique({
      where: { id: pageId },
      select: { id: true, spaceId: true, type: true },
    });

    if (!page || page.type !== WikiNodeType.page) {
      throw new NotFoundException('Page not found');
    }

    await this.prisma.pageAccessPolicy.upsert({
      where: { pageId },
      create: {
        pageId,
        ownerUserId: user.userId,
        viewAccess: dto.viewAccess,
        commentAccess: dto.commentAccess,
        editAccess: dto.editAccess,
      },
      update: {
        viewAccess: dto.viewAccess,
        commentAccess: dto.commentAccess,
        editAccess: dto.editAccess,
      },
    });

    const result = await this.getPageAccess(pageId, user);
    this.realtimeService.broadcastPageAccessUpdated(page.spaceId, pageId);
    return result;
  }

  async deletePage(pageId: string, user: UserContext): Promise<void> {
    await this.pageAccessService.assertCanDelete(pageId, user);
    const page = await this.prisma.wikiNode.findUnique({ where: { id: pageId } });
    if (!page || page.type !== WikiNodeType.page) {
      throw new NotFoundException('Page not found');
    }

    await this.prisma.wikiNode.update({
      where: { id: pageId },
      data: {
        isArchived: true,
        updatedBy: user.userId,
      },
    });

    await this.contextIndexingService.deletePage(pageId);
  }

  async getPageContextForAi(pageId: string, user?: UserContext, maxLength = 6000) {
    await this.pageAccessService.assertCanView(pageId, user);

    const page = await this.prisma.wikiNode.findUnique({
      where: { id: pageId },
      include: {
        page: {
          include: {
            document: true,
          },
        },
      },
    });

    if (!page || page.type !== WikiNodeType.page) {
      throw new NotFoundException('Page not found');
    }

    let content = page.page?.plainTextPreview ?? '';

    if (page.page?.document?.ydocSnapshot) {
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, new Uint8Array(page.page.document.ydocSnapshot));
      const pmDoc = yDocToProsemirrorJSON(ydoc, 'default') as Record<string, unknown>;
      const extracted = this.documentIndexingService.extractPlainTextFromProsemirrorJson(pmDoc);
      if (extracted.trim()) {
        content = extracted;
      }
    }

    const normalizedContent = content.trim();

    return {
      pageId: page.id,
      spaceId: page.spaceId,
      title: page.title,
      excerpt: page.page?.plainTextPreview ?? null,
      content: normalizedContent.slice(0, maxLength),
      truncated: normalizedContent.length > maxLength,
    };
  }

  private async nextPosition(spaceId: string, parentId: string | null, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<number> {
    const sibling = await db.wikiNode.findFirst({
      where: { spaceId, parentId, isArchived: false },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return sibling ? sibling.position + 1 : 0;
  }

  private async resolveParentId(
    dto: CreatePageDto,
    user: UserContext,
    db: Prisma.TransactionClient | PrismaService,
  ) {
    if (dto.parentNodeId && dto.externalParentNodeId) {
      throw new BadRequestException('Use either parentNodeId or externalParentNodeId');
    }

    if (dto.parentNodeId) {
      const parent = await db.wikiNode.findUnique({ where: { id: dto.parentNodeId } });
      if (!parent || (parent.type !== WikiNodeType.folder && parent.type !== WIKI_NODE_TYPE_MWS_FOLDER)) {
        throw new BadRequestException('Pages can only be created inside local or MWS folders');
      }

      return {
        parentId: parent.id,
        externalParentNodeId: parent.sourceNodeId ?? parent.mwsSourceNodeId ?? null,
      };
    }

    if (!dto.externalParentNodeId) {
      return {
        parentId: null,
        externalParentNodeId: null,
      };
    }

    const shadowParent = await this.mwsService.resolveShadowFolderNode(dto.spaceId, dto.externalParentNodeId, user);

    return {
      parentId: shadowParent.id,
      externalParentNodeId: dto.externalParentNodeId,
    };
  }

  private fromSnapshot(snapshot: Buffer): Y.Doc {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(snapshot));
    return doc;
  }
}
