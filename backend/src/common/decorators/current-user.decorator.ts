import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserContext } from 'src/auth/user-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: UserContext }>();
    return request.user;
  },
);
