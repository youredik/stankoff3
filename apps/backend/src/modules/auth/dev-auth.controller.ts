import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { Public } from './decorators/public.decorator';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 дней (как в auth.controller.ts)

@Controller('auth/dev')
export class DevAuthController {
  private readonly logger = new Logger(DevAuthController.name);
  private readonly isSecure: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || '';
    this.isSecure = frontendUrl.startsWith('https://');
  }

  private assertDevMode(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev auth is disabled in production');
    }
    if (process.env.AUTH_DEV_MODE !== 'true') {
      throw new ForbiddenException('Dev auth is disabled. Set AUTH_DEV_MODE=true');
    }
  }

  @Public()
  @Get('users')
  async getUsers() {
    this.assertDevMode();

    const users = await this.userService.findAll();
    return users
      .filter((u) => u.isActive)
      .sort((a, b) => {
        if (a.email === 'youredik@gmail.com') return -1;
        if (b.email === 'youredik@gmail.com') return 1;
        return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'ru');
      })
      .slice(0, 100)
      .map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        avatar: u.avatar,
      }));
  }

  @Public()
  @Post('login')
  async login(
    @Body() body: { email: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertDevMode();

    const user = await this.userService.findByEmail(body.email);
    if (!user) {
      throw new NotFoundException(`User with email ${body.email} not found`);
    }

    const { accessToken, refreshToken } = await this.authService.login(user);

    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.isSecure,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/api',
    });

    this.logger.log(`Dev login: ${user.email} (${user.role})`);

    return { accessToken };
  }
}
