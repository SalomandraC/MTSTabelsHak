import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Schema } from 'prosemirror-model';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
import * as Y from 'yjs';

import { UserContext } from 'src/auth/user-context';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { PagesService } from 'src/pages/pages.service';
import type { CreatePageDto } from 'src/pages/dto/create-page.dto';
import { templateCatalog, type PageTemplateDefinition, type ProseMirrorNode, type TemplateFieldDefinition } from './template-catalog';
import { renderTemplateDocument, renderTemplateString, buildTemplateValues } from './template-renderer';
import { InstantiateTemplateDto } from './dto/instantiate-template.dto';
import type { CreateTemplateDto } from './dto/create-template.dto';

type TemplateAccessLevel = 'private' | 'space' | 'public';
type TemplateSource = 'builtIn' | 'custom';

type TemplateSummary = {
  id: string;
  title: string;
  summary: string;
  category: string;
  audience: string;
  icon: string;
  fields: TemplateFieldDefinition[];
  accessLevel: TemplateAccessLevel;
  source: TemplateSource;
};

type TemplateDocument = ProseMirrorNode;

const SUPPORTED_NODE_TYPES = new Set([
  'doc',
  'rootblock',
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'text',
  'hardBreak',
  'templateVariable',
]);

const templateInstantiationSchema = new Schema({
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
    text: {
      group: 'inline',
    },
    hardBreak: {
      group: 'inline',
      inline: true,
      selectable: false,
      toDOM: () => ['br'],
    },
  },
});

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(
    private readonly pagesService: PagesService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.seedBuiltInTemplates();
  }

  async listTemplates(user: UserContext, spaceId?: string | null) {
    const customTemplates = await (this.prisma as any).pageTemplate.findMany({
      where: {
        OR: [
          { accessLevel: 'public' },
          { ownerUserId: user.userId },
          ...(spaceId ? [{ accessLevel: 'space', spaceId }] : []),
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      items: [
        ...(customTemplates as any[])
          .filter((template) => this.isTemplateVisibleToUser(template, user.userId, spaceId ?? null))
          .map((template) => this.toTemplateSummary(template)),
      ],
    };
  }

  async createTemplate(dto: CreateTemplateDto, user: UserContext) {
    const title = dto.title.trim();
    const summary = dto.summary?.trim() ?? '';
    const category = dto.category?.trim() ?? '';
    const document = this.sanitizeTemplateDocument(dto.document as TemplateDocument);
    const fields = this.extractTemplateFields(document);

    const created = await (this.prisma as any).pageTemplate.create({
      data: {
        spaceId: dto.spaceId,
        ownerUserId: user.userId,
        title,
        summary: summary || 'Шаблон, созданный из страницы',
        category: category || 'Мои шаблоны',
        icon: dto.icon?.trim() || 'sparkles',
        accessLevel: dto.accessLevel,
        pageTitleTemplate: dto.pageTitleTemplate?.trim() || title,
        fields,
        document,
      },
    });

    return {
      template: this.toTemplateSummary(created),
    };
  }

  async instantiateTemplate(templateId: string, dto: InstantiateTemplateDto, user: UserContext) {
    const template = await this.resolveTemplate(templateId, user, dto.spaceId);

    if (!template) {
      throw new NotFoundException('Шаблон не найден');
    }

    const values = buildTemplateValues(template, dto.values ?? {});
    const resolvedTitle = (dto.title?.trim() || renderTemplateString(template.pageTitleTemplate, values)).trim();
    const document = this.wrapInRootBlocks(renderTemplateDocument(template, values));
    const ydoc = prosemirrorJSONToYDoc(templateInstantiationSchema, document, 'default');
    const initialContent = this.toInitialContent(ydoc);

    const payload: CreatePageDto = {
      spaceId: dto.spaceId,
      parentNodeId: dto.parentNodeId,
      title: resolvedTitle || template.title,
      icon: 'doc',
      initialContent,
    };

    return this.pagesService.createPage(payload, user);
  }

  private async resolveTemplate(templateId: string, user: UserContext, spaceId?: string | null): Promise<PageTemplateDefinition | null> {
    const custom = await (this.prisma as any).pageTemplate.findUnique({ where: { id: templateId } });
    if (!custom || !this.isTemplateVisibleToUser(custom, user.userId, spaceId ?? null)) {
      const builtIn = templateCatalog.find((item) => item.id === templateId);
      return builtIn ?? null;
    }

    return {
      id: custom.id,
      title: custom.title,
      summary: custom.summary,
      category: custom.category,
      audience: this.getAccessLabel(custom.accessLevel as TemplateAccessLevel),
      icon: custom.icon,
      pageTitleTemplate: custom.pageTitleTemplate,
      fields: custom.fields as TemplateFieldDefinition[],
      document: custom.document as TemplateDocument,
    };
  }

  private async seedBuiltInTemplates() {
    const existingTemplates = await (this.prisma as any).pageTemplate.findMany({
      where: {
        id: {
          in: templateCatalog.map((template) => template.id),
        },
      },
      select: { id: true },
    });

    const existingIds = new Set<string>((existingTemplates as Array<{ id: string }>).map((template) => template.id));
    const templatesToCreate = templateCatalog.filter((template) => !existingIds.has(template.id));

    if (templatesToCreate.length === 0) {
      return;
    }

    await (this.prisma as any).pageTemplate.createMany({
      data: templatesToCreate.map((template) => ({
        id: template.id,
        spaceId: 'demo-space',
        ownerUserId: 'system',
        title: template.title,
        summary: template.summary,
        category: template.category,
        icon: template.icon,
        accessLevel: 'public',
        pageTitleTemplate: template.pageTitleTemplate,
        fields: template.fields,
        document: template.document,
      })),
      skipDuplicates: true,
    });
  }

  private isTemplateVisibleToUser(template: { ownerUserId: string; spaceId: string; accessLevel: TemplateAccessLevel }, userId: string, spaceId: string | null) {
    if (template.accessLevel === 'public') {
      return true;
    }

    if (template.accessLevel === 'space') {
      return Boolean(spaceId && template.spaceId === spaceId);
    }

    return template.ownerUserId === userId && (!spaceId || template.spaceId === spaceId);
  }

  private toTemplateSummary(template: {
    id: string;
    title: string;
    summary: string;
    category: string;
    icon: string;
    accessLevel: TemplateAccessLevel;
    fields: unknown;
    document: unknown;
  }): TemplateSummary {
    const builtIn = templateCatalog.find((item) => item.id === template.id);

    return {
      id: template.id,
      title: template.title,
      summary: template.summary,
      category: template.category,
      audience: builtIn?.audience ?? this.getAccessLabel(template.accessLevel),
      icon: template.icon,
      fields: Array.isArray(template.fields) ? (template.fields as TemplateFieldDefinition[]) : [],
      accessLevel: template.accessLevel,
      source: builtIn ? 'builtIn' : 'custom',
    };
  }

  private getAccessLabel(accessLevel: TemplateAccessLevel) {
    switch (accessLevel) {
      case 'private':
        return 'Только мне';
      case 'space':
        return 'В пространстве';
      case 'public':
        return 'Всем';
      default:
        return 'Только мне';
    }
  }

  private sanitizeTemplateDocument(document: TemplateDocument): TemplateDocument {
    return this.normalizeTemplateNode(document) ?? { type: 'doc', content: [] };
  }

  private normalizeTemplateNode(node: TemplateDocument): TemplateDocument | null {
    if (!node || typeof node !== 'object') {
      return null;
    }

    if (node.type === 'doc' || node.type === 'rootblock' || SUPPORTED_NODE_TYPES.has(node.type)) {
      const content = Array.isArray(node.content)
        ? node.content
            .flatMap((child) => {
              const normalizedChild = this.normalizeTemplateNode(child);
              if (!normalizedChild) {
                return [];
              }

              if (Array.isArray(normalizedChild.content) && normalizedChild.type !== 'doc') {
                return [normalizedChild];
              }

              return [normalizedChild];
            })
        : undefined;

      return content ? { ...node, content } : { ...node };
    }

    if (Array.isArray(node.content)) {
      const flattened = node.content
        .flatMap((child) => {
          const normalizedChild = this.normalizeTemplateNode(child);
          return normalizedChild ? [normalizedChild] : [];
        })
        .filter((child): child is TemplateDocument => Boolean(child));

      if (flattened.length === 0) {
        return null;
      }

      return {
        type: 'doc',
        content: flattened,
      };
    }

    if (typeof node.text === 'string' && node.text.length > 0) {
      return { type: 'text', text: node.text };
    }

    return null;
  }

  private extractTemplateFields(document: TemplateDocument): TemplateFieldDefinition[] {
    const seen = new Map<string, TemplateFieldDefinition>();

    const visit = (node: TemplateDocument) => {
      if (!node || typeof node !== 'object') {
        return;
      }

      if (node.type === 'templateVariable') {
        const rawKey = typeof node.attrs?.key === 'string' ? node.attrs.key.trim() : '';
        const label = typeof node.attrs?.label === 'string' && node.attrs.label.trim().length > 0
          ? node.attrs.label.trim()
          : rawKey;
        const description = typeof node.attrs?.description === 'string' ? node.attrs.description.trim() : '';
        const key = rawKey || this.normalizeTemplateKey(label);

        if (key && !seen.has(key)) {
          seen.set(key, {
            key,
            label: label || key,
            description,
            kind: 'text',
            required: true,
          });
        }
      }

      if (Array.isArray(node.content)) {
        node.content.forEach((child) => visit(child as TemplateDocument));
      }
    };

    visit(document);
    return [...seen.values()];
  }

  private normalizeTemplateKey(label: string) {
    return label
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || `template_${Math.random().toString(16).slice(2, 8)}`;
  }

  private toInitialContent(ydoc: Y.Doc) {
    return {
      encoding: 'base64-yjs-update-v2',
      value: Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64'),
    };
  }

  private wrapInRootBlocks(document: Record<string, any>) {
    const content = Array.isArray(document?.content) ? document.content : [];
    const wrapped = content
      .filter((node) => node && typeof node === 'object')
      .map((node) => {
        if (node.type === 'rootblock') {
          return node;
        }

        return {
          type: 'rootblock',
          content: [node],
        };
      });

    return {
      type: 'doc',
      content: wrapped.length > 0
        ? wrapped
        : [{ type: 'rootblock', content: [{ type: 'paragraph', content: [] }] }],
    };
  }
}
