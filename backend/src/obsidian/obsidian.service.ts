import { Injectable } from '@nestjs/common';
import { WikiNodeType } from '@prisma/client';
import { AuthService } from 'src/auth/auth.service';
import { UserContext } from 'src/auth/user-context';
import { CollabPersistenceService } from 'src/collab/collab-persistence.service';
import { MwsService } from 'src/mws/mws.service';
import { PagesService } from 'src/pages/pages.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import * as Y from 'yjs';
import {
  ObsidianConflictResolution,
  ObsidianImportFileDto,
  ObsidianImportPreviewDto,
  ObsidianImportRunDto,
} from './dto/obsidian-import.dto';
import { encodeMarkdownToYDoc } from './obsidian-markdown-import';

type FolderResolution = {
  parentId: string | null;
  path: string;
};

type ImportPreviewItem = {
  path: string;
  folderPath: string;
  fileName: string;
  pageTitle: string;
  status: 'new' | 'conflict';
  existingPageId: string | null;
  existingPageTitle: string | null;
  suggestedResolution: ObsidianConflictResolution;
};

@Injectable()
export class ObsidianService {
  constructor(
    private readonly authService: AuthService,
    private readonly mwsService: MwsService,
    private readonly pagesService: PagesService,
    private readonly collabPersistenceService: CollabPersistenceService,
    private readonly prisma: PrismaService,
  ) {}

  async listSpaces(apiKey: string) {
    const user = await this.authService.authorizeApiKey(apiKey);
    return this.mwsService.listSpaces(user);
  }

  async previewImport(input: ObsidianImportPreviewDto) {
    const user = await this.authService.authorizeApiKey(input.apiKey);
    const files = this.normalizeFiles(input.files);
    const preview = await this.buildPreview(files, input.spaceId, input.folderStrategy ?? 'preserve');

    return {
      mode: input.mode ?? 'custom',
      folderStrategy: input.folderStrategy ?? 'preserve',
      items: preview.items,
      summary: {
        totalFiles: files.length,
        newPages: preview.items.filter((item) => item.status === 'new').length,
        conflicts: preview.items.filter((item) => item.status === 'conflict').length,
      },
      user: {
        userId: user.userId,
        displayName: user.displayName,
      },
    };
  }

  async runImport(input: ObsidianImportRunDto) {
    const user = await this.authService.authorizeApiKey(input.apiKey);
    const files = this.normalizeFiles(input.files);
    const folderStrategy = input.folderStrategy ?? 'preserve';
    const preview = await this.buildPreview(files, input.spaceId, folderStrategy);
    const defaultResolution = input.defaultConflictResolution ?? 'skip';
    const resolutionMap = input.conflictResolutions ?? {};
    const results: Array<Record<string, unknown>> = [];

    for (const item of preview.items) {
      const file = files.find((entry) => entry.path === item.path);
      if (!file) {
        continue;
      }

      const resolution =
        item.status === 'conflict'
          ? resolutionMap[item.path] ?? defaultResolution
          : 'replace';

      if (item.status === 'conflict' && resolution === 'skip') {
        results.push({
          path: item.path,
          action: 'skipped',
          reason: 'conflict',
          pageId: item.existingPageId,
          pageTitle: item.existingPageTitle,
        });
        continue;
      }

      const target = await this.importSingleFile(
        user,
        input.spaceId,
        file,
        folderStrategy,
        item,
        resolution,
      );

      results.push(target);
    }

    return {
      items: results,
      summary: {
        totalFiles: files.length,
        imported: results.filter((item) => item.action === 'created' || item.action === 'replaced').length,
        skipped: results.filter((item) => item.action === 'skipped').length,
      },
    };
  }

  private normalizeFiles(files: ObsidianImportFileDto[]): ObsidianImportFileDto[] {
    return files
      .filter((file) => file && typeof file.path === 'string' && typeof file.markdown === 'string')
      .map((file) => ({
        ...file,
        path: file.path.replace(/\\/g, '/').trim(),
        name: file.name?.trim() || this.fileNameFromPath(file.path),
      }))
      .filter((file) => file.path.length > 0 && file.markdown.length >= 0);
  }

  private async buildPreview(
    files: ObsidianImportFileDto[],
    spaceId: string,
    folderStrategy: 'preserve' | 'flat',
  ): Promise<{ items: ImportPreviewItem[] }> {
    const folderCache = await this.loadFolderCache(spaceId);
    const items: ImportPreviewItem[] = [];

    for (const file of files) {
      const folderResolution = this.resolveFolderFromCache(folderCache, file.path, folderStrategy);
      const encoded = encodeMarkdownToYDoc(file.markdown);
      const pageTitle = encoded.title?.trim() || this.titleFromFileName(file.name || this.fileNameFromPath(file.path));
      const existingPage = await this.prisma.wikiNode.findFirst({
        where: {
          spaceId,
          parentId: folderResolution.parentId,
          type: WikiNodeType.page,
          isArchived: false,
          title: pageTitle,
        },
        select: { id: true, title: true },
      });

      items.push({
        path: file.path,
        folderPath: folderResolution.path,
        fileName: file.name || this.fileNameFromPath(file.path),
        pageTitle,
        status: existingPage ? 'conflict' : 'new',
        existingPageId: existingPage?.id ?? null,
        existingPageTitle: existingPage?.title ?? null,
        suggestedResolution: existingPage ? 'skip' : 'replace',
      });
    }

    return { items };
  }

  private async importSingleFile(
    user: UserContext,
    spaceId: string,
    file: ObsidianImportFileDto,
    folderStrategy: 'preserve' | 'flat',
    previewItem: ImportPreviewItem,
    resolution: ObsidianConflictResolution | 'replace',
  ) {
    const targetFolder = await this.ensureFolderPath(spaceId, file.path, folderStrategy, user);
    const encoded = encodeMarkdownToYDoc(file.markdown);
    const originalTitle = encoded.title?.trim() || this.titleFromFileName(file.name || this.fileNameFromPath(file.path));
    const pageTitle =
      resolution === 'create_copy'
        ? await this.nextCopyTitle(spaceId, targetFolder.parentId, originalTitle)
        : originalTitle;

    if (previewItem.existingPageId && resolution === 'replace') {
      await this.prisma.wikiNode.update({
        where: { id: previewItem.existingPageId },
        data: {
          title: pageTitle,
          updatedBy: user.userId,
        },
      });

      const ydoc = this.decodeIntoDoc(encoded.value);
      try {
        await this.collabPersistenceService.storeDocument(previewItem.existingPageId, ydoc, { queueReindex: false });
      } finally {
        ydoc.destroy();
      }
      await this.collabPersistenceService.reindexPage(previewItem.existingPageId, encoded.value);

      return {
        path: file.path,
        action: 'replaced',
        pageId: previewItem.existingPageId,
        pageTitle,
        pageUrl: `/spaces/${spaceId}/pages/${previewItem.existingPageId}`,
      };
    }

    const created = await this.pagesService.createPage(
      {
        spaceId,
        parentNodeId: targetFolder.parentId ?? undefined,
        title: pageTitle,
        initialContent: {
          encoding: 'base64-yjs-update-v2',
          value: encoded.value,
        },
      },
      user,
    );

    const createdPageId = String(created.page.id);
    await this.collabPersistenceService.reindexPage(createdPageId, encoded.value);

    return {
      path: file.path,
      action: 'created',
      pageId: createdPageId,
      pageTitle,
      pageUrl: `/spaces/${spaceId}/pages/${createdPageId}`,
    };
  }

  private async ensureFolderPath(
    spaceId: string,
    filePath: string,
    folderStrategy: 'preserve' | 'flat',
    user: UserContext,
  ): Promise<FolderResolution> {
    if (folderStrategy === 'flat') {
      return { parentId: null, path: '' };
    }

    const parts = this.folderPartsFromPath(filePath);
    if (parts.length === 0) {
      return { parentId: null, path: '' };
    }

    let parentId: string | null = null;
    const resolvedParts: string[] = [];

    for (const part of parts) {
      const existing: { id: string; title: string } | null = await this.prisma.wikiNode.findFirst({
        where: {
          spaceId,
          parentId,
          type: WikiNodeType.folder,
          isArchived: false,
          title: part,
        },
        select: { id: true, title: true },
      });

      if (existing) {
        parentId = existing.id;
        resolvedParts.push(existing.title);
        continue;
      }

      const sibling: { position: number } | null = await this.prisma.wikiNode.findFirst({
        where: { spaceId, parentId, isArchived: false },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const created: { id: string; title: string } = await this.prisma.wikiNode.create({
        data: {
          spaceId,
          parentId,
          type: WikiNodeType.folder,
          title: part,
          icon: 'folder',
          position: sibling ? sibling.position + 1 : 0,
          createdBy: user.userId,
          updatedBy: user.userId,
        },
        select: { id: true, title: true },
      });
      parentId = created.id;
      resolvedParts.push(created.title);
    }

    return {
      parentId,
      path: resolvedParts.join('/'),
    };
  }

  private async loadFolderCache(spaceId: string) {
    const folders = await this.prisma.wikiNode.findMany({
      where: {
        spaceId,
        type: WikiNodeType.folder,
        isArchived: false,
      },
      select: {
        id: true,
        title: true,
        parentId: true,
      },
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });

    return folders;
  }

  private resolveFolderFromCache(
    folders: Array<{ id: string; title: string; parentId: string | null }>,
    filePath: string,
    folderStrategy: 'preserve' | 'flat',
  ): FolderResolution {
    if (folderStrategy === 'flat') {
      return { parentId: null, path: '' };
    }

    const parts = this.folderPartsFromPath(filePath);
    if (parts.length === 0) {
      return { parentId: null, path: '' };
    }

    let parentId: string | null = null;
    const resolvedParts: string[] = [];

    for (const part of parts) {
      const next = folders.find((folder) => folder.parentId === parentId && folder.title === part);
      if (!next) {
        break;
      }
      parentId = next.id;
      resolvedParts.push(next.title);
    }

    return {
      parentId: resolvedParts.length === parts.length ? parentId : null,
      path: parts.join('/'),
    };
  }

  private async nextCopyTitle(spaceId: string, parentId: string | null, title: string) {
    const siblings = await this.prisma.wikiNode.findMany({
      where: {
        spaceId,
        parentId,
        type: WikiNodeType.page,
        isArchived: false,
        title: {
          startsWith: title,
        },
      },
      select: { title: true },
    });
    const taken = new Set(siblings.map((item) => item.title));
    if (!taken.has(title)) {
      return title;
    }

    let index = 1;
    while (taken.has(`${title} (${index})`)) {
      index += 1;
    }

    return `${title} (${index})`;
  }

  private folderPartsFromPath(filePath: string): string[] {
    const normalized = filePath.replace(/\\/g, '/').trim();
    const parts = normalized.split('/').filter(Boolean);
    return parts.slice(0, Math.max(0, parts.length - 1));
  }

  private fileNameFromPath(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] ?? 'Untitled.md';
  }

  private titleFromFileName(fileName: string): string {
    return fileName.replace(/\.md$/i, '').trim() || 'Untitled';
  }

  private decodeIntoDoc(base64: string) {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, Buffer.from(base64, 'base64'));
    return ydoc;
  }
}
