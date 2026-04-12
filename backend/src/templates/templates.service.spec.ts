import { yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';

import { TemplatesService } from './templates.service';

describe('TemplatesService', () => {
  const pagesService = {
    createPage: jest.fn(async (payload: any) => ({
      page: {
        id: 'page-1',
        title: payload.title,
      },
    })),
  };

  const prisma: any = {
    pageTemplate: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      createMany: jest.fn(),
    },
    templateCategory: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      createMany: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => Promise<any>) => callback(prisma));

  const service = new TemplatesService(pagesService as any, prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.pageTemplate.count.mockResolvedValue(0);
  });

  it('instantiates template with substituted values in default Yjs fragment', async () => {
    prisma.pageTemplate.findUnique.mockResolvedValue(null);

    await service.instantiateTemplate(
      'mts-resume',
      {
        spaceId: 'space-1',
        values: {
          fullName: 'Иван Иванов',
          position: 'Frontend Engineer',
          city: 'Москва',
          experience: '5 лет в продуктовой разработке',
          skills: 'React, TypeScript, Tiptap',
          motivation: 'Хочу развивать клиентские продукты МТС',
        },
      } as any,
      { userId: 'user-1', displayName: 'Demo User' } as any,
    );

    expect(pagesService.createPage).toHaveBeenCalledTimes(1);

    const payload = pagesService.createPage.mock.calls[0][0];
    expect(payload.initialContent?.value).toBeTruthy();

    const update = Buffer.from(payload.initialContent.value, 'base64');
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(update));

    const json = yDocToProsemirrorJSON(ydoc, 'default') as Record<string, any>;
    const serialized = JSON.stringify(json);

    expect(serialized).toContain('Иван Иванов');
    expect(serialized).toContain('Frontend Engineer');
    expect(serialized).not.toContain('templateVariable');
    expect(prisma.pageTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: 'mts-resume' },
      data: { usageCount: { increment: 1 } },
    });
  });

  it('returns built-in templates plus visible custom templates', async () => {
    prisma.pageTemplate.findMany.mockResolvedValue([
      {
        id: 'mts-resume',
        spaceId: 'demo-space',
        ownerUserId: 'system',
        title: 'Резюме в компанию МТС',
        summary: 'Быстрый шаблон резюме с акцентом на опыт, навыки и мотивацию для отклика в МТС.',
        categoryId: 'cat-career',
        category: { id: 'cat-career', title: 'Карьера' },
        icon: 'briefcase',
        accessLevel: 'public',
        usageCount: 5,
        pageTitleTemplate: 'Резюме - {{fullName}} - МТС',
        fields: [],
        document: { type: 'doc', content: [] },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'tpl-private',
        spaceId: 'space-1',
        ownerUserId: 'user-1',
        title: 'Личный шаблон',
        summary: 'Only mine',
        categoryId: 'cat-personal',
        category: { id: 'cat-personal', title: 'База знаний' },
        icon: 'sparkles',
        accessLevel: 'private',
        usageCount: 2,
        pageTitleTemplate: 'Личный шаблон',
        fields: [],
        document: { type: 'doc', content: [] },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'tpl-space',
        spaceId: 'space-1',
        ownerUserId: 'user-2',
        title: 'Шаблон пространства',
        summary: 'Visible in space',
        categoryId: 'cat-team',
        category: { id: 'cat-team', title: 'Командная работа' },
        icon: 'sparkles',
        accessLevel: 'space',
        usageCount: 8,
        pageTitleTemplate: 'Шаблон пространства',
        fields: [],
        document: { type: 'doc', content: [] },
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: 'tpl-public',
        spaceId: 'space-2',
        ownerUserId: 'user-2',
        title: 'Публичный шаблон',
        summary: 'Visible everywhere',
        categoryId: 'cat-docs',
        category: { id: 'cat-docs', title: 'Документы' },
        icon: 'sparkles',
        accessLevel: 'public',
        usageCount: 1,
        pageTitleTemplate: 'Публичный шаблон',
        fields: [],
        document: { type: 'doc', content: [] },
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      },
      {
        id: 'tpl-hidden',
        spaceId: 'space-2',
        ownerUserId: 'user-3',
        title: 'Скрытый шаблон',
        summary: 'Should not be visible',
        categoryId: 'cat-hidden',
        category: { id: 'cat-hidden', title: 'Финансы' },
        icon: 'sparkles',
        accessLevel: 'private',
        usageCount: 0,
        pageTitleTemplate: 'Скрытый шаблон',
        fields: [],
        document: { type: 'doc', content: [] },
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
        updatedAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    ]);

    const result = await service.listTemplates(
      { userId: 'user-1', displayName: 'Demo User' } as any,
      { spaceId: 'space-1' },
    );

    expect(result.items.some((item) => item.id === 'mts-resume')).toBe(true);
    expect(result.items.some((item) => item.id === 'tpl-private')).toBe(true);
    expect(result.items.some((item) => item.id === 'tpl-space')).toBe(true);
    expect(result.items.some((item) => item.id === 'tpl-public')).toBe(true);
    expect(result.items.some((item) => item.id === 'tpl-hidden')).toBe(false);
    expect(result.items.find((item) => item.id === 'mts-resume')?.source).toBe('builtIn');
    expect(result.items.find((item) => item.id === 'tpl-private')?.canManage).toBe(true);
  });

  it('seeds built-in templates on module init', async () => {
    prisma.templateCategory.findMany.mockResolvedValue([
      { id: 'cat-career', title: 'Карьера' },
      { id: 'cat-docs', title: 'Документы' },
      { id: 'cat-team', title: 'Командная работа' },
    ]);
    prisma.templateCategory.createMany.mockResolvedValue({ count: 20 });
    prisma.pageTemplate.findMany.mockResolvedValue([]);
    prisma.pageTemplate.createMany.mockResolvedValue({ count: 3 });

    await service.onModuleInit();

    expect(prisma.templateCategory.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.pageTemplate.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.pageTemplate.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'mts-resume', accessLevel: 'public', categoryId: 'cat-career' }),
          expect.objectContaining({ id: 'simple-telecom-contract', accessLevel: 'public', categoryId: 'cat-docs' }),
          expect.objectContaining({ id: 'sprint-retro', accessLevel: 'public', categoryId: 'cat-team' }),
        ]),
        skipDuplicates: true,
      }),
    );
  });

  it('stores a custom template from page content and extracts template fields', async () => {
    prisma.templateCategory.findUnique.mockResolvedValue({ id: 'cat-docs', title: 'Документы' });
    prisma.pageTemplate.create.mockResolvedValue({
      id: 'tpl-created',
      spaceId: 'space-1',
      ownerUserId: 'user-1',
      title: 'Шаблон из страницы',
      summary: 'Шаблон, созданный из страницы',
      categoryId: 'cat-docs',
      category: { id: 'cat-docs', title: 'Документы' },
      icon: 'sparkles',
      accessLevel: 'private',
      usageCount: 0,
      pageTitleTemplate: 'Шаблон из страницы',
      fields: [
        {
          key: 'company',
          label: 'Компания',
          description: 'Название компании',
          kind: 'text',
          required: true,
        },
      ],
      document: {
        type: 'doc',
        content: [
          {
            type: 'rootblock',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'templateVariable',
                    attrs: {
                      key: 'company',
                      label: 'Компания',
                      description: 'Название компании',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      createdAt: new Date('2026-01-05T00:00:00.000Z'),
      updatedAt: new Date('2026-01-05T00:00:00.000Z'),
    });

    const result = await service.createTemplate(
      {
        spaceId: 'space-1',
        title: 'Шаблон из страницы',
        summary: '',
        categoryId: 'cat-docs',
        accessLevel: 'private',
        document: {
          type: 'doc',
          content: [
            {
              type: 'rootblock',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'templateVariable',
                      attrs: {
                        key: 'company',
                        label: 'Компания',
                        description: 'Название компании',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      } as any,
      { userId: 'user-1', displayName: 'Demo User' } as any,
    );

    expect(prisma.pageTemplate.create).toHaveBeenCalledTimes(1);
    expect(prisma.pageTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spaceId: 'space-1',
          ownerUserId: 'user-1',
          title: 'Шаблон из страницы',
          summary: 'Шаблон, созданный из страницы',
          categoryId: 'cat-docs',
          accessLevel: 'private',
          pageTitleTemplate: 'Шаблон из страницы',
        }),
      }),
    );
    expect(result.template.fields).toHaveLength(1);
    expect(result.template.fields[0]?.key).toBe('company');
    expect(result.template.source).toBe('custom');
  });
});
