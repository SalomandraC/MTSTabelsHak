import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UserContext } from 'src/auth/user-context';

type RequestWithUser = Request & { user?: UserContext; mwsToken?: string };

@Injectable()
export class DemoAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authRequired = this.configService.get<string>('AUTH_REQUIRED') === 'true';
    const authHeader = request.header('authorization');
    const mwsToken = request.header('x-mws-token') ?? authHeader ?? undefined;
    const explicitUserId = request.header('x-user-id');
    const explicitDisplayName = request.header('x-user-name');

    if (!explicitUserId && !authHeader && authRequired) {
      throw new UnauthorizedException('Authorization or x-user-id header is required');
    }

    const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim();
    const derivedUserId =
      explicitUserId ??
      (bearerToken ? `user_${bearerToken.slice(0, 12)}` : 'demo-user');

    request.user = {
      userId: derivedUserId,
      displayName: explicitDisplayName ?? `User ${derivedUserId.slice(0, 8)}`,
      authToken: bearerToken,
      mwsToken: mwsToken?.replace(/^Bearer\s+/i, '').trim(),
    };

    return true;
  }
}
