import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Schema } from 'prosemirror-model';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
import * as Y from 'yjs';

import { UserContext } from 'src/auth/user-context';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { PagesService } from 'src/pages/pages.service';
import type { CreatePageDto } from 'src/pages/dto/create-page.dto';
import { templateCatalog, type PageTemplateDefinition, type ProseMirrorNode, type TemplateFieldDefinition } from './template-catalog';
import { templateCategoryCatalog } from './template-categories';
import { renderTemplateDocument, renderTemplateString, buildTemplateValues } from './template-renderer';
import { InstantiateTemplateDto } from './dto/instantiate-template.dto';
import type { CreateTemplateDto } from './dto/create-template.dto';
import type { UpdateTemplateDto } from './dto/update-template.dto';

type TemplateAccessLevel = 'private' | 'space' | 'public';
type TemplateSource = 'builtIn' | 'custom';
type TemplateListScope = 'all' | 'mine' | 'space';
type TemplateListSort = 'relevance' | 'newest' | 'popular';

type TemplateSummary = {
  id: string;
  title: string;
  summary: string;
  categoryId: string;
  category: string;
  audience: string;
  icon: string;
  fields: TemplateFieldDefinition[];
  accessLevel: TemplateAccessLevel;
  source: TemplateSource;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
  canManage: boolean;
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
    await this.backfillTemplateCategoryIds();
  }

  async listTemplates(
    user: UserContext,
    options: {
      spaceId?: string | null;
      scope?: TemplateListScope;
      sort?: TemplateListSort;
      search?: string;
      categoryId?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const {
      spaceId = null,
      scope = 'all',
      sort = 'relevance',
      search = '',
      categoryId,
      page = 1,
      pageSize = 20,
    } = options;

    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safePageSize = Number.isFinite(pageSize) ? Math.min(50, Math.max(1, Math.floor(pageSize))) : 20;
    const normalizedSearch = search.trim();

    const visibilityFilter = this.buildVisibilityWhere(scope, user.userId, spaceId);
    const whereClauses = [
      visibilityFilter,
      ...(categoryId ? [{ categoryId }] : []),
      ...(normalizedSearch
        ? [
            {
              OR: [
                { title: { contains: normalizedSearch, mode: 'insensitive' } },
                { summary: { contains: normalizedSearch, mode: 'insensitive' } },
                { categoryLegacy: { contains: normalizedSearch, mode: 'insensitive' } },
                { category: { title: { contains: normalizedSearch, mode: 'insensitive' } } },
              ],
            },
          ]
        : []),
    ];
    const where = { AND: whereClauses };

    const orderBy =
      sort === 'popular'
        ? [{ usageCount: 'desc' }, { updatedAt: 'desc' }]
        : sort === 'newest'
          ? [{ createdAt: 'desc' }]
          : [{ updatedAt: 'desc' }, { createdAt: 'desc' }];

    const [templates, total] = await Promise.all([
      (this.prisma as any).pageTemplate.findMany({
        where,
        include: {
          category: true,
        },
        orderBy,
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      (this.prisma as any).pageTemplate.count({ where }),
    ]);

    return {
      items: [
        ...(templates as any[])
          .filter((template) => this.isTemplateVisibleToUser(template, user.userId, spaceId ?? null))
          .map((template) => this.toTemplateSummary(template, user.userId)),
      ],
      pageInfo: {
        page: safePage,
        pageSize: safePageSize,
        total,
        hasNextPage: safePage * safePageSize < total,
      },
    };
  }

  private buildVisibilityWhere(scope: TemplateListScope, userId: string, spaceId: string | null) {
    if (scope === 'mine') {
      return {
        ownerUserId: userId,
      };
    }

    if (scope === 'space') {
      if (!spaceId) {
        return {
          id: '__none__',
        };
      }

      return {
        accessLevel: 'space',
        spaceId,
      };
    }

    return {
      OR: [
        { accessLevel: 'public' },
        { ownerUserId: userId },
        ...(spaceId ? [{ accessLevel: 'space', spaceId }] : []),
      ],
    };
  }

  async listCategories() {
    const categories = await (this.prisma as any).templateCategory.findMany({
      orderBy: { title: 'asc' },
    });

    return {
      items: (categories as Array<{ id: string; title: string }>).map((category) => ({
        id: category.id,
        title: category.title,
      })),
    };
  }

  async createTemplate(dto: CreateTemplateDto, user: UserContext) {
    const title = dto.title.trim();
    const summary = dto.summary?.trim() ?? '';
    const category = await this.resolveCategoryById(dto.categoryId);
    const document = this.sanitizeTemplateDocument(dto.document as TemplateDocument);
    const fields = this.extractTemplateFields(document);

    const created = await (this.prisma as any).pageTemplate.create({
      data: {
        spaceId: dto.spaceId,
        ownerUserId: user.userId,
        title,
        summary: summary || 'Шаблон, созданный из страницы',
        categoryLegacy: category.title,
        categoryId: category.id,
        icon: dto.icon?.trim() || 'sparkles',
        accessLevel: dto.accessLevel,
        pageTitleTemplate: dto.pageTitleTemplate?.trim() || title,
        fields,
        document,
      },
      include: {
        category: true,
      },
    });

    return {
      template: this.toTemplateSummary(created, user.userId),
    };
  }

  async updateTemplate(templateId: string, dto: UpdateTemplateDto, user: UserContext) {
    const existing = await this.ensureMutableTemplate(templateId, user.userId);

    const nextCategoryId = dto.categoryId ? (await this.resolveCategoryById(dto.categoryId)).id : existing.categoryId;
    const nextDocument = dto.document ? this.sanitizeTemplateDocument(dto.document as TemplateDocument) : null;
    const nextFields = nextDocument ? this.extractTemplateFields(nextDocument) : undefined;

    const updated = await (this.prisma as any).pageTemplate.update({
      where: { id: templateId },
      data: {
        title: dto.title?.trim() || existing.title,
        summary: dto.summary !== undefined ? dto.summary.trim() : existing.summary,
        categoryLegacy: dto.categoryId ? (await this.resolveCategoryById(dto.categoryId)).title : existing.categoryLegacy,
        categoryId: nextCategoryId,
        icon: dto.icon?.trim() || existing.icon,
        accessLevel: dto.accessLevel ?? existing.accessLevel,
        pageTitleTemplate: dto.pageTitleTemplate?.trim() || existing.pageTitleTemplate,
        ...(nextDocument ? { document: nextDocument, fields: nextFields ?? [] } : {}),
      },
      include: {
        category: true,
      },
    });

    return {
      template: this.toTemplateSummary(updated, user.userId),
    };
  }

  async deleteTemplate(templateId: string, user: UserContext) {
    const existing = await this.ensureMutableTemplate(templateId, user.userId);

    await (this.prisma as any).pageTemplate.delete({
      where: { id: existing.id },
    });
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

    return this.prisma.$transaction(async (tx) => {
      const createdPage = await this.pagesService.createPage(payload, user, tx);

      await (tx as any).pageTemplate.updateMany({
        where: { id: templateId },
        data: {
          usageCount: { increment: 1 },
        },
      });

      return createdPage;
    });
  }

  private async resolveTemplate(templateId: string, user: UserContext, spaceId?: string | null): Promise<PageTemplateDefinition | null> {
    const custom = await (this.prisma as any).pageTemplate.findUnique({
      where: { id: templateId },
      include: {
        category: true,
      },
    });
    if (!custom || !this.isTemplateVisibleToUser(custom, user.userId, spaceId ?? null)) {
      const builtIn = templateCatalog.find((item) => item.id === templateId);
      return builtIn ?? null;
    }

    return {
      id: custom.id,
      title: custom.title,
      summary: custom.summary,
      category: custom.category?.title ?? 'Без категории',
      audience: this.getAccessLabel(custom.accessLevel as TemplateAccessLevel),
      icon: custom.icon,
      pageTitleTemplate: custom.pageTitleTemplate,
      fields: custom.fields as TemplateFieldDefinition[],
      document: custom.document as TemplateDocument,
    };
  }

  private async seedBuiltInTemplates() {
    await this.seedTemplateCategories();

    const categories = await (this.prisma as any).templateCategory.findMany({
      select: { id: true, title: true },
    });
    const categoryIdByTitle = new Map<string, string>(
      (categories as Array<{ id: string; title: string }>).map((category) => [category.title, category.id]),
    );

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
        categoryLegacy: template.category,
        categoryId: categoryIdByTitle.get(template.category) ?? categoryIdByTitle.values().next().value,
        icon: template.icon,
        accessLevel: 'public',
        pageTitleTemplate: template.pageTitleTemplate,
        fields: template.fields,
        document: template.document,
        usageCount: 0,
      })),
      skipDuplicates: true,
    });
  }

  private async seedTemplateCategories() {
    const existingCategories = await (this.prisma as any).templateCategory.findMany({
      select: { title: true },
    });

    const existingTitles = new Set<string>((existingCategories as Array<{ title: string }>).map((category) => category.title));
    const categoriesToCreate = templateCategoryCatalog.filter((category) => !existingTitles.has(category.title));

    if (categoriesToCreate.length === 0) {
      return;
    }

    await (this.prisma as any).templateCategory.createMany({
      data: categoriesToCreate.map((category) => ({
        title: category.title,
      })),
      skipDuplicates: true,
    });
  }

  private async backfillTemplateCategoryIds() {
    const templatesWithoutCategory = await (this.prisma as any).pageTemplate.findMany({
      where: {
        categoryId: null,
      },
      select: {
        id: true,
        categoryLegacy: true,
      },
    });

    if ((templatesWithoutCategory as any[]).length === 0) {
      return;
    }

    const missingTitles = Array.from(
      new Set(
        (templatesWithoutCategory as Array<{ categoryLegacy: string | null }>)
          .map((template) => template.categoryLegacy?.trim() ?? '')
          .filter((title) => title.length > 0),
      ),
    );

    if (missingTitles.length > 0) {
      await (this.prisma as any).templateCategory.createMany({
        data: missingTitles.map((title) => ({ title })),
        skipDuplicates: true,
      });
    }

    const allCategories = await (this.prisma as any).templateCategory.findMany({
      select: { id: true, title: true },
    });
    const categoryByTitle = new Map<string, string>(
      (allCategories as Array<{ id: string; title: string }>).map((category) => [category.title, category.id]),
    );
    const fallbackCategoryId = categoryByTitle.get('Документы') ?? (allCategories as Array<{ id: string }>)[0]?.id;

    if (!fallbackCategoryId) {
      return;
    }

    await Promise.all(
      (templatesWithoutCategory as Array<{ id: string; categoryLegacy: string | null }>).map((template) => {
        const resolvedCategoryId = template.categoryLegacy
          ? categoryByTitle.get(template.categoryLegacy) ?? fallbackCategoryId
          : fallbackCategoryId;

        return (this.prisma as any).pageTemplate.update({
          where: { id: template.id },
          data: {
            categoryId: resolvedCategoryId,
          },
        });
      }),
    );
  }

  private async resolveCategoryById(categoryId: string) {
    const category = await (this.prisma as any).templateCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new BadRequestException('Выбранная категория шаблона не найдена');
    }

    return category as { id: string; title: string };
  }

  private async ensureMutableTemplate(templateId: string, userId: string) {
    const template = await (this.prisma as any).pageTemplate.findUnique({
      where: { id: templateId },
      include: {
        category: true,
      },
    });

    if (!template) {
      throw new NotFoundException('Шаблон не найден');
    }

    if (template.ownerUserId !== userId || this.isBuiltInTemplate(template.id)) {
      throw new ForbiddenException('Шаблон нельзя изменять');
    }

    return template as any;
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
    categoryLegacy: string;
    categoryId: string;
    icon: string;
    accessLevel: TemplateAccessLevel;
    usageCount: number;
    createdAt: Date;
    updatedAt: Date;
    ownerUserId: string;
    fields: unknown;
    document: unknown;
    category?: { id: string; title: string } | null;
  }, userId: string): TemplateSummary {
    const builtIn = templateCatalog.find((item) => item.id === template.id);

    return {
      id: template.id,
      title: template.title,
      summary: template.summary,
      categoryId: template.categoryId,
      category: template.category?.title ?? template.categoryLegacy ?? builtIn?.category ?? 'Без категории',
      audience: builtIn?.audience ?? this.getAccessLabel(template.accessLevel),
      icon: template.icon,
      fields: Array.isArray(template.fields) ? (template.fields as TemplateFieldDefinition[]) : [],
      accessLevel: template.accessLevel,
      source: builtIn ? 'builtIn' : 'custom',
      usageCount: Number(template.usageCount ?? 0),
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      canManage: template.ownerUserId === userId && !builtIn,
    };
  }

  private isBuiltInTemplate(templateId: string) {
    return templateCatalog.some((item) => item.id === templateId);
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
