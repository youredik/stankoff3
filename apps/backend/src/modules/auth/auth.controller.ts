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
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../user/user.entity';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const ID_TOKEN_COOKIE = 'keycloak_id_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 дней

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

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
  async logout(
    @Request() req: { cookies: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Получаем id_token для logout hint (позволяет пропустить страницу подтверждения)
    const idToken = req.cookies?.[ID_TOKEN_COOKIE];

    // Очищаем refresh token cookie
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
    });

    // Очищаем id_token cookie
    res.clearCookie(ID_TOKEN_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    // Возвращаем URL для logout из Keycloak
    const keycloakLogoutUrl = this.authService.getKeycloakLogoutUrl(frontendUrl + '/login', idToken);
    return { message: 'Выход выполнен успешно', keycloakLogoutUrl };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: User) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // ==================== Keycloak SSO Endpoints ====================

  @Public()
  @Get('keycloak/login')
  async keycloakLogin(@Res() res: Response) {
    // Callback идёт на backend, не на frontend
    const backendPort = this.configService.get<string>('BACKEND_PORT') || '3001';
    const redirectUri = `http://localhost:${backendPort}/api/auth/keycloak/callback`;

    const authUrl = await this.authService.getKeycloakAuthUrl(redirectUri);
    res.redirect(authUrl);
  }

  @Public()
  @Get('keycloak/callback')
  async keycloakCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('iss') iss: string,
    @Query('session_state') sessionState: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!code || !state) {
      throw new BadRequestException('Отсутствует code или state');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const backendPort = this.configService.get<string>('BACKEND_PORT') || '3001';
    const redirectUri = `http://localhost:${backendPort}/api/auth/keycloak/callback`;

    try {
      console.log('Keycloak callback: code=', code?.substring(0, 20) + '...', 'state=', state?.substring(0, 20) + '...', 'iss=', iss, 'session_state=', sessionState?.substring(0, 10));
      const { accessToken, refreshToken, idToken } = await this.authService.handleKeycloakCallback(
        code,
        redirectUri,
        state,
        iss,
        sessionState,
      );
      console.log('Keycloak callback: tokens received');

      // Устанавливаем refresh token в HttpOnly cookie
      res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // lax для cross-origin redirect
        maxAge: COOKIE_MAX_AGE,
        path: '/api/auth',
      });

      // Сохраняем id_token для logout (позволяет пропустить страницу подтверждения)
      if (idToken) {
        res.cookie(ID_TOKEN_COOKIE, idToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: COOKIE_MAX_AGE,
          path: '/api/auth',
        });
      }

      // Редирект на frontend с access token в query параметре
      // Frontend сохранит токен в памяти и очистит URL
      return res.redirect(`${frontendUrl}/dashboard?access_token=${accessToken}`);
    } catch (error) {
      console.error('Keycloak callback error:', error);
      console.error('Error stack:', (error as Error).stack);
      // При ошибке редирект на страницу логина с ошибкой
      return res.redirect(`${frontendUrl}/login?error=sso_failed`);
    }
  }
}
