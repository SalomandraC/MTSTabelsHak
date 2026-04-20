import { NotFoundException } from '@nestjs/common';
import { DocumentAccessScope, WikiNodeType } from '@prisma/client';
import { PagesService } from '../src/pages/pages.service';

describe('PagesService', () => {
  const user = { userId: 'user-1', displayName: 'Owner' };

  let prisma: any;
  let searchService: any;
  let pageAccessService: any;
  let realtimeService: any;
  let mwsService: any;
  let contextIndexingService: any;
  let documentIndexingService: any;
  let service: PagesService;

  beforeEach(() => {
    prisma = {
      wikiNode: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      pageAccessPolicy: {
        upsert: jest.fn(),
      },
    };
    searchService = {
      searchPages: jest.fn(),
    };
    realtimeService = {
      broadcastPageAccessUpdated: jest.fn(),
    };
    mwsService = {};
    contextIndexingService = {};
    documentIndexingService = {
      extractPlainTextFromProsemirrorJson: jest.fn(() => ''),
    };
    contextIndexingService.deletePage = jest.fn(async () => undefined);
    pageAccessService = {
      assertCanView: jest.fn(async () => ({
        role: 'owner',
        capabilities: {
          canView: true,
          canEdit: true,
          canComment: true,
          canDelete: true,
          canManageAccess: true,
          canUseAi: true,
        },
        policy: {
          viewAccess: DocumentAccessScope.space_members,
          commentAccess: DocumentAccessScope.space_members,
          editAccess: DocumentAccessScope.space_members,
          ownerUserId: user.userId,
        },
      })),
      assertCanEdit: jest.fn(async () => undefined),
      assertCanDelete: jest.fn(async () => undefined),
      assertCanManageAccess: jest.fn(async () => undefined),
      createDefaultPolicy: jest.fn(async () => undefined),
      resolvePageAccess: jest.fn(async () => ({
        role: 'owner',
        capabilities: {
          canView: true,
          canEdit: true,
          canComment: true,
          canDelete: true,
          canManageAccess: true,
          canUseAi: true,
        },
      })),
    };

    service = new PagesService(
      prisma,
      searchService,
      pageAccessService,
      realtimeService,
      mwsService,
      contextIndexingService,
      documentIndexingService,
    );
  });

  it('returns page access through getPageAccess after access guard check', async () => {
    const result = await service.getPageAccess('page-1', user);

    expect(pageAccessService.assertCanView).toHaveBeenCalledWith('page-1', user);
    expect(result.access.role).toBe('owner');
    expect(result.access.policy).toMatchObject({
      viewAccess: DocumentAccessScope.space_members,
      commentAccess: DocumentAccessScope.space_members,
      editAccess: DocumentAccessScope.space_members,
    });
  });

  it('updates page access policy and returns refreshed access summary', async () => {
    prisma.wikiNode.findUnique.mockResolvedValue({
      id: 'page-1',
      spaceId: 'space-1',
      type: WikiNodeType.page,
    });

    const result = await service.updatePageAccess(
      'page-1',
      {
        viewAccess: DocumentAccessScope.link_holders,
        commentAccess: DocumentAccessScope.space_members,
        editAccess: DocumentAccessScope.owner_only,
      },
      user,
    );

    expect(pageAccessService.assertCanManageAccess).toHaveBeenCalledWith('page-1', user);
    expect(prisma.pageAccessPolicy.upsert).toHaveBeenCalledWith({
      where: { pageId: 'page-1' },
      create: {
        pageId: 'page-1',
        ownerUserId: user.userId,
        viewAccess: DocumentAccessScope.link_holders,
        commentAccess: DocumentAccessScope.space_members,
        editAccess: DocumentAccessScope.owner_only,
      },
      update: {
        viewAccess: DocumentAccessScope.link_holders,
        commentAccess: DocumentAccessScope.space_members,
        editAccess: DocumentAccessScope.owner_only,
      },
    });
    expect(realtimeService.broadcastPageAccessUpdated).toHaveBeenCalledWith('space-1', 'page-1');
    expect(result.access.role).toBe('owner');
  });

  it('archives a page when owner deletes it', async () => {
    prisma.wikiNode.findUnique.mockResolvedValue({
      id: 'page-1',
      type: WikiNodeType.page,
    });

    await service.deletePage('page-1', user);

    expect(pageAccessService.assertCanDelete).toHaveBeenCalledWith('page-1', user);
    expect(prisma.wikiNode.update).toHaveBeenCalledWith({
      where: { id: 'page-1' },
      data: {
        isArchived: true,
        updatedBy: user.userId,
      },
    });
  });

  it('throws when trying to delete a missing page', async () => {
    prisma.wikiNode.findUnique.mockResolvedValue(null);

    await expect(service.deletePage('missing-page', user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates AI report pages with bold marks in the initial document', async () => {
    const createPageSpy = jest.spyOn(service as any, 'createPage').mockResolvedValue({
      page: {
        id: 'page-1',
        title: 'AI report',
      },
    });

    const result = await service.createPageForAiReport(
      {
        workspaceId: 'space-1',
        title: 'AI report',
        content: {
          type: 'doc',
          content: [
            {
              type: 'rootblock',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Жирный ' },
                    { type: 'text', text: 'текст', marks: [{ type: 'bold' }] },
                  ],
                },
              ],
            },
          ],
        },
      },
      user,
    );

    expect(createPageSpy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'created',
      pageId: 'page-1',
      title: 'AI report',
    });
  });

  it('converts markdown bold syntax to a bold mark for AI docs', () => {
    const normalized = (service as any).normalizeAiContentToDoc('Обычный **жирный** текст');
    const serialized = JSON.stringify(normalized);

    expect(serialized).toContain('"type":"bold"');
    expect(serialized).not.toContain('**жирный**');
  });

  it('ignores unsupported marks in AI payload instead of failing schema conversion', async () => {
    const createPageSpy = jest.spyOn(service as any, 'createPage').mockResolvedValue({
      page: {
        id: 'page-2',
        title: 'AI report safe marks',
      },
    });

    await expect(
      service.createPageForAiReport(
        {
          workspaceId: 'space-1',
          title: 'AI report safe marks',
          content: {
            type: 'doc',
            content: [
              {
                type: 'rootblock',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: 'Текст ', marks: [{ type: 'italic' }] },
                      { type: 'text', text: 'жирный', marks: [{ type: 'bold' }] },
                    ],
                  },
                ],
              },
            ],
          },
        },
        user,
      ),
    ).resolves.toMatchObject({
      status: 'created',
      pageId: 'page-2',
    });

    expect(createPageSpy).toHaveBeenCalledTimes(1);
  });
});
