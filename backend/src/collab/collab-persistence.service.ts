import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CheckpointTrigger, Prisma } from '@prisma/client';
import { yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';
import { UserContext } from 'src/auth/user-context';
import {
  decodeBase64ToBuffer,
  decodeBase64ToUint8Array,
  encodeBytesToBase64,
} from 'src/common/utils';
import { DOCUMENT_MAINTENANCE_QUEUE, REINDEX_PAGE_JOB } from 'src/infra/queue/queue.constants';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { CommentsService } from 'src/comments/comments.service';
import { DocumentIndexingService } from 'src/links/document-indexing.service';
import { ContextIndexingService } from 'src/context-engine/context-indexing.service';

@Injectable()
export class CollabPersistenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly indexingService: DocumentIndexingService,
    private readonly contextIndexingService: ContextIndexingService,
    private readonly commentsService: CommentsService,
    @InjectQueue(DOCUMENT_MAINTENANCE_QUEUE) private readonly queue: Queue,
  ) {}

  async loadDocument(pageId: string): Promise<Y.Doc> {
    const page = await this.prisma.wikiPage.findUnique({
      where: { nodeId: pageId },
      include: { document: true },
    });

    if (!page?.document) {
      throw new NotFoundException('Page document not found');
    }

    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(page.document.ydocSnapshot));

    const updates = await this.prisma.pageCrdtUpdate.findMany({
      where: {
        pageId,
        seq: {
          gt: page.lastSnapshotVersion,
        },
      },
      orderBy: { seq: 'asc' },
    });

    for (const update of updates) {
      Y.applyUpdate(ydoc, new Uint8Array(update.updatePayload));
    }

    return ydoc;
  }

  async getDocumentState(pageId: string) {
    const page = await this.prisma.wikiPage.findUnique({
      where: { nodeId: pageId },
      include: { document: true },
    });

    if (!page?.document) {
      throw new NotFoundException('Page document not found');
    }

    return {
      encoding: 'base64-yjs-update-v2',
      value: Buffer.from(page.document.ydocSnapshot).toString('base64'),
      serverVersion: Number(page.document.serverVersion),
      checkpointId: page.latestCheckpointId,
      persistedAt: page.document.updatedAt,
    };
  }

  async appendUpdate(
    pageId: string,
    update: Uint8Array,
    context: { sessionId?: string; clientId?: string; userId?: string } = {},
  ) {
    await this.prisma.$transaction(async (tx) => {
      const document = await tx.pageDocument.update({
        where: { pageId },
        data: {
          serverVersion: {
            increment: 1,
          },
        },
        select: { serverVersion: true },
      });

      await tx.pageCrdtUpdate.create({
        data: {
          pageId,
          seq: document.serverVersion,
          updatePayload: Buffer.from(update),
          originSessionId: context.sessionId,
          originClientId: context.clientId,
          createdBy: context.userId,
        },
      });
    });
  }

  async storeDocument(
    pageId: string,
    document: Y.Doc,
    options: { queueReindex?: boolean } = {},
  ) {
    const serverDocument = await this.prisma.pageDocument.findUnique({
      where: { pageId },
      select: { serverVersion: true },
    });

    if (!serverDocument) {
      throw new NotFoundException('Page document not found');
    }

    const snapshot = Buffer.from(Y.encodeStateAsUpdate(document));
    const stateVector = Buffer.from(Y.encodeStateVector(document));

    await this.prisma.$transaction([
      this.prisma.pageDocument.update({
        where: { pageId },
        data: {
          ydocSnapshot: new Uint8Array(snapshot),
          stateVector: new Uint8Array(stateVector),
        },
      }),
      this.prisma.wikiPage.update({
        where: { nodeId: pageId },
        data: {
          lastSnapshotVersion: serverDocument.serverVersion,
          lastCompactedAt: new Date(),
        },
      }),
    ]);

    if (options.queueReindex ?? true) {
      await this.queue.add(
        REINDEX_PAGE_JOB,
        { pageId, snapshot: encodeBytesToBase64(snapshot) },
        {
          jobId: `${REINDEX_PAGE_JOB}-${pageId}`,
          removeOnComplete: true,
          removeOnFail: 10,
        },
      );
    }
  }

  async createCheckpoint(
    pageId: string,
    value: string,
    user: UserContext,
    trigger: string,
    restoredFromCheckpointId?: string,
  ) {
    const document = await this.prisma.pageDocument.findUnique({
      where: { pageId },
      select: { serverVersion: true },
    });

    if (!document) {
      throw new NotFoundException('Page document not found');
    }

    const snapshot = decodeBase64ToBuffer(value);
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, decodeBase64ToUint8Array(value));
    const stateVector = Buffer.from(Y.encodeStateVector(ydoc));

    const checkpoint = await this.prisma.pageCheckpoint.create({
      data: {
        pageId,
        serverVersion: document.serverVersion,
        snapshot: new Uint8Array(snapshot),
        stateVector: new Uint8Array(stateVector),
        trigger: this.mapTrigger(trigger),
        createdBy: user.userId,
        createdByName: user.displayName,
        restoredFromCheckpointId: restoredFromCheckpointId ?? null,
      },
    });

    await this.prisma.wikiPage.update({
      where: { nodeId: pageId },
      data: {
        latestCheckpointId: checkpoint.id,
      },
    });

    await this.storeDocument(pageId, ydoc, { queueReindex: false });
    await this.reindexPage(pageId, value, trigger === 'restore' ? { restoreUser: user } : undefined);

    return {
      checkpointId: checkpoint.id,
      persistedAt: checkpoint.createdAt,
      serverVersion: Number(checkpoint.serverVersion),
    };
  }

  async reindexPage(pageId: string, snapshotBase64?: string, options?: { restoreUser?: UserContext }): Promise<void> {
    const ydoc = new Y.Doc();
    const snapshot = snapshotBase64
      ? Buffer.from(snapshotBase64, 'base64')
      : (await this.prisma.pageDocument.findUnique({ where: { pageId } }))?.ydocSnapshot;

    if (!snapshot) {
      throw new NotFoundException('Page document not found');
    }

    Y.applyUpdate(ydoc, new Uint8Array(snapshot));
    const pmDoc = yDocToProsemirrorJSON(ydoc, 'default') as Record<string, any>;
    const indexed = this.indexingService.extractFromProsemirrorJson(pmDoc);
    const plainText = this.indexingService.extractPlainTextFromProsemirrorJson(pmDoc);
    const existingTargetIds = new Set(
      (
        await this.prisma.wikiNode.findMany({
          where: {
            id: { in: indexed.links.map((item) => item.targetPageId) },
            type: 'page',
            isArchived: false,
          },
          select: { id: true },
        })
      ).map((node) => node.id),
    );
    const safeLinks = indexed.links.filter((item) => existingTargetIds.has(item.targetPageId));

    await this.prisma.$transaction([
      this.prisma.wikiPage.update({
        where: { nodeId: pageId },
        data: {
          plainTextPreview: indexed.plainTextPreview,
          lastIndexedAt: new Date(),
        },
      }),
      this.prisma.pageLink.deleteMany({ where: { sourcePageId: pageId } }),
      this.prisma.pageEmbed.deleteMany({ where: { pageId } }),
      ...safeLinks.map((item) =>
        this.prisma.pageLink.create({
          data: {
            sourcePageId: pageId,
            targetPageId: item.targetPageId,
            mentionCount: item.mentionCount,
            lastReindexedAt: new Date(),
          },
        }),
      ),
      ...indexed.embeds.map((embed) =>
        this.prisma.pageEmbed.create({
          data: {
            pageId,
            blockId: embed.blockId,
            provider: 'mws_tables',
            mwsSpaceId: embed.mwsSpaceId,
            mwsNodeId: embed.mwsNodeId,
            mwsDatasheetId: embed.mwsDatasheetId,
            mwsViewId: embed.mwsViewId,
            displayMode: embed.displayMode,
            selectedFieldIds: embed.selectedFieldIds,
            filterFormula: embed.filterFormula,
            pageSize: embed.pageSize,
            allowInlineEdit: embed.allowInlineEdit,
            config: embed.config as Prisma.InputJsonValue,
            lastResolvedAt: new Date(),
          },
        }),
      ),
    ]);

    if (options?.restoreUser) {
      await this.commentsService.autoResolveMissingAnchorsAfterRestore(pageId, plainText, options.restoreUser);
    }

    await this.contextIndexingService.indexPage({
      pageId,
      plainText,
      snapshotVersion: Number(
        (
          await this.prisma.wikiPage.findUnique({
            where: { nodeId: pageId },
            select: { lastSnapshotVersion: true },
          })
        )?.lastSnapshotVersion ?? 0n,
      ),
    });
  }

  private mapTrigger(trigger: string): CheckpointTrigger {
    switch (trigger) {
      case 'editor-idle':
        return CheckpointTrigger.editor_idle;
      case 'before-unload':
        return CheckpointTrigger.before_unload;
      case 'manual':
        return CheckpointTrigger.manual;
      case 'reconnect':
        return CheckpointTrigger.reconnect;
      case 'restore':
        return CheckpointTrigger.restore;
      default:
        return CheckpointTrigger.manual;
    }
  }
}
