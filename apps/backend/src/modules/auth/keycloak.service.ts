import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as openidClient from 'openid-client';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { KeycloakUserInfo, KeycloakTokenPayload } from './interfaces/keycloak-user.interface';
import { UserRole } from '../user/user.entity';

@Injectable()
export class KeycloakService implements OnModuleInit {
  private readonly logger = new Logger(KeycloakService.name);
  private config: openidClient.Configuration | null = null;
  private issuer: string = '';
  private isDev: boolean = false;

  constructor(private configService: ConfigService) {
    this.isDev = this.configService.get<string>('NODE_ENV') !== 'production';
  }

  async onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.log('Keycloak SSO отключен (AUTH_PROVIDER != keycloak)');
      return;
    }

    await this.initializeClient();
  }

  isEnabled(): boolean {
    return this.configService.get<string>('AUTH_PROVIDER') === 'keycloak';
  }

  private async initializeClient() {
    const keycloakUrl = this.configService.get<string>('KEYCLOAK_URL');
    const realm = this.configService.get<string>('KEYCLOAK_REALM');
    const clientId = this.configService.get<string>('KEYCLOAK_CLIENT_ID');
    const clientSecret = this.configService.get<string>('KEYCLOAK_CLIENT_SECRET');

    if (!keycloakUrl || !realm || !clientId) {
      this.logger.error('Keycloak не настроен: проверьте KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID');
      return;
    }

    this.issuer = `${keycloakUrl}/realms/${realm}`;

    try {
      // Разрешаем HTTP для development (openid-client по умолчанию требует HTTPS)
      // В openid-client v6 используем опцию execute с функцией allowInsecureRequests
      this.config = await openidClient.discovery(
        new URL(this.issuer),
        clientId,
        clientSecret,
        undefined,
        this.isDev ? { execute: [openidClient.allowInsecureRequests] } : undefined,
      );
      this.logger.log(`Keycloak инициализирован: ${this.issuer}`);
    } catch (error) {
      this.logger.error(`Ошибка инициализации Keycloak: ${error}`);
    }
  }

  async getAuthorizationUrl(redirectUri: string, state: string): Promise<string> {
    if (!this.config) {
      throw new Error('Keycloak не инициализирован');
    }

    const codeVerifier = openidClient.randomPKCECodeVerifier();
    const codeChallenge = await openidClient.calculatePKCECodeChallenge(codeVerifier);

    // Сохраняем code_verifier в state для простоты (в production лучше использовать сессии)
    const fullState = JSON.stringify({ state, codeVerifier });
    const encodedState = Buffer.from(fullState).toString('base64url');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.configService.get<string>('KEYCLOAK_CLIENT_ID') || '',
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state: encodedState,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${this.issuer}/protocol/openid-connect/auth?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
    encodedState: string,
    _iss?: string,
    _sessionState?: string,
  ): Promise<{ accessToken: string; refreshToken?: string; idToken?: string; userInfo: KeycloakUserInfo }> {
    // Декодируем state для получения code_verifier
    const stateJson = Buffer.from(encodedState, 'base64url').toString();
    const { codeVerifier } = JSON.parse(stateJson);

    const clientId = this.configService.get<string>('KEYCLOAK_CLIENT_ID') || '';
    const clientSecret = this.configService.get<string>('KEYCLOAK_CLIENT_SECRET') || '';
    const tokenEndpoint = `${this.issuer}/protocol/openid-connect/token`;

    this.logger.log(`Exchanging code for tokens via direct HTTP, endpoint: ${tokenEndpoint}`);

    // Прямой HTTP запрос к token endpoint
    const tokenResponse = await axios.post(
      tokenEndpoint,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const { access_token, refresh_token, id_token } = tokenResponse.data;
    this.logger.log('Token exchange successful');

    // Декодируем id_token для получения claims (без проверки подписи в dev)
    const decoded = jwt.decode(id_token) as Record<string, unknown>;

    const userInfo: KeycloakUserInfo = {
      sub: (decoded?.sub as string) || '',
      email: (decoded?.email as string) || '',
      email_verified: decoded?.email_verified as boolean,
      preferred_username: decoded?.preferred_username as string,
      given_name: decoded?.given_name as string,
      family_name: decoded?.family_name as string,
      name: decoded?.name as string,
      realm_access: decoded?.realm_access as { roles: string[] },
    };

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      idToken: id_token,
      userInfo,
    };
  }

  async validateAccessToken(accessToken: string): Promise<KeycloakTokenPayload | null> {
    if (!this.config) {
      return null;
    }

    try {
      const introspection = await openidClient.tokenIntrospection(
        this.config,
        accessToken,
      );

      if (!introspection.active) {
        return null;
      }

      return {
        exp: introspection.exp || 0,
        iat: introspection.iat || 0,
        iss: introspection.iss || this.issuer,
        sub: introspection.sub || '',
        email: introspection.email as string,
        preferred_username: introspection.username as string,
        given_name: introspection.given_name as string,
        family_name: introspection.family_name as string,
        realm_access: introspection.realm_access as { roles: string[] },
      };
    } catch (error) {
      this.logger.warn(`Ошибка валидации токена: ${error}`);
      return null;
    }
  }

  async refreshTokens(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    userInfo: KeycloakUserInfo;
  } | null> {
    if (!this.config) {
      return null;
    }

    try {
      const tokens = await openidClient.refreshTokenGrant(
        this.config,
        refreshToken,
      );

      const claims = tokens.claims();

      const userInfo: KeycloakUserInfo = {
        sub: claims?.sub || '',
        email: (claims?.email as string) || '',
        preferred_username: claims?.preferred_username as string,
        given_name: claims?.given_name as string,
        family_name: claims?.family_name as string,
      };

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        userInfo,
      };
    } catch (error) {
      this.logger.warn(`Ошибка обновления токена: ${error}`);
      return null;
    }
  }

  getLogoutUrl(postLogoutRedirectUri: string, idTokenHint?: string): string {
    if (!this.issuer) {
      throw new Error('Keycloak не инициализирован');
    }

    const clientId = this.configService.get<string>('KEYCLOAK_CLIENT_ID') || '';

    const params = new URLSearchParams({
      client_id: clientId,
      post_logout_redirect_uri: postLogoutRedirectUri,
    });

    // id_token_hint позволяет пропустить страницу подтверждения выхода
    if (idTokenHint) {
      params.append('id_token_hint', idTokenHint);
    }

    return `${this.issuer}/protocol/openid-connect/logout?${params.toString()}`;
  }

  mapKeycloakRoleToAppRole(keycloakRoles: string[]): UserRole {
    // Маппинг ролей Keycloak на роли приложения
    if (keycloakRoles.includes('admin') || keycloakRoles.includes('realm-admin')) {
      return UserRole.ADMIN;
    }
    if (keycloakRoles.includes('manager')) {
      return UserRole.MANAGER;
    }
    return UserRole.EMPLOYEE;
  }
}
