import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { randomUUID, createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { RedisService } from 'src/infra/redis/redis.service';
import { UserContext } from './user-context';

export interface CollabTokenPayload {
  sub: string;
  pageId: string;
  sessionId: string;
  clientId: string;
  role: string;
  readOnly: boolean;
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
  clientId?: string | null;
  displayName: string;
  apiKey: string;
  refreshTokenId: string;
}

interface ApiKeyValidationCacheEntry {
  userId: string;
  clientId?: string | null;
  suggestedDisplayName: string | null;
}

interface AuthUserRecord {
  userId: string;
  clientId: string | null;
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
    private readonly prisma: PrismaService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET', 'wikilive-dev-secret');
    this.mwsBaseUrl = this.configService.get<string>(
      'MWS_TABLES_BASE_URL',
      'https://tables.mws.ru/fusion/v1',
    );
  }

  private get userRepository(): {
    findUnique: (args: unknown) => Promise<AuthUserRecord | null>;
    create: (args: unknown) => Promise<AuthUserRecord>;
    update: (args: unknown) => Promise<AuthUserRecord>;
  } {
    return (this.prisma as PrismaService & { user: AuthService['userRepository'] }).user;
  }

  async login(
    apiKey: string,
    response: Response,
    displayName?: string,
  ): Promise<
    | { status: 'authorized' }
    | {
        status: 'display_name_required';
        profile: { userId: string; clientId: string | null; suggestedDisplayName: string | null };
      }
  > {
    const profile = await this.validateApiKey(apiKey.trim());
    const existingUser = await this.getUserByIdCached(profile.userId);
    const normalizedDisplayName = displayName?.trim();

    if (!existingUser && !normalizedDisplayName) {
      return {
        status: 'display_name_required',
        profile: {
          userId: profile.userId,
          clientId: profile.clientId ?? null,
          suggestedDisplayName: profile.suggestedDisplayName,
        },
      };
    }

    let user =
      existingUser ??
      (await this.createUser({
        userId: profile.userId,
        clientId: profile.clientId ?? null,
        displayName: normalizedDisplayName!,
      }));

    if (user.clientId !== profile.clientId && profile.clientId) {
      user = await this.updateCachedUser({
        ...user,
        clientId: profile.clientId,
      });
    }

    const sessionId = randomUUID();
    const refreshTokenId = randomUUID();
    const session: AuthSession = {
      userId: user.userId,
      clientId: user.clientId,
      displayName: user.displayName,
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
    return { status: 'authorized' };
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
      clientId: session.clientId ?? null,
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

  issueCollabToken(
    user: UserContext,
    pageId: string,
    sessionId: string,
    clientId: string,
    access: { role: string | null; capabilities: { canEdit: boolean } },
  ): string {
    return this.jwtService.sign({
      sub: user.userId,
      pageId,
      sessionId,
      clientId,
      displayName: user.displayName,
      role: access.role ?? 'guest',
      readOnly: !access.capabilities.canEdit,
    });
  }

  verifyCollabToken(token: string): CollabTokenPayload {
    try {
      return this.jwtService.verify<CollabTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid collaboration token');
    }
  }

  async updateDisplayName(user: UserContext, displayName: string) {
    const normalizedDisplayName = displayName.trim();
    const updated = await this.userRepository.update({
      where: { userId: user.userId },
      data: { displayName: normalizedDisplayName },
    });
    await this.cacheUser(updated);

    if (user.sessionId) {
      const session = await this.redisService.getJson<AuthSession>(this.sessionKey(user.sessionId));
      if (session) {
        await this.redisService.setJson(
          this.sessionKey(user.sessionId),
          {
            ...session,
            displayName: normalizedDisplayName,
          },
          REFRESH_TTL_SEC,
        );
      }
    }

    return updated;
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

      const payload = response.data?.data ?? {};
      const spaces = payload?.spaces ?? [];
      const hash = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
      const user = payload?.user ?? payload?.profile ?? payload?.me ?? {};
      const clientIdValue = user?.clientId ?? user?.client_id ?? payload?.clientId ?? payload?.client_id ?? null;
      const userIdValue =
        user?.userId ??
        user?.user_id ??
        user?.id ??
        payload?.userId ??
        payload?.user_id ??
        clientIdValue ??
        `mws_${hash}`;
      const profile: ApiKeyValidationCacheEntry = {
        userId: String(userIdValue),
        clientId: clientIdValue ? String(clientIdValue) : null,
        suggestedDisplayName:
          typeof user?.displayName === 'string'
            ? user.displayName
            : typeof user?.name === 'string'
              ? user.name
              : null,
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

  private userCacheKey(userId: string): string {
    return `auth:user:${userId}`;
  }

  private async getUserByIdCached(userId: string): Promise<AuthUserRecord | null> {
    const cached = await this.redisService.getJson<AuthUserRecord>(this.userCacheKey(userId));
    if (cached) {
      return cached;
    }

    const user = await this.userRepository.findUnique({
      where: { userId },
      select: {
        userId: true,
        clientId: true,
        displayName: true,
      },
    });

    if (!user) {
      return null;
    }

    await this.cacheUser(user);
    return user;
  }

  private async createUser(user: AuthUserRecord): Promise<AuthUserRecord> {
    const created = await this.userRepository.create({
      data: {
        userId: user.userId,
        clientId: user.clientId,
        displayName: user.displayName,
      },
      select: {
        userId: true,
        clientId: true,
        displayName: true,
      },
    });

    await this.cacheUser(created);
    return created;
  }

  private async updateCachedUser(user: AuthUserRecord): Promise<AuthUserRecord> {
    const updated = await this.userRepository.update({
      where: { userId: user.userId },
      data: {
        clientId: user.clientId,
        displayName: user.displayName,
      },
      select: {
        userId: true,
        clientId: true,
        displayName: true,
      },
    });
    await this.cacheUser(updated);
    return updated;
  }

  private async cacheUser(user: AuthUserRecord): Promise<void> {
    await this.redisService.setJson(this.userCacheKey(user.userId), user, REFRESH_TTL_SEC);
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
