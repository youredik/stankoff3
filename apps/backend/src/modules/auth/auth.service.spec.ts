import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { User, UserRole } from '../user/user.entity';

// Mock KeycloakService module before importing AuthService
jest.mock('./keycloak.service', () => ({
  KeycloakService: jest.fn().mockImplementation(() => ({
    getAuthorizationUrl: jest.fn(),
    exchangeCode: jest.fn(),
    mapKeycloakRoleToAppRole: jest.fn(),
    refreshTokens: jest.fn(),
    getLogoutUrl: jest.fn(),
  })),
}));

// Import AuthService after mocking KeycloakService
import { AuthService } from './auth.service';
import { KeycloakService } from './keycloak.service';
import { RoleService } from '../rbac/role.service';

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<UserService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    password: 'hashedPassword',
    firstName: 'Test',
    lastName: 'User',
    avatar: undefined as any,
    department: undefined as any,
    role: UserRole.EMPLOYEE,
    roleId: null,
    globalRole: null as any,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockUserService = {
      findByEmail: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockRoleService = {
      findBySlug: jest.fn().mockResolvedValue({ id: 'role-employee', slug: 'employee' }),
      getDefaultRole: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: KeycloakService, useValue: new (KeycloakService as any)() },
        { provide: RoleService, useValue: mockRoleService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get(UserService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  describe('login', () => {
    it('должен вернуть access и refresh токены', async () => {
      jwtService.sign
        .mockReturnValueOnce('accessToken')
        .mockReturnValueOnce('refreshToken');
      configService.get.mockReturnValue('refresh-secret');

      const result = await service.login(mockUser);

      expect(result).toEqual({
        accessToken: 'accessToken',
        refreshToken: 'refreshToken',
      });
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshTokens', () => {
    it('должен обновить токены при валидном refresh token', async () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'employee' };
      jwtService.verify.mockReturnValue(payload);
      userService.findOne.mockResolvedValue(mockUser);
      jwtService.sign
        .mockReturnValueOnce('newAccessToken')
        .mockReturnValueOnce('newRefreshToken');
      configService.get.mockReturnValue('refresh-secret');

      const result = await service.refreshTokens('validRefreshToken');

      expect(result).toEqual({
        accessToken: 'newAccessToken',
        refreshToken: 'newRefreshToken',
      });
    });

    it('должен выбросить UnauthorizedException при невалидном токене', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshTokens('invalidToken')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('должен выбросить UnauthorizedException если пользователь неактивен', async () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'employee' };
      jwtService.verify.mockReturnValue(payload);
      userService.findOne.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(service.refreshTokens('validToken')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getProfile', () => {
    it('должен вернуть профиль пользователя', async () => {
      userService.findOne.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-1');

      expect(result).toEqual(mockUser);
      expect(userService.findOne).toHaveBeenCalledWith('user-1');
    });
  });
});
