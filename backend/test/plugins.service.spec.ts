import { PluginsService } from '../src/plugins/plugins.service';

describe('PluginsService', () => {
  const activations = new Map<string, boolean>();

  const prisma = {
    pluginActivation: {
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) => {
        return [...activations.entries()]
          .filter(([key]) => key.startsWith(`${where.userId}::`))
          .map(([key, isEnabled]) => {
            const [, pluginId] = key.split('::');
            return {
              pluginId,
              isEnabled,
            };
          });
      }),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const key = `${where.pluginId_scopeType_userId.userId}::${where.pluginId_scopeType_userId.pluginId}`;
        const nextState = activations.has(key) ? update.isEnabled : create.isEnabled;
        activations.set(key, nextState);
        return {
          pluginId: where.pluginId_scopeType_userId.pluginId,
          isEnabled: nextState,
        };
      }),
    },
  };

  const configService = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'DEFAULT_PLUGIN_PLAN') {
        return 'pro';
      }

      if (key === 'PLUGIN_USER_PLAN_MAP') {
        return JSON.stringify({
          'free-user': 'free',
        });
      }

      return fallback;
    }),
  };

  let service: PluginsService;

  beforeEach(() => {
    activations.clear();
    jest.clearAllMocks();
    service = new PluginsService(prisma as any, configService as any);
  });

  it('returns optional plugin as enabled for pro plan by default', async () => {
    const response = await service.getCatalogForUser({
      userId: 'pro-user',
      displayName: 'Pro User',
    });

    expect(response.plan.id).toBe('pro');
    expect(response.items.find((item) => item.id === 'document-graph')?.status).toBe('enabled');
  });

  it('includes live variables as a core always-on module', async () => {
    const response = await service.getCatalogForUser({
      userId: 'pro-user',
      displayName: 'Pro User',
    });

    const liveVariables = response.items.find((item) => item.id === 'live-variables');

    expect(liveVariables).toEqual(expect.objectContaining({
      kind: 'core',
      enabled: true,
      canToggle: false,
      status: 'core',
    }));
  });

  it('locks optional plugin for free plan', async () => {
    const response = await service.getCatalogForUser({
      userId: 'free-user',
      displayName: 'Free User',
    });

    const graphPlugin = response.items.find((item) => item.id === 'document-graph');
    expect(graphPlugin?.status).toBe('locked');
    expect(graphPlugin?.enabled).toBe(false);
  });

  it('persists user override when disabling implemented plugin', async () => {
    const response = await service.deactivatePlugin(
      {
        userId: 'pro-user',
        displayName: 'Pro User',
      },
      'document-graph',
    );

    expect(response.items.find((item) => item.id === 'document-graph')?.status).toBe('available');
    expect(response.items.find((item) => item.id === 'document-graph')?.enabled).toBe(false);
  });
});
