import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { KeycloakAdminService } from './keycloak-admin.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KeycloakAdminService', () => {
  let service: KeycloakAdminService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeycloakAdminService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<KeycloakAdminService>(KeycloakAdminService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isConfigured', () => {
    it('должен вернуть false если KEYCLOAK_URL не задан', () => {
      configService.get.mockReturnValue(undefined);
      expect(service.isConfigured()).toBe(false);
    });

    it('должен вернуть false если KEYCLOAK_REALM не задан', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'KEYCLOAK_URL') return 'https://keycloak.example.com';
        return undefined;
      });
      expect(service.isConfigured()).toBe(false);
    });

    it('должен вернуть true если настроены client credentials', () => {
      configService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          KEYCLOAK_URL: 'https://keycloak.example.com',
          KEYCLOAK_REALM: 'test-realm',
          KEYCLOAK_ADMIN_CLIENT_ID: 'admin-client',
          KEYCLOAK_ADMIN_CLIENT_SECRET: 'secret',
        };
        return config[key];
      });
      expect(service.isConfigured()).toBe(true);
    });

    it('должен вернуть true если настроены admin credentials', () => {
      configService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          KEYCLOAK_URL: 'https://keycloak.example.com',
          KEYCLOAK_REALM: 'test-realm',
          KEYCLOAK_ADMIN_USERNAME: 'admin',
          KEYCLOAK_ADMIN_PASSWORD: 'password',
        };
        return config[key];
      });
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('generateSecurePassword', () => {
    it('должен генерировать пароль заданной длины', () => {
      const password = service.generateSecurePassword(20);
      expect(password.length).toBe(20);
    });

    it('должен генерировать пароль минимум 16 символов по умолчанию', () => {
      const password = service.generateSecurePassword();
      expect(password.length).toBe(16);
    });

    it('должен содержать заглавные буквы', () => {
      const password = service.generateSecurePassword(32);
      expect(/[A-Z]/.test(password)).toBe(true);
    });

    it('должен содержать строчные буквы', () => {
      const password = service.generateSecurePassword(32);
      expect(/[a-z]/.test(password)).toBe(true);
    });

    it('должен содержать цифры', () => {
      const password = service.generateSecurePassword(32);
      expect(/[0-9]/.test(password)).toBe(true);
    });

    it('должен содержать спецсимволы', () => {
      const password = service.generateSecurePassword(32);
      expect(/[!@#$%^&*]/.test(password)).toBe(true);
    });

    it('должен генерировать уникальные пароли', () => {
      const passwords = new Set<string>();
      for (let i = 0; i < 100; i++) {
        passwords.add(service.generateSecurePassword());
      }
      // Все 100 паролей должны быть уникальными
      expect(passwords.size).toBe(100);
    });
  });

  describe('userExistsByEmail', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          KEYCLOAK_URL: 'https://keycloak.example.com',
          KEYCLOAK_REALM: 'test-realm',
          KEYCLOAK_ADMIN_CLIENT_ID: 'admin-client',
          KEYCLOAK_ADMIN_CLIENT_SECRET: 'secret',
        };
        return config[key];
      });

      // Mock token request
      mockedAxios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 },
      });

      // Mock axios.create to return a mock client
      mockedAxios.create.mockReturnValue({
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
      } as unknown as jest.Mocked<typeof axios>);
    });

    it('должен вернуть exists: true если пользователь найден', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.get as jest.Mock).mockResolvedValue({
        data: [{ id: 'user-123', email: 'test@example.com' }],
      });

      const result = await service.userExistsByEmail('test@example.com');
      expect(result.exists).toBe(true);
      expect(result.userId).toBe('user-123');
    });

    it('должен вернуть exists: false если пользователь не найден', async () => {
      const mockClient = mockedAxios.create();
      (mockClient.get as jest.Mock).mockResolvedValue({ data: [] });

      const result = await service.userExistsByEmail('notfound@example.com');
      expect(result.exists).toBe(false);
      expect(result.userId).toBeUndefined();
    });
  });

  describe('importLegacyEmployees', () => {
    const mockEmployees = [
      {
        id: 1,
        userId: 100,
        alias: 'john',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '123456789',
        departmentId: 1,
        departmentName: 'IT',
        isActive: true,
        canAcceptRequests: true,
        canSale: false,
        telegramId: '12345',
      },
      {
        id: 2,
        userId: 101,
        alias: 'jane',
        firstName: 'Jane',
        lastName: null,
        email: null, // Нет email — будет пропущен
        phone: null,
        departmentId: 2,
        departmentName: 'Sales',
        isActive: true,
        canAcceptRequests: false,
        canSale: true,
        telegramId: null,
      },
    ];

    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          KEYCLOAK_URL: 'https://keycloak.example.com',
          KEYCLOAK_REALM: 'test-realm',
          KEYCLOAK_ADMIN_CLIENT_ID: 'admin-client',
          KEYCLOAK_ADMIN_CLIENT_SECRET: 'secret',
        };
        return config[key];
      });

      mockedAxios.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 },
      });

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: [] }), // Нет существующих
        post: jest.fn().mockResolvedValue({
          headers: { location: '/users/new-user-id' },
        }),
        put: jest.fn().mockResolvedValue({}),
      } as unknown as jest.Mocked<typeof axios>);
    });

    it('должен пропустить сотрудников без email', async () => {
      const result = await service.importLegacyEmployees(mockEmployees, { dryRun: true });

      expect(result.skipped).toBe(1);
      expect(result.results.find((r) => r.username === 'jane')?.skipReason).toBe('Нет email');
    });

    it('должен генерировать пароль для каждого импортируемого', async () => {
      const result = await service.importLegacyEmployees(mockEmployees, { dryRun: true });

      const johnResult = result.results.find((r) => r.email === 'john@example.com');
      expect(johnResult?.temporaryPassword).toBeDefined();
      expect(johnResult?.temporaryPassword?.length).toBeGreaterThanOrEqual(16);
    });

    it('должен корректно считать статистику', async () => {
      const result = await service.importLegacyEmployees(mockEmployees, { dryRun: true });

      expect(result.total).toBe(2);
      expect(result.created).toBe(1); // John
      expect(result.skipped).toBe(1); // Jane (без email)
      expect(result.failed).toBe(0);
    });

    it('должен использовать email как username', async () => {
      const result = await service.importLegacyEmployees(mockEmployees, { dryRun: true });

      const johnResult = result.results.find((r) => r.email === 'john@example.com');
      expect(johnResult?.username).toBe('john@example.com');
    });
  });
});
