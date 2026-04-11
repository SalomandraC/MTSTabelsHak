import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { UserContext } from './user-context';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';

@Controller('/api/v1')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @HttpCode(204)
  @Post('/auth/login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.authService.login(dto.apiKey, response);
  }

  @Public()
  @Post('/auth/refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string; expiresInSec: number }> {
    const refreshToken = this.authService.readRefreshTokenFromCookie(request.headers.cookie);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    return this.authService.refresh(refreshToken, response);
  }

  @Public()
  @HttpCode(204)
  @Post('/auth/logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const refreshToken = this.authService.readRefreshTokenFromCookie(request.headers.cookie);
    await this.authService.logout(refreshToken, response);
  }

  @Get('/me')
  async me(@CurrentUser() user: UserContext) {
    return {
      user: {
        userId: user.userId,
        displayName: user.displayName,
      },
    };
  }
}