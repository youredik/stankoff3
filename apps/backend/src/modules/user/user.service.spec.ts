import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';
import { User, UserRole } from './user.entity';

jest.mock('bcrypt');

describe('UserService', () => {
  let service: UserService;
  let repository: jest.Mocked<Repository<User>>;

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
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get(getRepositoryToken(User));
  });

  describe('findAll', () => {
    it('должен вернуть массив пользователей', async () => {
      const users = [mockUser];
      repository.find.mockResolvedValue(users);

      const result = await service.findAll();

      expect(result).toEqual(users);
      expect(repository.find).toHaveBeenCalledWith({
        order: { lastName: 'ASC', firstName: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('должен вернуть пользователя по id', async () => {
      repository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne('user-1');

      expect(result).toEqual(mockUser);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('должен вернуть null если пользователь не найден', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('должен вернуть пользователя по email', async () => {
      repository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });
  });

  describe('create', () => {
    it('должен создать нового пользователя', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockUser);
      repository.save.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');

      const result = await service.create({
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      });

      expect(result).toEqual(mockUser);
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
    });

    it('должен выбросить ConflictException при дублировании email', async () => {
      repository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.create({ email: 'test@example.com', password: 'password' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('должен обновить пользователя', async () => {
      const updatedUser = { ...mockUser, firstName: 'Updated' };
      repository.findOne
        .mockResolvedValueOnce(mockUser) // первый вызов - проверка существования
        .mockResolvedValueOnce(null); // второй вызов - проверка email
      repository.save.mockResolvedValue(updatedUser);

      const result = await service.update('user-1', { firstName: 'Updated' });

      expect(result).toEqual(updatedUser);
    });

    it('должен выбросить NotFoundException если пользователь не найден', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.update('non-existent', { firstName: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('должен хешировать пароль при обновлении', async () => {
      repository.findOne.mockResolvedValue(mockUser);
      repository.save.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');

      await service.update('user-1', { password: 'newPassword' });

      expect(bcrypt.hash).toHaveBeenCalledWith('newPassword', 10);
    });
  });

  describe('remove', () => {
    it('должен удалить пользователя', async () => {
      repository.findOne.mockResolvedValue(mockUser);
      repository.remove.mockResolvedValue(mockUser);

      await service.remove('user-1');

      expect(repository.remove).toHaveBeenCalledWith(mockUser);
    });

    it('должен выбросить NotFoundException если пользователь не найден', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
