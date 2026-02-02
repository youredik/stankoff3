import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { User } from '../user/user.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { KeycloakService } from './keycloak.service';
import { KeycloakUserInfo } from './interfaces/keycloak-user.interface';

export interface TokensResponse {
  accessToken: string;
  user: Omit<User, 'password'>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private keycloakService: KeycloakService,
  ) {}

  async login(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.userService.findOne(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Пользователь не найден или неактивен');
      }

      return this.login(user);
    } catch {
      throw new UnauthorizedException('Недействительный refresh token');
    }
  }

  async getProfile(userId: string): Promise<User | null> {
    return this.userService.findOne(userId);
  }

  // ==================== Keycloak SSO ====================

  async getKeycloakAuthUrl(redirectUri: string): Promise<string> {
    const state = Math.random().toString(36).substring(7);
    return this.keycloakService.getAuthorizationUrl(redirectUri, state);
  }

  async handleKeycloakCallback(
    code: string,
    redirectUri: string,
    state: string,
    iss?: string,
    sessionState?: string,
  ): Promise<{ accessToken: string; refreshToken: string; idToken?: string; user: User }> {
    // Обмениваем code на токены от Keycloak
    const keycloakTokens = await this.keycloakService.exchangeCode(code, redirectUri, state, iss, sessionState);

    // Находим или создаём пользователя
    const user = await this.findOrCreateUserFromKeycloak(keycloakTokens.userInfo);

    // Генерируем собственные JWT токены приложения
    const tokens = await this.login(user);

    return {
      ...tokens,
      idToken: keycloakTokens.idToken, // Сохраняем для logout
      user,
    };
  }

  async findOrCreateUserFromKeycloak(userInfo: KeycloakUserInfo): Promise<User> {
    // Пробуем найти пользователя по email
    let user = await this.userService.findByEmail(userInfo.email);

    if (user) {
      // Обновляем информацию из Keycloak, если пользователь уже существует
      const updates: Partial<User> = {};

      if (userInfo.given_name && user.firstName !== userInfo.given_name) {
        updates.firstName = userInfo.given_name;
      }
      if (userInfo.family_name && user.lastName !== userInfo.family_name) {
        updates.lastName = userInfo.family_name;
      }

      if (Object.keys(updates).length > 0) {
        await this.userService.update(user.id, updates);
        user = await this.userService.findOne(user.id);
      }

      this.logger.log(`Keycloak SSO: пользователь ${userInfo.email} авторизован`);
      return user!;
    }

    // Создаём нового пользователя (auto-provisioning)
    const keycloakRoles = userInfo.realm_access?.roles || [];
    const appRole = this.keycloakService.mapKeycloakRoleToAppRole(keycloakRoles);

    // Генерируем случайный пароль (не используется при SSO, но поле обязательное)
    const randomPassword = Math.random().toString(36).slice(-16);
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    const newUser = await this.userService.create({
      email: userInfo.email,
      password: hashedPassword,
      firstName: userInfo.given_name || userInfo.preferred_username || 'User',
      lastName: userInfo.family_name || '',
      role: appRole,
      isActive: true,
    });

    this.logger.log(
      `Keycloak SSO: создан новый пользователь ${userInfo.email} с ролью ${appRole}`,
    );

    return newUser;
  }

  async refreshKeycloakTokens(keycloakRefreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: User;
  } | null> {
    const result = await this.keycloakService.refreshTokens(keycloakRefreshToken);
    if (!result) {
      return null;
    }

    const user = await this.findOrCreateUserFromKeycloak(result.userInfo);
    const tokens = await this.login(user);

    return {
      ...tokens,
      user,
    };
  }

  getKeycloakLogoutUrl(postLogoutRedirectUri: string, idTokenHint?: string): string {
    return this.keycloakService.getLogoutUrl(postLogoutRedirectUri, idTokenHint);
  }
}
