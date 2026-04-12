import { of, throwError } from 'rxjs';
import { AuthService } from '../src/auth/auth.service';

describe('AuthService', () => {
  const redisStore = new Map<string, unknown>();

  const redisService = {
    getJson: jest.fn(async (key: string) => (redisStore.has(key) ? redisStore.get(key) : null)),
    setJson: jest.fn(async (key: string, value: unknown) => {
      redisStore.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      redisStore.delete(key);
    }),
  };

  const configService = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'JWT_SECRET') {
        return 'test-secret';
      }
      if (key === 'MWS_TABLES_BASE_URL') {
        return 'https://tables.mws.ru/fusion/v1';
      }
      if (key === 'NODE_ENV') {
        return 'test';
      }
      return fallback;
    }),
  };

  const jwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const httpService = {
    request: jest.fn(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const response = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as any;

  let service: AuthService;

  beforeEach(() => {
    redisStore.clear();
    jest.clearAllMocks();

    jwtService.sign.mockImplementation((payload: any) => {
      if (payload.type === 'refresh') {
        return `refresh::${payload.sid}::${payload.jti}::${payload.sub}`;
      }
      if (payload.type === 'access') {
        return `access::${payload.sid}::${payload.sub}`;
      }
      return 'collab-token';
    });

    jwtService.verify.mockImplementation((token: string) => {
      if (token.startsWith('refresh::')) {
        const [, sid, jti, sub] = token.split('::');
        return { sid, jti, sub, type: 'refresh' };
      }

      if (token.startsWith('access::')) {
        const [, sid, sub] = token.split('::');
        return { sid, sub, displayName: 'MWS Space A', type: 'access' };
      }

      throw new Error('invalid');
    });

    service = new AuthService(
      jwtService as any,
      configService as any,
      httpService as any,
      redisService as any,
      prisma as any,
    );
  });

  it('returns onboarding requirement when user is missing and display name is not provided', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    httpService.request.mockReturnValue(
      of({
        data: {
          data: {
            user: {
              id: 'mws-user-1',
              clientId: 'client-1',
            },
            spaces: [{ name: 'Space A' }],
          },
        },
      }),
    );

    const result = await service.login('test-api-key', response);

    expect(result).toEqual({
      status: 'display_name_required',
      profile: {
        userId: 'mws-user-1',
        clientId: 'client-1',
        suggestedDisplayName: null,
      },
    });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('issues refresh cookie on login and resolves mws token from server session on access token validation', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => data);
    httpService.request.mockReturnValue(
      of({
        data: {
          data: {
            user: {
              id: 'mws-user-1',
              clientId: 'client-1',
            },
            spaces: [{ name: 'Space A' }],
          },
        },
      }),
    );

    const loginResult = await service.login('test-api-key', response, 'Nikita');
    expect(loginResult).toEqual({ status: 'authorized' });

    expect(response.cookie).toHaveBeenCalledTimes(1);
    const [cookieName, refreshToken, cookieOptions] = response.cookie.mock.calls[0];
    expect(cookieName).toBe('refresh_token');
    expect(refreshToken).toContain('refresh::');
    expect(cookieOptions).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 8 * 60 * 60 * 1000,
    });

    const refreshResult = await service.refresh(refreshToken, response);
    expect(refreshResult.expiresInSec).toBe(900);
    expect(refreshResult.accessToken).toContain('access::');

    const user = await service.resolveUserFromAccessToken(refreshResult.accessToken);
    expect(user.userId).toBe('mws-user-1');
    expect(user.clientId).toBe('client-1');
    expect(user.displayName).toBe('Nikita');
    expect(user.mwsToken).toBe('test-api-key');
  });

  it('reuses cached user on repeated login without hitting prisma again', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => data);
    httpService.request.mockReturnValue(
      of({
        data: {
          data: {
            user: {
              id: 'mws-user-1',
              clientId: 'client-1',
            },
          },
        },
      }),
    );

    await service.login('test-api-key', response, 'Nikita');
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);

    prisma.user.findUnique.mockClear();
    prisma.user.create.mockClear();

    await service.login('test-api-key', response, 'Ignored Name');

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('updates display name in database, cache, and active session', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => data);
    prisma.user.update.mockImplementation(async ({ where, data }: any) => ({
      userId: where.userId,
      clientId: 'client-1',
      displayName: data.displayName,
    }));
    httpService.request.mockReturnValue(
      of({
        data: {
          data: {
            user: {
              id: 'mws-user-1',
              clientId: 'client-1',
            },
          },
        },
      }),
    );

    await service.login('test-api-key', response, 'Nikita');
    const [, refreshToken] = response.cookie.mock.calls[0];
    const refreshResult = await service.refresh(refreshToken, response);
    const resolved = await service.resolveUserFromAccessToken(refreshResult.accessToken);

    const updated = await service.updateDisplayName(resolved, 'Renamed User');

    expect(updated.displayName).toBe('Renamed User');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { userId: 'mws-user-1' },
      data: { displayName: 'Renamed User' },
    });

    const updatedUser = await service.resolveUserFromAccessToken(refreshResult.accessToken);
    expect(updatedUser.displayName).toBe('Renamed User');
    expect(redisService.getJson).toHaveBeenCalledWith('auth:user:mws-user-1');
  });

  it('maps MWS 401/403 to Invalid API key', async () => {
    httpService.request.mockReturnValue(
      throwError(() => ({
        response: {
          status: 401,
        },
      })),
    );

    await expect(service.login('bad-key', response)).rejects.toThrow('Invalid API key');
  });

  it('maps non-auth MWS failure to temporary upstream error', async () => {
    httpService.request.mockReturnValue(
      throwError(() => ({
        response: {
          status: 503,
        },
      })),
    );

    await expect(service.login('any-key', response)).rejects.toThrow('MWS unavailable, try later');
  });
});
