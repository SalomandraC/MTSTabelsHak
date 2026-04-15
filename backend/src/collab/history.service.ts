import { Injectable, NotFoundException } from '@nestjs/common';
import { WikiNodeType } from '@prisma/client';
import { yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';
import { UserContext } from 'src/auth/user-context';
import { encodeBytesToBase64 } from 'src/common/utils';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { DocumentIndexingService } from 'src/links/document-indexing.service';
import { PageAccessService } from 'src/page-access/page-access.service';

@Injectable()
export class HistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly indexingService: DocumentIndexingService,
    private readonly pageAccessService: PageAccessService,
  ) {}

  async listHistory(pageId: string, user?: UserContext, limit = 50) {
    await this.pageAccessService.assertCanView(pageId, user);
    await this.ensurePageExists(pageId);
    const take = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 50, 1), 100);
    const checkpoints = await this.prisma.pageCheckpoint.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return {
      items: checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        serverVersion: Number(checkpoint.serverVersion),
        trigger: checkpoint.trigger,
        createdBy: checkpoint.createdBy,
        createdByName: checkpoint.createdByName,
        createdAt: checkpoint.createdAt,
        excerpt: this.getExcerpt(checkpoint.snapshot),
        restoredFromCheckpointId: checkpoint.restoredFromCheckpointId,
      })),
    };
  }

  async getCheckpoint(pageId: string, checkpointId: string, user?: UserContext) {
    await this.pageAccessService.assertCanView(pageId, user);
    await this.ensurePageExists(pageId);
    const checkpoint = await this.prisma.pageCheckpoint.findFirst({
      where: {
        id: checkpointId,
        pageId,
      },
    });

    if (!checkpoint) {
      throw new NotFoundException('Page history checkpoint not found');
    }

    return {
      checkpoint: {
        id: checkpoint.id,
        serverVersion: Number(checkpoint.serverVersion),
        trigger: checkpoint.trigger,
        createdBy: checkpoint.createdBy,
        createdByName: checkpoint.createdByName,
        createdAt: checkpoint.createdAt,
        excerpt: this.getExcerpt(checkpoint.snapshot),
        restoredFromCheckpointId: checkpoint.restoredFromCheckpointId,
      },
      documentState: {
        encoding: 'base64-yjs-update-v2',
        value: encodeBytesToBase64(new Uint8Array(checkpoint.snapshot)),
        serverVersion: Number(checkpoint.serverVersion),
        checkpointId: checkpoint.id,
        persistedAt: checkpoint.createdAt,
      },
      document: this.toProsemirrorDocument(checkpoint.snapshot),
    };
  }

  private async ensurePageExists(pageId: string): Promise<void> {
    const page = await this.prisma.wikiNode.findFirst({
      where: {
        id: pageId,
        type: WikiNodeType.page,
        isArchived: false,
      },
      select: { id: true },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }
  }

  private getExcerpt(snapshot: Uint8Array): string | null {
    const document = this.toProsemirrorDocument(snapshot);
    const indexed = this.indexingService.extractFromProsemirrorJson(document);
    const preview = indexed.plainTextPreview?.trim();

    return preview ? preview.slice(0, 240) : null;
  }

  private toProsemirrorDocument(snapshot: Uint8Array): Record<string, any> {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(snapshot));

    return (yDocToProsemirrorJSON(ydoc, 'default') as Record<string, any> | null) ?? {
      type: 'doc',
      content: [],
    };
  }
}
