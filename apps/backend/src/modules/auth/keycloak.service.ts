import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as openidClient from 'openid-client';
import { KeycloakUserInfo, KeycloakTokenPayload } from './interfaces/keycloak-user.interface';
import { UserRole } from '../user/user.entity';

@Injectable()
export class KeycloakService implements OnModuleInit {
  private readonly logger = new Logger(KeycloakService.name);
  private config: openidClient.Configuration | null = null;
  private issuer: string = '';

  constructor(private configService: ConfigService) {}

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
      this.config = await openidClient.discovery(
        new URL(this.issuer),
        clientId,
        clientSecret,
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
  ): Promise<{ accessToken: string; refreshToken?: string; userInfo: KeycloakUserInfo }> {
    if (!this.config) {
      throw new Error('Keycloak не инициализирован');
    }

    // Декодируем state для получения code_verifier
    const stateJson = Buffer.from(encodedState, 'base64url').toString();
    const { codeVerifier } = JSON.parse(stateJson);

    const tokens = await openidClient.authorizationCodeGrant(
      this.config,
      new URL(`${redirectUri}?code=${code}&state=${encodedState}`),
      {
        pkceCodeVerifier: codeVerifier,
        expectedState: encodedState,
      },
    );

    const claims = tokens.claims();

    const userInfo: KeycloakUserInfo = {
      sub: claims?.sub || '',
      email: (claims?.email as string) || '',
      email_verified: claims?.email_verified as boolean,
      preferred_username: claims?.preferred_username as string,
      given_name: claims?.given_name as string,
      family_name: claims?.family_name as string,
      name: claims?.name as string,
      realm_access: claims?.realm_access as { roles: string[] },
    };

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
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

  getLogoutUrl(idToken: string, postLogoutRedirectUri: string): string {
    if (!this.config) {
      throw new Error('Keycloak не инициализирован');
    }

    const params = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: postLogoutRedirectUri,
    });

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
