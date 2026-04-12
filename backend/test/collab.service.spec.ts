import { NotFoundException } from '@nestjs/common';
import { CollabService } from '../src/collab/collab.service';

describe('CollabService', () => {
  const user = { userId: 'user-1', displayName: 'Ivan' };

  let prisma: any;
  let authService: any;
  let configService: any;
  let redisService: any;
  let persistenceService: any;
  let pageAccessService: any;
  let service: CollabService;

  beforeEach(() => {
    prisma = {
      wikiNode: {
        findUnique: jest.fn(async () => ({ id: 'page-1' })),
      },
      collabSession: {
        create: jest.fn(async () => ({ id: 'session-1' })),
      },
    };
    authService = {
      issueCollabToken: jest.fn(() => 'signed-collab-token'),
    };
    configService = {
      get: jest.fn((_key: string, fallback: string) => fallback),
    };
    redisService = {
      smembers: jest.fn(async () => [JSON.stringify({ userId: 'peer-1', displayName: 'Anna' })]),
    };
    persistenceService = {
      getDocumentState: jest.fn(async () => ({ value: 'encoded-doc' })),
    };
    pageAccessService = {
      assertCanView: jest.fn(async () => ({
        role: 'commentator',
        capabilities: {
          canView: true,
          canEdit: false,
          canComment: true,
          canUseAi: false,
        },
      })),
    };

    service = new CollabService(
      prisma,
      authService,
      configService,
      redisService,
      persistenceService,
      pageAccessService,
    );
  });

  it('opens a read-only collaboration session and exposes access capabilities', async () => {
    const result = await service.openSession(
      'page-1',
        {
          client: {
            clientId: 'client-1',
            deviceId: 'device-1',
            editorVersion: '3.0.0',
          },
        },
        user,
      );

    expect(pageAccessService.assertCanView).toHaveBeenCalledWith('page-1', user);
    expect(authService.issueCollabToken).toHaveBeenCalledWith(
      user,
      'page-1',
      'session-1',
      'client-1',
      expect.objectContaining({
        role: 'commentator',
        capabilities: expect.objectContaining({ canEdit: false, canComment: true }),
      }),
    );
    expect(result.access).toEqual({
      role: 'commentator',
      capabilities: expect.objectContaining({
        canView: true,
        canEdit: false,
        canComment: true,
      }),
    });
    expect(result.awareness.activeUsers[0]).toMatchObject({
      userId: 'peer-1',
      displayName: 'Anna',
    });
    expect(result.websocket.token).toBe('signed-collab-token');
  });

  it('throws when page does not exist', async () => {
    prisma.wikiNode.findUnique.mockResolvedValue(null);

    await expect(
      service.openSession(
        'missing-page',
        {
          client: {
            clientId: 'client-1',
            deviceId: 'device-1',
            editorVersion: '3.0.0',
          },
        },
        user,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
