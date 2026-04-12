import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from 'src/auth/auth.service';
import { UserContext } from 'src/auth/user-context';
import { IS_PUBLIC_ROUTE } from 'src/common/decorators/public.decorator';

type RequestWithUser = Request & { user?: UserContext };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const authRequired = this.configService.get<string>('AUTH_REQUIRED', 'true') === 'true';
    const authorization = request.header('authorization');
    const bearerToken = authorization?.replace(/^Bearer\s+/i, '').trim();
    const hasDemoHeaders = Boolean(request.header('x-user-id') || request.header('x-user-name'));

    if (isPublic) {
      if (bearerToken) {
        try {
          request.user = await this.authService.resolveUserFromAccessToken(bearerToken);
        } catch {
          // Public routes may continue as anonymous when an auth token is absent or invalid.
        }
      } else if (!authRequired && hasDemoHeaders) {
        this.attachDemoUser(request);
      }

      return true;
    }

    if (!bearerToken) {
      if (!authRequired) {
        this.attachDemoUser(request);
        return true;
      }

      throw new UnauthorizedException('Authorization header is required');
    }

    const user = await this.authService.resolveUserFromAccessToken(bearerToken);
    request.user = user;
    return true;
  }

  private attachDemoUser(request: RequestWithUser): void {
    const explicitUserId = request.header('x-user-id');
    const explicitDisplayName = request.header('x-user-name');
    const mwsToken = request.header('x-mws-token')?.replace(/^Bearer\s+/i, '').trim();

    const userId = explicitUserId ?? 'demo-user';
    request.user = {
      userId,
      displayName: explicitDisplayName ?? `User ${userId.slice(0, 8)}`,
      mwsToken,
    };
  }
}
