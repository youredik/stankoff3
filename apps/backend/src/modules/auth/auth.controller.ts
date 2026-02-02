import {
  Controller,
  Post,
  Get,
  UseGuards,
  Request,
  Res,
  Query,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../user/user.entity';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 дней

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @Request() req: { user: User },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.login(
      req.user,
    );

    // Устанавливаем refresh token в HttpOnly cookie
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/api/auth',
    });

    // Возвращаем access token и данные пользователя
    const { password, ...userWithoutPassword } = req.user;
    return {
      accessToken,
      user: userWithoutPassword,
    };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Request() req: { cookies: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token не найден');
    }

    const tokens = await this.authService.refreshTokens(refreshToken);

    // Обновляем refresh token в cookie
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/api/auth',
    });

    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    // Очищаем refresh token cookie
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
    });

    return { message: 'Выход выполнен успешно' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: User) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // ==================== Auth Provider Info ====================

  @Public()
  @Get('provider')
  getProvider() {
    const provider = this.authService.getAuthProvider();
    return {
      provider,
      keycloakEnabled: provider === 'keycloak',
    };
  }

  // ==================== Keycloak SSO Endpoints ====================

  @Public()
  @Get('keycloak/login')
  async keycloakLogin(@Res() res: Response) {
    const provider = this.authService.getAuthProvider();
    if (provider !== 'keycloak') {
      throw new BadRequestException('Keycloak SSO не включен');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const redirectUri = `${frontendUrl}/api/auth/keycloak/callback`;

    const authUrl = await this.authService.getKeycloakAuthUrl(redirectUri);
    res.redirect(authUrl);
  }

  @Public()
  @Get('keycloak/callback')
  async keycloakCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const provider = this.authService.getAuthProvider();
    if (provider !== 'keycloak') {
      throw new BadRequestException('Keycloak SSO не включен');
    }

    if (!code || !state) {
      throw new BadRequestException('Отсутствует code или state');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const redirectUri = `${frontendUrl}/api/auth/keycloak/callback`;

    try {
      const { accessToken, refreshToken, user } = await this.authService.handleKeycloakCallback(
        code,
        redirectUri,
        state,
      );

      // Устанавливаем refresh token в HttpOnly cookie
      res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE,
        path: '/api/auth',
      });

      // Редирект на frontend с access token в query параметре
      // Frontend сохранит токен в памяти и очистит URL
      return res.redirect(`${frontendUrl}/dashboard?access_token=${accessToken}`);
    } catch (error) {
      // При ошибке редирект на страницу логина с ошибкой
      return res.redirect(`${frontendUrl}/login?error=sso_failed`);
    }
  }
}
