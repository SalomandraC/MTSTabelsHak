import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserContext } from './user-context';

export interface CollabTokenPayload {
  sub: string;
  pageId: string;
  sessionId: string;
  clientId: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

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
}
