import { Injectable } from '@nestjs/common';
import { UserContext } from 'src/auth/user-context';
import { PageAccessService } from 'src/page-access/page-access.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { ContextEngineClient } from './context-engine.client';

@Injectable()
export class ContextSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextEngineClient: ContextEngineClient,
    private readonly pageAccessService: PageAccessService,
  ) {}

  async searchInSpace(
    user: UserContext,
    params: {
      spaceId: string;
      query: string;
      pageIds?: string[];
      folderIds?: string[];
      topK?: number;
    },
  ) {
    await this.pageAccessService.assertCanAccessSpace(params.spaceId, user);

    const pageIds = await this.resolveScopedPageIds(params.spaceId, params.pageIds, params.folderIds);
    const hasExplicitScope = Boolean((params.pageIds?.length ?? 0) > 0 || (params.folderIds?.length ?? 0) > 0);

    if (hasExplicitScope && pageIds && pageIds.length === 0) {
      return { items: [] };
    }

    const response = await this.contextEngineClient.search({
      spaceId: params.spaceId,
      query: params.query,
      pageIds,
      topK: params.topK,
    });

    return {
      items: response.items.map((item) => ({
        pageId: item.pageId,
        title: item.title,
        snippet: item.chunkText,
        score: item.score,
        chunkIndex: item.chunkIndex,
      })),
    };
  }

  async resolveScopedPageIds(spaceId: string, pageIds?: string[], folderIds?: string[]): Promise<string[] | undefined> {
    const normalizedPageIds = Array.from(new Set((pageIds ?? []).filter(Boolean)));
    const normalizedFolderIds = Array.from(new Set((folderIds ?? []).filter(Boolean)));

    if (normalizedPageIds.length === 0 && normalizedFolderIds.length === 0) {
      return undefined;
    }

    const scopedPages = new Set<string>();

    if (normalizedPageIds.length > 0) {
      const directPages = await this.prisma.wikiNode.findMany({
        where: {
          id: { in: normalizedPageIds },
          spaceId,
          type: 'page',
          isArchived: false,
        },
        select: { id: true },
      });

      directPages.forEach((page) => scopedPages.add(page.id));
    }

    if (normalizedFolderIds.length > 0) {
      const descendantFolderIds = await this.collectDescendantFolderIds(spaceId, normalizedFolderIds);

      const folderPages = await this.prisma.wikiNode.findMany({
        where: {
          spaceId,
          type: 'page',
          isArchived: false,
          parentId: { in: descendantFolderIds },
        },
        select: { id: true },
      });

      folderPages.forEach((page) => scopedPages.add(page.id));
    }

    return Array.from(scopedPages);
  }

  private async collectDescendantFolderIds(spaceId: string, folderIds: string[]): Promise<string[]> {
    const discovered = new Set<string>();
    const queue = [...folderIds];

    while (queue.length > 0) {
      const currentId = queue.shift();

      if (!currentId || discovered.has(currentId)) {
        continue;
      }

      const current = await this.prisma.wikiNode.findUnique({
        where: { id: currentId },
        select: { id: true, spaceId: true, type: true, isArchived: true },
      });

      if (!current || current.spaceId !== spaceId || current.isArchived) {
        continue;
      }

      if (current.type !== 'folder' && current.type !== 'mws_folder') {
        continue;
      }

      discovered.add(current.id);

      const children = await this.prisma.wikiNode.findMany({
        where: {
          spaceId,
          parentId: current.id,
          isArchived: false,
          OR: [{ type: 'folder' }, { type: 'mws_folder' }],
        },
        select: { id: true },
      });

      children.forEach((child) => queue.push(child.id));
    }

    return Array.from(discovered);
  }
}
