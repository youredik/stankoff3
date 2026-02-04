/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KeycloakService } from './keycloak.service';
import { UserRole } from '../user/user.entity';

// Mock openid-client
jest.mock('openid-client', () => ({
  discovery: jest.fn().mockResolvedValue({}),
  randomPKCECodeVerifier: jest.fn().mockReturnValue('mock-code-verifier'),
  calculatePKCECodeChallenge: jest.fn().mockResolvedValue('mock-code-challenge'),
  allowInsecureRequests: jest.fn(),
  tokenIntrospection: jest.fn(),
  refreshTokenGrant: jest.fn(),
}));

// Mock axios
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));
import axios from 'axios';
const mockAxiosPost = axios.post as jest.Mock;

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  decode: jest.fn().mockReturnValue({
    sub: 'user-123',
    email: 'test@example.com',
    email_verified: true,
    preferred_username: 'testuser',
    given_name: 'Test',
    family_name: 'User',
    name: 'Test User',
    realm_access: { roles: ['user'] },
  }),
}));

describe('KeycloakService', () => {
  let service: KeycloakService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          AUTH_PROVIDER: 'keycloak',
          KEYCLOAK_URL: 'https://keycloak.example.com',
          KEYCLOAK_REALM: 'test-realm',
          KEYCLOAK_CLIENT_ID: 'test-client',
          KEYCLOAK_CLIENT_SECRET: 'test-secret',
          NODE_ENV: 'development',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeycloakService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<KeycloakService>(KeycloakService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('должен вернуть true если AUTH_PROVIDER = keycloak', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('должен вернуть false если AUTH_PROVIDER != keycloak', () => {
      configService.get.mockImplementation((key) => {
        if (key === 'AUTH_PROVIDER') return 'local';
        return 'value';
      });

      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('onModuleInit', () => {
    it('должен инициализировать клиент если Keycloak включен', async () => {
      const openidClient = require('openid-client');

      await service.onModuleInit();

      expect(openidClient.discovery).toHaveBeenCalled();
    });

    it('не должен инициализировать если Keycloak отключен', async () => {
      configService.get.mockImplementation((key) => {
        if (key === 'AUTH_PROVIDER') return 'local';
        return 'value';
      });

      const openidClient = require('openid-client');
      openidClient.discovery.mockClear();

      await service.onModuleInit();

      expect(openidClient.discovery).not.toHaveBeenCalled();
    });

    it('должен обработать ошибку инициализации', async () => {
      const openidClient = require('openid-client');
      openidClient.discovery.mockRejectedValueOnce(new Error('Connection failed'));

      // Не должно выбрасывать исключение
      await service.onModuleInit();
    });

    it('не должен инициализировать без обязательных настроек', async () => {
      configService.get.mockImplementation((key) => {
        if (key === 'AUTH_PROVIDER') return 'keycloak';
        return undefined;
      });

      const openidClient = require('openid-client');
      openidClient.discovery.mockClear();

      await service.onModuleInit();

      expect(openidClient.discovery).not.toHaveBeenCalled();
    });
  });

  describe('getAuthorizationUrl', () => {
    beforeEach(async () => {
      // Set config to enable methods
      (service as any).config = {};
      (service as any).issuer = 'https://keycloak.example.com/realms/test-realm';
    });

    it('должен сгенерировать URL авторизации', async () => {
      const url = await service.getAuthorizationUrl('https://app.example.com/callback', 'state123');

      expect(url).toContain('keycloak.example.com');
      expect(url).toContain('protocol/openid-connect/auth');
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=test-client');
    });

    it('должен выбросить ошибку если Keycloak не инициализирован', async () => {
      (service as any).config = null;

      await expect(service.getAuthorizationUrl('callback', 'state')).rejects.toThrow(
        'Keycloak не инициализирован',
      );
    });
  });

  describe('exchangeCode', () => {
    beforeEach(() => {
      (service as any).issuer = 'https://keycloak.example.com/realms/test-realm';
    });

    it('должен обменять код на токены', async () => {
      mockAxiosPost.mockResolvedValue({
        data: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          id_token: 'id-token',
        },
      });

      const state = Buffer.from(JSON.stringify({ state: 'state123', codeVerifier: 'verifier' })).toString('base64url');

      const result = await service.exchangeCode('code123', 'https://app/callback', state);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.idToken).toBe('id-token');
      expect(result.userInfo.email).toBe('test@example.com');
    });
  });

  describe('validateAccessToken', () => {
    it('должен вернуть null если Keycloak не инициализирован', async () => {
      (service as any).config = null;

      const result = await service.validateAccessToken('token');

      expect(result).toBeNull();
    });

    it('должен валидировать активный токен', async () => {
      (service as any).config = {};
      (service as any).issuer = 'https://keycloak.example.com/realms/test-realm';

      const openidClient = require('openid-client');
      openidClient.tokenIntrospection.mockResolvedValue({
        active: true,
        exp: 9999999999,
        iat: 1111111111,
        sub: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });

      const result = await service.validateAccessToken('token');

      expect(result).not.toBeNull();
      expect(result?.sub).toBe('user-123');
    });

    it('должен вернуть null для неактивного токена', async () => {
      (service as any).config = {};

      const openidClient = require('openid-client');
      openidClient.tokenIntrospection.mockResolvedValue({ active: false });

      const result = await service.validateAccessToken('invalid-token');

      expect(result).toBeNull();
    });

    it('должен обработать ошибку валидации', async () => {
      (service as any).config = {};

      const openidClient = require('openid-client');
      openidClient.tokenIntrospection.mockRejectedValue(new Error('Validation error'));

      const result = await service.validateAccessToken('token');

      expect(result).toBeNull();
    });
  });

  describe('refreshTokens', () => {
    it('должен вернуть null если Keycloak не инициализирован', async () => {
      (service as any).config = null;

      const result = await service.refreshTokens('refresh-token');

      expect(result).toBeNull();
    });

    it('должен обновить токены', async () => {
      (service as any).config = {};

      const openidClient = require('openid-client');
      openidClient.refreshTokenGrant.mockResolvedValue({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        claims: () => ({
          sub: 'user-123',
          email: 'test@example.com',
        }),
      });

      const result = await service.refreshTokens('old-refresh-token');

      expect(result?.accessToken).toBe('new-access-token');
      expect(result?.refreshToken).toBe('new-refresh-token');
    });

    it('должен обработать ошибку обновления', async () => {
      (service as any).config = {};

      const openidClient = require('openid-client');
      openidClient.refreshTokenGrant.mockRejectedValue(new Error('Refresh error'));

      const result = await service.refreshTokens('invalid-refresh-token');

      expect(result).toBeNull();
    });
  });

  describe('getLogoutUrl', () => {
    beforeEach(() => {
      (service as any).issuer = 'https://keycloak.example.com/realms/test-realm';
    });

    it('должен сгенерировать URL выхода', () => {
      const url = service.getLogoutUrl('https://app.example.com/login');

      expect(url).toContain('protocol/openid-connect/logout');
      expect(url).toContain('client_id=test-client');
      expect(url).toContain('post_logout_redirect_uri');
    });

    it('должен добавить id_token_hint если передан', () => {
      const url = service.getLogoutUrl('https://app/login', 'id-token-hint');

      expect(url).toContain('id_token_hint=id-token-hint');
    });

    it('должен выбросить ошибку если Keycloak не инициализирован', () => {
      (service as any).issuer = '';

      expect(() => service.getLogoutUrl('callback')).toThrow('Keycloak не инициализирован');
    });
  });

  describe('mapKeycloakRoleToAppRole', () => {
    it('должен маппить admin роль', () => {
      expect(service.mapKeycloakRoleToAppRole(['admin'])).toBe(UserRole.ADMIN);
      expect(service.mapKeycloakRoleToAppRole(['realm-admin'])).toBe(UserRole.ADMIN);
    });

    it('должен маппить manager роль', () => {
      expect(service.mapKeycloakRoleToAppRole(['manager'])).toBe(UserRole.MANAGER);
    });

    it('должен возвращать EMPLOYEE по умолчанию', () => {
      expect(service.mapKeycloakRoleToAppRole(['user'])).toBe(UserRole.EMPLOYEE);
      expect(service.mapKeycloakRoleToAppRole([])).toBe(UserRole.EMPLOYEE);
    });
  });
});
