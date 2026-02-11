import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { UserService } from '../../user/user.service';
import { User, UserRole } from '../../user/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let userService: jest.Mocked<UserService>;

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    password: 'hashed',
    firstName: 'Test',
    lastName: 'User',
    avatar: null,
    department: null,
    role: UserRole.EMPLOYEE,
    roleId: null,
    globalRole: null as any,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPayload: JwtPayload = {
    sub: 'user-1',
    email: 'test@example.com',
    role: UserRole.EMPLOYEE,
  };

  beforeEach(async () => {
    const mockUserService = {
      findOne: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('test-jwt-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: UserService, useValue: mockUserService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    userService = module.get(UserService);
  });

  describe('validate', () => {
    it('должен вернуть пользователя для валидного payload', async () => {
      userService.findOne.mockResolvedValue(mockUser);

      const result = await strategy.validate(mockPayload);

      expect(result).toEqual(mockUser);
      expect(userService.findOne).toHaveBeenCalledWith('user-1');
    });

    it('должен выбросить UnauthorizedException если пользователь не найден', async () => {
      userService.findOne.mockResolvedValue(null);

      await expect(
        strategy.validate({ ...mockPayload, sub: 'non-existent' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('должен выбросить UnauthorizedException если пользователь неактивен', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      userService.findOne.mockResolvedValue(inactiveUser);

      await expect(strategy.validate(mockPayload)).rejects.toThrow(UnauthorizedException);
    });

    it('должен выбросить UnauthorizedException с правильным сообщением', async () => {
      userService.findOne.mockResolvedValue(null);

      await expect(strategy.validate(mockPayload)).rejects.toThrow(
        'Пользователь не найден или неактивен',
      );
    });

    it('должен корректно обработать ошибку userService', async () => {
      userService.findOne.mockRejectedValue(new Error('Database error'));

      await expect(strategy.validate(mockPayload)).rejects.toThrow('Database error');
    });
  });

  describe('constructor', () => {
    it('должен использовать секрет по умолчанию если JWT_SECRET не задан', async () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          JwtStrategy,
          { provide: UserService, useValue: { findOne: jest.fn() } },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newStrategy = module.get<JwtStrategy>(JwtStrategy);
      expect(newStrategy).toBeDefined();
    });
  });
});
