import { HttpService } from '@nestjs/axios';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { of } from 'rxjs';
import { AuthModule } from '../src/auth/auth.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';

function asCookieArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    return [value];
  }

  return [];
}

describe('Auth flow integration', () => {
  let app: INestApplication;

  const redisStore = new Map<string, unknown>();
  const redisMock = {
    getJson: jest.fn(async (key: string) => (redisStore.has(key) ? redisStore.get(key) : null)),
    setJson: jest.fn(async (key: string, value: unknown) => {
      redisStore.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      redisStore.delete(key);
    }),
  };

  const httpMock = {
    request: jest.fn(),
  };
  const userStore = new Map<string, { userId: string; clientId: string | null; displayName: string }>();
  const prismaMock = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => userStore.get(where.userId) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const created = {
          userId: data.userId,
          clientId: data.clientId ?? null,
          displayName: data.displayName,
        };
        userStore.set(created.userId, created);
        return created;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = userStore.get(where.userId);
        const updated = {
          userId: where.userId,
          clientId: data.clientId ?? existing?.clientId ?? null,
          displayName: data.displayName ?? existing?.displayName ?? 'User',
        };
        userStore.set(updated.userId, updated);
        return updated;
      }),
    },
  };

  beforeAll(async () => {
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'integration-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
        }),
        AuthModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue(redisMock)
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(HttpService)
      .useValue(httpMock)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    redisStore.clear();
    userStore.clear();
    jest.clearAllMocks();
  });

  it('supports login -> refresh -> me -> logout flow', async () => {
    httpMock.request.mockReturnValue(
      of({
        data: {
          data: {
            spaces: [{ name: 'Integration Space' }],
            user: { id: 'mws-user-1', clientId: 'client-1' },
          },
        },
      }),
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ apiKey: 'integration-api-key', displayName: 'Integration User' })
      .expect(201);

    expect(loginResponse.body.status).toBe('authorized');

    const cookies = asCookieArray(loginResponse.headers['set-cookie']);
    expect(Array.isArray(cookies)).toBe(true);
    expect(cookies.join(';')).toContain('refresh_token=');

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .expect(201);

    expect(refreshResponse.body.accessToken).toBeDefined();
    expect(refreshResponse.body.expiresInSec).toBe(900);

    const meResponse = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${refreshResponse.body.accessToken}`)
      .expect(200);

    expect(meResponse.body.user.userId).toBe('mws-user-1');
    expect(meResponse.body.user.displayName).toBe('Integration User');
    expect(meResponse.body.user.clientId).toBe('client-1');

    const logoutResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies)
      .expect(204);

    const logoutCookies = asCookieArray(logoutResponse.headers['set-cookie']);
    expect(logoutCookies.join(';')).toContain('refresh_token=;');
  });

  it('returns 401 on /me without bearer token', async () => {
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
  });

  it('requests display name for first-time users before creating a session', async () => {
    httpMock.request.mockReturnValue(
      of({
        data: {
          data: {
            spaces: [{ name: 'Integration Space' }],
            user: { id: 'mws-user-2', clientId: 'client-2' },
          },
        },
      }),
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ apiKey: 'integration-api-key' })
      .expect(201);

    expect(loginResponse.body).toEqual({
      status: 'display_name_required',
      profile: {
        userId: 'mws-user-2',
        clientId: 'client-2',
        suggestedDisplayName: null,
      },
    });
    expect(asCookieArray(loginResponse.headers['set-cookie'])).toEqual([]);
  });

  it('updates display name through /me and returns the new value in session', async () => {
    httpMock.request.mockReturnValue(
      of({
        data: {
          data: {
            spaces: [{ name: 'Integration Space' }],
            user: { id: 'mws-user-3', clientId: 'client-3' },
          },
        },
      }),
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ apiKey: 'integration-api-key', displayName: 'Initial Name' })
      .expect(201);

    const cookies = asCookieArray(loginResponse.headers['set-cookie']);
    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .expect(201);

    const accessToken = refreshResponse.body.accessToken as string;

    const updateResponse = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ displayName: 'Updated Name' })
      .expect(200);

    expect(updateResponse.body.user).toEqual({
      userId: 'mws-user-3',
      clientId: 'client-3',
      displayName: 'Updated Name',
    });

    const meResponse = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meResponse.body.user.displayName).toBe('Updated Name');
  });
});
