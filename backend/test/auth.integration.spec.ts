import { HttpService } from '@nestjs/axios';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { of } from 'rxjs';
import { AuthModule } from '../src/auth/auth.module';
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
      providers: [
        {
          provide: RedisService,
          useValue: redisMock,
        },
      ],
    })
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
    jest.clearAllMocks();
  });

  it('supports login -> refresh -> me -> logout flow', async () => {
    httpMock.request.mockReturnValue(
      of({
        data: {
          data: {
            spaces: [{ name: 'Integration Space' }],
          },
        },
      }),
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ apiKey: 'integration-api-key' })
      .expect(204);

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

    expect(meResponse.body.user.userId).toContain('mws_');
    expect(meResponse.body.user.displayName).toContain('MWS');

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
});