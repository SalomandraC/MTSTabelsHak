import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WikiNodeType } from '@prisma/client';
import * as Y from 'yjs';
import { UserContext } from 'src/auth/user-context';
import { decodeBase64ToBuffer } from 'src/common/utils';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { SearchService } from 'src/search/search.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';

@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
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
    if (dto.parentNodeId) {
      const parent = await db.wikiNode.findUnique({ where: { id: dto.parentNodeId } });
      if (!parent || parent.type !== WikiNodeType.folder) {
        throw new BadRequestException('Pages can only be created inside folders or at root');
      }
    }

    const position = await this.nextPosition(dto.spaceId, dto.parentNodeId ?? null, db);

    const snapshot = dto.initialContent
      ? decodeBase64ToBuffer(dto.initialContent.value)
      : Buffer.from(Y.encodeStateAsUpdate(new Y.Doc()));
    const stateVector = dto.initialContent
      ? Buffer.from(Y.encodeStateVector(this.fromSnapshot(snapshot)))
      : Buffer.from(Y.encodeStateVector(new Y.Doc()));

    const node = await db.wikiNode.create({
      data: {
        spaceId: dto.spaceId,
        parentId: dto.parentNodeId ?? null,
        type: WikiNodeType.page,
        title: dto.title,
        icon: dto.icon,
        position,
        createdBy: user.userId,
        updatedBy: user.userId,
      },
    });

    await db.wikiPage.create({
      data: {
        nodeId: node.id,
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

    return {
      page: {
        id: node.id,
        title: node.title,
        icon: node.icon,
        excerpt: null,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        backlinksCount: 0,
      },
    };
  }

  async getPage(pageId: string, includeDocumentState = true) {
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

    return {
      page: {
        id: page.id,
        title: page.title,
        icon: page.icon,
        isArchived: page.isArchived,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        plainTextPreview: page.page?.plainTextPreview ?? null,
        outgoingLinksCount: page.sourceLinks.length,
        backlinksCount: page.targetLinks.length,
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

  async updatePage(pageId: string, dto: UpdatePageDto, user: UserContext) {
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

    return this.getPage(pageId);
  }

  async deletePage(pageId: string, user: UserContext): Promise<void> {
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
  }

  private async nextPosition(spaceId: string, parentId: string | null, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<number> {
    const sibling = await db.wikiNode.findFirst({
      where: { spaceId, parentId, isArchived: false },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return sibling ? sibling.position + 1 : 0;
  }

  private fromSnapshot(snapshot: Buffer): Y.Doc {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(snapshot));
    return doc;
  }
}
