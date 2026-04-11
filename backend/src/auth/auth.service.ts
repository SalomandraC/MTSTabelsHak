import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { randomUUID, createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { RedisService } from 'src/infra/redis/redis.service';
import { UserContext } from './user-context';

export interface CollabTokenPayload {
  sub: string;
  pageId: string;
  sessionId: string;
  clientId: string;
}

interface AccessTokenPayload {
  sub: string;
  sid: string;
  displayName: string;
  type: 'access';
}

interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
  type: 'refresh';
}

interface AuthSession {
  userId: string;
  displayName: string;
  apiKey: string;
  refreshTokenId: string;
}

interface ApiKeyValidationCacheEntry {
  userId: string;
  displayName: string;
}

interface RefreshResult {
  accessToken: string;
  expiresInSec: number;
}

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 8 * 60 * 60;
const REFRESH_COOKIE = 'refresh_token';
const API_KEY_VALIDATION_CACHE_TTL_SEC = 5 * 60;

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly mwsBaseUrl: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly redisService: RedisService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET', 'wikilive-dev-secret');
    this.mwsBaseUrl = this.configService.get<string>(
      'MWS_TABLES_BASE_URL',
      'https://tables.mws.ru/fusion/v1',
    );
  }

  async login(apiKey: string, response: Response): Promise<void> {
    const profile = await this.validateApiKey(apiKey.trim());
    const sessionId = randomUUID();
    const refreshTokenId = randomUUID();
    const session: AuthSession = {
      userId: profile.userId,
      displayName: profile.displayName,
      apiKey: apiKey.trim(),
      refreshTokenId,
    };

    await this.redisService.setJson(this.sessionKey(sessionId), session, REFRESH_TTL_SEC);

    const refreshToken = this.issueRefreshToken({
      sub: profile.userId,
      sid: sessionId,
      jti: refreshTokenId,
      type: 'refresh',
    });

    this.setRefreshCookie(response, refreshToken);
  }

  async refresh(refreshToken: string, response: Response): Promise<RefreshResult> {
    const payload = this.verifyRefreshToken(refreshToken);
    const session = await this.redisService.getJson<AuthSession>(this.sessionKey(payload.sid));

    if (!session || session.refreshTokenId !== payload.jti || session.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const nextRefreshTokenId = randomUUID();
    session.refreshTokenId = nextRefreshTokenId;
    await this.redisService.setJson(this.sessionKey(payload.sid), session, REFRESH_TTL_SEC);

    const rotatedRefreshToken = this.issueRefreshToken({
      sub: session.userId,
      sid: payload.sid,
      jti: nextRefreshTokenId,
      type: 'refresh',
    });

    this.setRefreshCookie(response, rotatedRefreshToken);

    return {
      accessToken: this.issueAccessToken({
        sub: session.userId,
        sid: payload.sid,
        displayName: session.displayName,
        type: 'access',
      }),
      expiresInSec: ACCESS_TTL_SEC,
    };
  }

  async logout(refreshToken: string | undefined, response: Response): Promise<void> {
    if (refreshToken) {
      const payload = this.tryVerifyRefreshToken(refreshToken);
      if (payload?.sid) {
        await this.redisService.del(this.sessionKey(payload.sid));
      }
    }

    this.clearRefreshCookie(response);
  }

  async resolveUserFromAccessToken(token: string): Promise<UserContext> {
    const payload = this.verifyAccessToken(token);
    const session = await this.redisService.getJson<AuthSession>(this.sessionKey(payload.sid));

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session is invalid or expired');
    }

    return {
      userId: session.userId,
      displayName: session.displayName,
      sessionId: payload.sid,
      authToken: token,
      mwsToken: session.apiKey,
    };
  }

  readRefreshTokenFromCookie(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) {
      return undefined;
    }

    const parts = cookieHeader.split(';').map((part) => part.trim());
    for (const part of parts) {
      const [key, ...value] = part.split('=');
      if (key === REFRESH_COOKIE) {
        return decodeURIComponent(value.join('='));
      }
    }

    return undefined;
  }

  issueCollabToken(user: UserContext, pageId: string, sessionId: string, clientId: string): string {
    return this.jwtService.sign({
      sub: user.userId,
      pageId,
      sessionId,
      clientId,
      displayName: user.displayName,
    });
  }

  verifyCollabToken(token: string): CollabTokenPayload {
    try {
      return this.jwtService.verify<CollabTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid collaboration token');
    }
  }

  private issueAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: ACCESS_TTL_SEC,
    });
  }

  private issueRefreshToken(payload: RefreshTokenPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: REFRESH_TTL_SEC,
    });
  }

  private verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = this.jwtService.verify<AccessTokenPayload>(token, {
        secret: this.jwtSecret,
      });
      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid access token');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(token, {
        secret: this.jwtSecret,
      });
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private tryVerifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      return this.verifyRefreshToken(token);
    } catch {
      return null;
    }
  }

  private async validateApiKey(apiKey: string): Promise<ApiKeyValidationCacheEntry> {
    const cacheKey = this.apiKeyValidationCacheKey(apiKey);
    const cached = await this.redisService.getJson<ApiKeyValidationCacheEntry>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method: 'GET',
          url: `${this.mwsBaseUrl}/spaces`,
          headers: {
            Authorization: apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
          },
          timeout: 10000,
        }),
      );

      const spaces = response.data?.data?.spaces ?? [];
      const hash = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
      const profile: ApiKeyValidationCacheEntry = {
        userId: `mws_${hash}`,
        displayName: spaces[0]?.name ? `MWS ${spaces[0].name}` : `MWS User ${hash.slice(0, 6)}`,
      };

      await this.redisService.setJson(cacheKey, profile, API_KEY_VALIDATION_CACHE_TTL_SEC);
      return profile;
    } catch (error: any) {
      const status = Number(error?.response?.status ?? 0);
      if (status === 401 || status === 403) {
        throw new UnauthorizedException('Invalid API key');
      }

      throw new BadGatewayException('MWS unavailable, try later');
    }
  }

  private sessionKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }

  private apiKeyValidationCacheKey(apiKey: string): string {
    const hash = createHash('sha256').update(apiKey).digest('hex');
    return `auth:api-key-validation:${hash}`;
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TTL_SEC * 1000,
      path: '/api/v1/auth',
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  }
}
