import { DocumentAccessScope, WikiNodeType } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { PageAccessService } from '../src/page-access/page-access.service';

describe('PageAccessService', () => {
  let prisma: any;
  let redisService: any;
  let mwsService: any;
  let service: PageAccessService;

  beforeEach(() => {
    prisma = {
      pageAccessPolicy: {
        upsert: jest.fn(),
      },
      wikiNode: {
        findUnique: jest.fn(),
      },
    };
    redisService = {
      getJson: jest.fn(async () => null),
      setJson: jest.fn(async () => undefined),
      del: jest.fn(async () => undefined),
    };
    mwsService = {
      listSpaces: jest.fn(async () => ({
        items: [{ id: 'space-1', name: 'Space 1' }],
      })),
    };

    service = new PageAccessService(prisma, redisService, mwsService);
  });

  it('returns owner capabilities for the document owner', async () => {
    prisma.wikiNode.findUnique.mockResolvedValue({
      id: 'page-1',
      spaceId: 'space-1',
      createdBy: 'user-1',
      type: WikiNodeType.page,
      isArchived: false,
      page: {
        accessPolicy: {
          ownerUserId: 'user-1',
          viewAccess: DocumentAccessScope.owner_only,
          commentAccess: DocumentAccessScope.owner_only,
          editAccess: DocumentAccessScope.owner_only,
        },
      },
    });

    const result = await service.resolvePageAccess('page-1', {
      userId: 'user-1',
      displayName: 'Owner',
    });

    expect(result.role).toBe('owner');
    expect(result.capabilities).toMatchObject({
      canView: true,
      canEdit: true,
      canComment: true,
      canDelete: true,
      canManageAccess: true,
    });
  });

  it('resolves editor role for a space member when edit is allowed for the space', async () => {
    prisma.wikiNode.findUnique.mockResolvedValue({
      id: 'page-2',
      spaceId: 'space-1',
      createdBy: 'owner-1',
      type: WikiNodeType.page,
      isArchived: false,
      page: {
        accessPolicy: {
          ownerUserId: 'owner-1',
          viewAccess: DocumentAccessScope.space_members,
          commentAccess: DocumentAccessScope.space_members,
          editAccess: DocumentAccessScope.space_members,
        },
      },
    });

    const result = await service.resolvePageAccess('page-2', {
      userId: 'user-2',
      displayName: 'Editor',
      mwsToken: 'token',
    });

    expect(mwsService.listSpaces).toHaveBeenCalled();
    expect(result.role).toBe('editor');
    expect(result.capabilities.canEdit).toBe(true);
  });

  it('preserves demo member access when no MWS token is present', async () => {
    prisma.wikiNode.findUnique.mockResolvedValue({
      id: 'page-3',
      spaceId: 'space-1',
      createdBy: 'owner-1',
      type: WikiNodeType.page,
      isArchived: false,
      page: {
        accessPolicy: {
          ownerUserId: 'owner-1',
          viewAccess: DocumentAccessScope.space_members,
          commentAccess: DocumentAccessScope.owner_only,
          editAccess: DocumentAccessScope.owner_only,
        },
      },
    });

    const result = await service.resolvePageAccess('page-3', {
      userId: 'demo-user',
      displayName: 'Demo',
    });

    expect(result.isSpaceMember).toBe(true);
    expect(result.role).toBe('guest');
    expect(mwsService.listSpaces).not.toHaveBeenCalled();
  });

  it('rejects anonymous viewers even when the page is shared via link_holders', async () => {
    prisma.wikiNode.findUnique.mockResolvedValue({
      id: 'page-4',
      spaceId: 'space-1',
      createdBy: 'owner-1',
      type: WikiNodeType.page,
      isArchived: false,
      page: {
        accessPolicy: {
          ownerUserId: 'owner-1',
          viewAccess: DocumentAccessScope.link_holders,
          commentAccess: DocumentAccessScope.owner_only,
          editAccess: DocumentAccessScope.owner_only,
        },
      },
    });

    const result = await service.resolvePageAccess('page-4');

    expect(result.principal).toBe('anonymous');
    expect(result.capabilities).toMatchObject({
      canView: false,
      canComment: false,
      canEdit: false,
      canUseAi: false,
    });
  });

  it('allows authenticated non-members to access link_holders pages', async () => {
    mwsService.listSpaces.mockResolvedValue({
      items: [{ id: 'space-2', name: 'Other space' }],
    });
    prisma.wikiNode.findUnique.mockResolvedValue({
      id: 'page-4b',
      spaceId: 'space-1',
      createdBy: 'owner-1',
      type: WikiNodeType.page,
      isArchived: false,
      page: {
        accessPolicy: {
          ownerUserId: 'owner-1',
          viewAccess: DocumentAccessScope.link_holders,
          commentAccess: DocumentAccessScope.link_holders,
          editAccess: DocumentAccessScope.link_holders,
        },
      },
    });

    const result = await service.resolvePageAccess('page-4b', {
      userId: 'user-9',
      displayName: 'Guest but authenticated',
      mwsToken: 'token',
    });

    expect(result.principal).toBe('authenticated');
    expect(result.isSpaceMember).toBe(false);
    expect(result.role).toBe('editor');
    expect(result.capabilities).toMatchObject({
      canView: true,
      canComment: true,
      canEdit: true,
    });
  });

  it('throws when a user without delete rights tries to delete a page', async () => {
    prisma.wikiNode.findUnique.mockResolvedValue({
      id: 'page-5',
      spaceId: 'space-1',
      createdBy: 'owner-1',
      type: WikiNodeType.page,
      isArchived: false,
      page: {
        accessPolicy: {
          ownerUserId: 'owner-1',
          viewAccess: DocumentAccessScope.space_members,
          commentAccess: DocumentAccessScope.space_members,
          editAccess: DocumentAccessScope.space_members,
        },
      },
    });

    await expect(
      service.assertCanDelete('page-5', {
        userId: 'user-2',
        displayName: 'Editor',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
