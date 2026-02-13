import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';

// Mock KeycloakService module before importing DevAuthController/AuthService
jest.mock('./keycloak.service', () => ({
  KeycloakService: jest.fn().mockImplementation(() => ({})),
}));

import { DevAuthController } from './dev-auth.controller';
import { AuthService } from './auth.service';

describe('DevAuthController', () => {
  let controller: DevAuthController;
  let authService: jest.Mocked<AuthService>;
  let userService: jest.Mocked<UserService>;
  let originalEnv: NodeJS.ProcessEnv;

  const mockUsers = [
    {
      id: 'user-1',
      email: 'admin@test.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      avatar: null,
      isActive: true,
      password: 'hashed',
    },
    {
      id: 'user-2',
      email: 'manager@test.com',
      firstName: 'Manager',
      lastName: 'User',
      role: 'manager',
      avatar: null,
      isActive: true,
      password: 'hashed',
    },
    {
      id: 'user-3',
      email: 'inactive@test.com',
      firstName: 'Inactive',
      lastName: 'User',
      role: 'employee',
      avatar: null,
      isActive: false,
      password: 'hashed',
    },
  ];

  beforeEach(async () => {
    originalEnv = { ...process.env };
    process.env.AUTH_DEV_MODE = 'true';
    process.env.NODE_ENV = 'development';

    const mockAuthService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      }),
    };

    const mockUserService = {
      findAll: jest.fn().mockResolvedValue(mockUsers),
      findByEmail: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'FRONTEND_URL') return 'http://localhost:3000';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevAuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: UserService, useValue: mockUserService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<DevAuthController>(DevAuthController);
    authService = module.get(AuthService);
    userService = module.get(UserService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getUsers', () => {
    it('должен вернуть список активных пользователей при AUTH_DEV_MODE=true', async () => {
      const result = await controller.getUsers();

      expect(result).toHaveLength(2); // inactive excluded
      expect(result[0]).toEqual({
        id: 'user-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
        avatar: null,
      });
      // Пароль не должен утечь
      expect(result[0]).not.toHaveProperty('password');
    });

    it('должен вернуть ForbiddenException при AUTH_DEV_MODE отключен', async () => {
      process.env.AUTH_DEV_MODE = 'false';

      await expect(controller.getUsers()).rejects.toThrow(ForbiddenException);
    });

    it('должен вернуть ForbiddenException при NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';

      await expect(controller.getUsers()).rejects.toThrow(ForbiddenException);
    });

    it('должен вернуть ForbiddenException если AUTH_DEV_MODE не задан', async () => {
      delete process.env.AUTH_DEV_MODE;

      await expect(controller.getUsers()).rejects.toThrow(ForbiddenException);
    });
  });

  describe('login', () => {
    const mockRes = {
      cookie: jest.fn(),
    } as any;

    it('должен вернуть accessToken при валидном email', async () => {
      userService.findByEmail.mockResolvedValue(mockUsers[0] as any);

      const result = await controller.login({ email: 'admin@test.com' }, mockRes);

      expect(result).toEqual({ accessToken: 'test-access-token' });
      expect(authService.login).toHaveBeenCalledWith(mockUsers[0]);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'test-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          path: '/api',
        }),
      );
    });

    it('должен вернуть NotFoundException при невалидном email', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(
        controller.login({ email: 'nonexistent@test.com' }, mockRes),
      ).rejects.toThrow(NotFoundException);
    });

    it('должен вернуть ForbiddenException при dev mode off', async () => {
      process.env.AUTH_DEV_MODE = 'false';

      await expect(
        controller.login({ email: 'admin@test.com' }, mockRes),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
