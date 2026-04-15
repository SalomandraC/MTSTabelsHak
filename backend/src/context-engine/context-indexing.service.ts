import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { ContextEngineClient } from './context-engine.client';

@Injectable()
export class ContextIndexingService {
  private readonly logger = new Logger(ContextIndexingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextEngineClient: ContextEngineClient,
  ) {}

  async indexPage(payload: {
    pageId: string;
    plainText: string;
    snapshotVersion: number;
  }): Promise<void> {
    const page = await this.prisma.wikiNode.findUnique({
      where: { id: payload.pageId },
      select: {
        id: true,
        spaceId: true,
        title: true,
        updatedAt: true,
        isArchived: true,
        type: true,
      },
    });

    if (!page || page.isArchived || page.type !== 'page') {
      await this.safeDelete(payload.pageId);
      return;
    }

    if (!payload.plainText.trim()) {
      await this.safeDelete(payload.pageId);
      return;
    }

    const folderIds = await this.collectAncestorFolderIds(page.id);

    try {
      await this.contextEngineClient.indexDocument({
        pageId: page.id,
        spaceId: page.spaceId,
        title: page.title,
        folderIds,
        snapshotVersion: payload.snapshotVersion,
        text: payload.plainText,
        updatedAt: page.updatedAt.toISOString(),
      });
    } catch (error) {
      this.contextEngineClient.logUnavailable(error, 'index');
    }
  }

  async deletePage(pageId: string): Promise<void> {
    await this.safeDelete(pageId);
  }

  private async safeDelete(pageId: string): Promise<void> {
    try {
      await this.contextEngineClient.deleteDocument(pageId);
    } catch (error) {
      this.contextEngineClient.logUnavailable(error, 'delete');
    }
  }

  private async collectAncestorFolderIds(pageId: string): Promise<string[]> {
    const folderIds: string[] = [];
    let current = await this.prisma.wikiNode.findUnique({
      where: { id: pageId },
      select: { parentId: true },
    });

    while (current?.parentId) {
      const parent = await this.prisma.wikiNode.findUnique({
        where: { id: current.parentId },
        select: { id: true, parentId: true, type: true, isArchived: true },
      });

      if (!parent) {
        break;
      }

      if (!parent.isArchived && (parent.type === 'folder' || parent.type === 'mws_folder')) {
        folderIds.push(parent.id);
      }

      current = { parentId: parent.parentId };
    }

    return folderIds;
  }
}
