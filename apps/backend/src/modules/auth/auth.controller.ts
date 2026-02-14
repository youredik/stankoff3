import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  Res,
  Query,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../user/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const ID_TOKEN_COOKIE = 'keycloak_id_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 дней

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly isSecure: boolean;

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    // secure cookie: true для любого HTTPS (preprod и production), false для localhost dev
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || '';
    this.isSecure = frontendUrl.startsWith('https://');
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Request() req: { cookies: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.debug('Refresh endpoint called');
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      this.logger.debug('Refresh token not found in cookies');
      throw new UnauthorizedException('Refresh token не найден');
    }
    this.logger.debug('Refresh token found, refreshing');

    const tokens = await this.authService.refreshTokens(refreshToken);

    // Обновляем refresh token в cookie
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.isSecure,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/api',
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
    this.logger.debug('Logout: id_token present: %s', !!idToken);

    // Очищаем refresh token cookie
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: this.isSecure,
      sameSite: 'lax',
      path: '/api',
    });

    // Очищаем id_token cookie
    res.clearCookie(ID_TOKEN_COOKIE, {
      httpOnly: true,
      secure: this.isSecure,
      sameSite: 'lax',
      path: '/api',
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    // Возвращаем URL для logout из Keycloak
    // Добавляем ?logout=success чтобы страница /login не делала автоматический редирект на SSO
    const keycloakLogoutUrl = this.authService.getKeycloakLogoutUrl(frontendUrl + '/login?logout=success', idToken);
    return { message: 'Выход выполнен успешно', keycloakLogoutUrl };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: User) {
    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.authService.updateProfile(user.id, dto);
    const { password: _password, ...result } = updated;
    return result;
  }

  // ==================== Keycloak SSO Endpoints ====================

  @Public()
  @Get('keycloak/login')
  async keycloakLogin(@Res() res: Response) {
    // Callback идёт на backend через nginx
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    // Используем тот же домен что и frontend, но endpoint на backend
    const baseUrl = frontendUrl.replace(/\/$/, ''); // убираем trailing slash
    const redirectUri = `${baseUrl}/api/auth/keycloak/callback`;

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
    const baseUrl = frontendUrl.replace(/\/$/, ''); // убираем trailing slash
    const redirectUri = `${baseUrl}/api/auth/keycloak/callback`;

    try {
      this.logger.debug('Keycloak callback: processing authorization code');
      const { accessToken, refreshToken, idToken } = await this.authService.handleKeycloakCallback(
        code,
        redirectUri,
        state,
        iss,
        sessionState,
      );
      this.logger.debug('Keycloak callback: tokens received');

      // Устанавливаем refresh token в HttpOnly cookie
      res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
        httpOnly: true,
        secure: this.isSecure,
        sameSite: 'lax', // lax для cross-origin redirect
        maxAge: COOKIE_MAX_AGE,
        path: '/api',
      });

      // Сохраняем id_token для logout (позволяет пропустить страницу подтверждения)
      this.logger.debug('Keycloak callback: idToken present: %s', !!idToken);
      if (idToken) {
        res.cookie(ID_TOKEN_COOKIE, idToken, {
          httpOnly: true,
          secure: this.isSecure,
          sameSite: 'lax',
          maxAge: COOKIE_MAX_AGE,
          path: '/api',
        });
      }

      // Редирект на frontend с access token в query параметре
      // Frontend (AuthProvider на /workspace) сохранит токен в памяти и очистит URL
      return res.redirect(`${frontendUrl}/workspace?access_token=${accessToken}`);
    } catch (error) {
      this.logger.error('Keycloak callback error: %s', (error as Error).message);
      // При ошибке редирект на страницу логина с ошибкой
      return res.redirect(`${frontendUrl}/login?error=sso_failed`);
    }
  }
}
