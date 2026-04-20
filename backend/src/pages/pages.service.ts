import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WikiNodeType } from '@prisma/client';
import { Schema } from 'prosemirror-model';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror';
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

const LIVE_REFERENCE_TOKEN = /^\[Ref:([^:\]\s]+):([^:\]\s]+):([^:\]\s]+)\]$/;
const SUPPORTED_AI_MARKS = new Set(['bold']);

function splitMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return null;
  }

  const normalized = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutTrailingPipe = normalized.endsWith('|') ? normalized.slice(0, -1) : normalized;
  const cells = withoutTrailingPipe.split('|').map((cell) => cell.trim());

  return cells.length > 1 ? cells : null;
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  if (!cells || cells.length === 0) {
    return false;
  }

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

const aiGeneratedPageSchema = new Schema({
  nodes: {
    doc: {
      content: 'rootblock+',
    },
    rootblock: {
      group: 'rootblock',
      content: 'block',
      toDOM: () => ['div', { 'data-type': 'rootblock' }, 0],
    },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: {
        level: { default: 1 },
      },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
      toDOM: () => ['ul', 0],
    },
    orderedList: {
      group: 'block',
      content: 'listItem+',
      toDOM: () => ['ol', 0],
    },
    listItem: {
      group: 'block',
      content: 'paragraph+',
      toDOM: () => ['li', 0],
    },
    blockquote: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['blockquote', 0],
    },
    table: {
      group: 'block',
      content: 'tableRow+',
      toDOM: () => ['table', ['tbody', 0]],
    },
    tableRow: {
      content: '(tableCell|tableHeader)+',
      toDOM: () => ['tr', 0],
    },
    tableCell: {
      content: 'paragraph+',
      toDOM: () => ['td', 0],
    },
    tableHeader: {
      content: 'paragraph+',
      toDOM: () => ['th', 0],
    },
    text: {
      group: 'inline',
    },
    hardBreak: {
      group: 'inline',
      inline: true,
      selectable: false,
      toDOM: () => ['br'],
    },
    liveReference: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        spaceId: { default: '' },
        datasheetId: { default: '' },
        recordId: { default: '' },
        fieldId: { default: '' },
        label: { default: '' },
      },
      toDOM: (node) => [
        'span',
        {
          'data-type': 'live-reference',
          'data-space-id': String(node.attrs.spaceId ?? ''),
          'data-datasheet-id': String(node.attrs.datasheetId ?? ''),
          'data-record-id': String(node.attrs.recordId ?? ''),
          'data-field-id': String(node.attrs.fieldId ?? ''),
          'data-label': String(node.attrs.label ?? ''),
        },
        0,
      ],
    },
    liveFormula: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        spaceId: { default: '' },
        expression: { default: '' },
      },
      toDOM: (node) => [
        'span',
        {
          'data-type': 'live-formula',
          'data-space-id': String(node.attrs.spaceId ?? ''),
          'data-expression': String(node.attrs.expression ?? ''),
        },
        0,
      ],
    },
  },
  marks: {
    bold: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b', getAttrs: () => null }],
      toDOM: () => ['strong', 0],
    },
  },
});

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

  async createPageForAiReport(
    input: {
      workspaceId: string;
      title: string;
      content?: Record<string, unknown> | string;
      parentNodeId?: string;
      icon?: string;
    },
    user: UserContext,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const initialContent = this.buildInitialContentFromAiPayload(input.content);

    const created = await this.createPage(
      {
        spaceId: input.workspaceId,
        title: input.title,
        parentNodeId: input.parentNodeId,
        icon: input.icon ?? 'doc',
        initialContent,
      },
      user,
      db,
    );

    return {
      status: 'created' as const,
      pageId: created.page.id,
      title: created.page.title,
      pageLink: `/pages/${created.page.id}`,
      pageUrl: `/spaces/${input.workspaceId}/pages/${created.page.id}`,
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

  private buildInitialContentFromAiPayload(content?: Record<string, unknown> | string) {
    if (!content) {
      return undefined;
    }

    const normalizedDoc = this.normalizeAiContentToDoc(content);
    const schemaSafeDoc = this.stripUnsupportedMarks(normalizedDoc) as Record<string, unknown>;
    const ydoc = prosemirrorJSONToYDoc(aiGeneratedPageSchema, schemaSafeDoc, 'default');
    const encoded = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
    ydoc.destroy();

    return {
      encoding: 'base64-yjs-update-v2',
      value: encoded,
    };
  }

  private normalizeAiContentToDoc(content: Record<string, unknown> | string): Record<string, unknown> {
    if (typeof content === 'string') {
      return this.markdownToAiDoc(content);
    }

    const asRecord = content as Record<string, unknown>;
    if (asRecord.type === 'doc' && Array.isArray(asRecord.content)) {
      return this.wrapInRootBlocks(asRecord);
    }

    if (Array.isArray(asRecord.content)) {
      return this.wrapInRootBlocks({
        type: 'doc',
        content: asRecord.content,
      });
    }

    return this.markdownToAiDoc(JSON.stringify(content));
  }

  private markdownToAiDoc(markdown: string): Record<string, unknown> {
    const normalized = String(markdown ?? '').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const blocks: Array<Record<string, unknown>> = [];
    const paragraphBuffer: string[] = [];

    const flushParagraph = () => {
      const text = paragraphBuffer.join(' ').trim();
      paragraphBuffer.length = 0;
      if (!text) {
        return;
      }

      blocks.push({
        type: 'paragraph',
        content: this.parseInlineAiTokens(text),
      });
    };

    let index = 0;
    while (index < lines.length) {
      const rawLine = lines[index];
      const line = rawLine.trim();

      if (!line) {
        flushParagraph();
        index += 1;
        continue;
      }

      const headerCells = splitMarkdownTableRow(rawLine);
      const separatorLine = lines[index + 1];
      if (headerCells && separatorLine && isMarkdownTableSeparator(separatorLine)) {
        flushParagraph();

        const rows: Array<Record<string, unknown>> = [
          {
            type: 'tableRow',
            content: headerCells.map((cell) => ({
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: this.parseInlineAiTokens(cell) }],
            })),
          },
        ];

        index += 2;
        while (index < lines.length) {
          const rowLine = lines[index];
          const rowTrimmed = rowLine.trim();
          if (!rowTrimmed) {
            break;
          }

          const rowCells = splitMarkdownTableRow(rowLine);
          if (!rowCells || isMarkdownTableSeparator(rowLine)) {
            break;
          }

          rows.push({
            type: 'tableRow',
            content: rowCells.map((cell) => ({
              type: 'tableCell',
              content: [{ type: 'paragraph', content: this.parseInlineAiTokens(cell) }],
            })),
          });
          index += 1;
        }

        blocks.push({
          type: 'table',
          content: rows,
        });
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph();
        blocks.push({
          type: 'heading',
          attrs: { level: headingMatch[1].length },
          content: this.parseInlineAiTokens(headingMatch[2].trim()),
        });
        index += 1;
        continue;
      }

      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        flushParagraph();
        const items: Array<Record<string, unknown>> = [];
        while (index < lines.length) {
          const current = lines[index].trim();
          const match = current.match(/^[-*]\s+(.+)$/);
          if (!match) {
            break;
          }
          const itemText = match[1].trim() || 'Данные не указаны';
          items.push({
            type: 'listItem',
            content: [{
              type: 'paragraph',
              content: this.parseInlineAiTokens(itemText),
            }],
          });
          index += 1;
        }

        if (items.length > 0) {
          blocks.push({ type: 'bulletList', content: items });
          continue;
        }
      }

      const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
      if (orderedMatch) {
        flushParagraph();
        const items: Array<Record<string, unknown>> = [];
        while (index < lines.length) {
          const current = lines[index].trim();
          const match = current.match(/^\d+\.\s+(.+)$/);
          if (!match) {
            break;
          }
          const itemText = match[1].trim() || 'Данные не указаны';
          items.push({
            type: 'listItem',
            content: [{
              type: 'paragraph',
              content: this.parseInlineAiTokens(itemText),
            }],
          });
          index += 1;
        }

        if (items.length > 0) {
          blocks.push({ type: 'orderedList', content: items });
          continue;
        }
      }

      paragraphBuffer.push(line);
      index += 1;
    }

    flushParagraph();

    return this.wrapInRootBlocks({
      type: 'doc',
      content: blocks,
    });
  }

  private parseInlineAiTokens(text: string): Array<Record<string, unknown>> {
    const value = String(text ?? '');
    const parts: Array<Record<string, unknown>> = [];
    let cursor = 0;
    let buffer = '';
    let isBold = false;

    const flushBuffer = () => {
      if (!buffer) {
        return;
      }

      if (isBold) {
        parts.push({ type: 'text', text: buffer, marks: [{ type: 'bold' }] });
      } else {
        parts.push({ type: 'text', text: buffer });
      }

      buffer = '';
    };

    while (cursor < value.length) {
      const nextRef = value.indexOf('[Ref:', cursor);
      const nextFormula = value.indexOf('[Formula:', cursor);
      const nextBold = value.indexOf('**', cursor);
      const candidates = [nextRef, nextFormula, nextBold].filter((idx) => idx >= 0);
      const nextTokenStart = candidates.length > 0 ? Math.min(...candidates) : -1;

      if (nextTokenStart < 0) {
        buffer += value.slice(cursor);
        break;
      }

      if (nextTokenStart > cursor) {
        buffer += value.slice(cursor, nextTokenStart);
      }

      if (value.startsWith('**', nextTokenStart)) {
        flushBuffer();
        isBold = !isBold;
        cursor = nextTokenStart + 2;
        continue;
      }

      flushBuffer();

      if (value.startsWith('[Ref:', nextTokenStart)) {
        const end = value.indexOf(']', nextTokenStart);
        if (end > nextTokenStart) {
          const token = value.slice(nextTokenStart, end + 1);
          const match = token.match(LIVE_REFERENCE_TOKEN);
          if (match) {
            const [, datasheetId, recordId, fieldId] = match;
            parts.push({
              type: 'liveReference',
              attrs: {
                spaceId: '',
                datasheetId,
                recordId,
                fieldId,
                label: `${recordId} / ${fieldId}`,
              },
            });
            cursor = end + 1;
            continue;
          }
        }
      }

      if (value.startsWith('[Formula:', nextTokenStart)) {
        const token = this.extractFormulaToken(value, nextTokenStart);
        if (token) {
          parts.push({
            type: 'liveFormula',
            attrs: {
              spaceId: '',
              expression: token.expression,
            },
          });
          cursor = token.end;
          continue;
        }
      }

      buffer += value.slice(nextTokenStart, nextTokenStart + 1);
      cursor = nextTokenStart + 1;
    }

    flushBuffer();

    return parts.length > 0 ? parts : [{ type: 'text', text: value }];
  }

  private stripUnsupportedMarks(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.stripUnsupportedMarks(item));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(input)) {
      if (key === 'marks' && Array.isArray(raw)) {
        output.marks = raw
          .filter((mark) => {
            if (!mark || typeof mark !== 'object') {
              return false;
            }

            const type = (mark as Record<string, unknown>).type;
            return typeof type === 'string' && SUPPORTED_AI_MARKS.has(type);
          })
          .map((mark) => this.stripUnsupportedMarks(mark));
        continue;
      }

      output[key] = this.stripUnsupportedMarks(raw);
    }

    return output;
  }

  private extractFormulaToken(text: string, from: number): { expression: string; end: number } | null {
    const prefix = '[Formula:';
    if (!text.startsWith(prefix, from)) {
      return null;
    }

    let depth = 1;
    let index = from + 1;

    while (index < text.length) {
      const char = text[index];
      if (char === '[') {
        depth += 1;
      } else if (char === ']') {
        depth -= 1;
        if (depth === 0) {
          return {
            expression: text.slice(from + prefix.length, index).trim(),
            end: index + 1,
          };
        }
      }
      index += 1;
    }

    return null;
  }

  private wrapInRootBlocks(document: Record<string, unknown>): Record<string, unknown> {
    const content = Array.isArray(document.content) ? document.content : [];
    const wrapped = content
      .filter((node) => node && typeof node === 'object')
      .map((node) => {
        const typedNode = node as Record<string, unknown>;
        if (typedNode.type === 'rootblock') {
          return typedNode;
        }

        return {
          type: 'rootblock',
          content: [typedNode],
        };
      });

    return {
      type: 'doc',
      content:
        wrapped.length > 0
          ? wrapped
          : [{ type: 'rootblock', content: [{ type: 'paragraph', content: [] }] }],
    };
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
