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

  const prisma = {
    pageTemplate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
  };

  const service = new TemplatesService(pagesService as any, prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('instantiates template with substituted values in default Yjs fragment', async () => {
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
  });

  it('returns built-in templates plus visible custom templates', async () => {
    prisma.pageTemplate.findMany.mockResolvedValue([
      {
        id: 'mts-resume',
        spaceId: 'demo-space',
        ownerUserId: 'system',
        title: 'Резюме в компанию МТС',
        summary: 'Быстрый шаблон резюме с акцентом на опыт, навыки и мотивацию для отклика в МТС.',
        category: 'Карьера',
        icon: 'briefcase',
        accessLevel: 'public',
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
        category: 'Мои шаблоны',
        icon: 'sparkles',
        accessLevel: 'private',
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
        category: 'Команда',
        icon: 'sparkles',
        accessLevel: 'space',
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
        category: 'Публичные',
        icon: 'sparkles',
        accessLevel: 'public',
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
        category: 'Скрытые',
        icon: 'sparkles',
        accessLevel: 'private',
        pageTitleTemplate: 'Скрытый шаблон',
        fields: [],
        document: { type: 'doc', content: [] },
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
        updatedAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    ]);

    const result = await service.listTemplates(
      { userId: 'user-1', displayName: 'Demo User' } as any,
      'space-1',
    );

    expect(result.items.some((item) => item.id === 'mts-resume')).toBe(true);
    expect(result.items.some((item) => item.id === 'tpl-private')).toBe(true);
    expect(result.items.some((item) => item.id === 'tpl-space')).toBe(true);
    expect(result.items.some((item) => item.id === 'tpl-public')).toBe(true);
    expect(result.items.some((item) => item.id === 'tpl-hidden')).toBe(false);
    expect(result.items.find((item) => item.id === 'mts-resume')?.source).toBe('builtIn');
  });

  it('seeds built-in templates on module init', async () => {
    prisma.pageTemplate.findMany.mockResolvedValue([]);
    prisma.pageTemplate.createMany.mockResolvedValue({ count: 3 });

    await service.onModuleInit();

    expect(prisma.pageTemplate.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.pageTemplate.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'mts-resume', accessLevel: 'public' }),
          expect.objectContaining({ id: 'simple-telecom-contract', accessLevel: 'public' }),
          expect.objectContaining({ id: 'sprint-retro', accessLevel: 'public' }),
        ]),
        skipDuplicates: true,
      }),
    );
  });

  it('stores a custom template from page content and extracts template fields', async () => {
    prisma.pageTemplate.create.mockResolvedValue({
      id: 'tpl-created',
      spaceId: 'space-1',
      ownerUserId: 'user-1',
      title: 'Шаблон из страницы',
      summary: 'Шаблон, созданный из страницы',
      category: 'Мои шаблоны',
      icon: 'sparkles',
      accessLevel: 'private',
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
        category: '',
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
          category: 'Мои шаблоны',
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
