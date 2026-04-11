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
    );
  });

  it('issues refresh cookie on login and resolves mws token from server session on access token validation', async () => {
    httpService.request.mockReturnValue(
      of({
        data: {
          data: {
            spaces: [{ name: 'Space A' }],
          },
        },
      }),
    );

    await service.login('test-api-key', response);

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
    expect(user.userId).toContain('mws_');
    expect(user.mwsToken).toBe('test-api-key');
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
