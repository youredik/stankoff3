import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../modules/user/user.entity';
import { SeedUsersService } from './seed-users.service';
import { EMPLOYEES } from './data/employees';
import { DEPARTMENTS } from './data/departments';

// Мокаем bcrypt на уровне модуля
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
}));

describe('SeedUsersService', () => {
  let service: SeedUsersService;
  let userRepo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedUsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            create: jest.fn((data) => ({ ...data, id: `uuid-${data.email}` })),
            save: jest.fn((users) => Promise.resolve(users)),
          },
        },
      ],
    }).compile();

    service = module.get(SeedUsersService);
    userRepo = module.get(getRepositoryToken(User));
  });

  describe('данные сотрудников', () => {
    it('должен содержать 87 сотрудников в массиве EMPLOYEES', () => {
      expect(EMPLOYEES).toHaveLength(87);
    });
  });

  describe('createAll', () => {
    it('должен создать 87 пользователей из данных EMPLOYEES', async () => {
      const result = await service.createAll();

      expect(userRepo.create).toHaveBeenCalledTimes(87);
      expect(userRepo.save).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(87);
    });

    it('должен хэшировать пароль через bcrypt', async () => {
      const bcrypt = require('bcrypt');

      await service.createAll();

      expect(bcrypt.hash).toHaveBeenCalledWith('password', 10);
      // Все пользователи должны получить захэшированный пароль
      const createCalls = userRepo.create.mock.calls;
      for (const [userData] of createCalls) {
        expect(userData.password).toBe('$2b$10$hashedpassword');
      }
    });

    it('должен установить роль ADMIN для youredik, korshunov и ruslan', async () => {
      await service.createAll();

      const createCalls = userRepo.create.mock.calls;
      const adminEmails = createCalls
        .filter(([data]) => data.role === UserRole.ADMIN)
        .map(([data]) => data.email);

      expect(adminEmails).toContain('youredik@gmail.com');
      expect(adminEmails).toContain('s.korshunov88@ya.ru');
      expect(adminEmails).toContain('ruslan.stankoff@gmail.com');
      expect(adminEmails).toHaveLength(3);
    });

    it('должен установить корректные русские названия отделов', async () => {
      await service.createAll();

      const createCalls = userRepo.create.mock.calls;

      // Проверяем конкретных сотрудников из разных отделов
      const youredik = createCalls.find(([data]) => data.email === 'youredik@gmail.com');
      expect(youredik).toBeDefined();
      expect(youredik![0].department).toBe('IT отдел');

      const chulpan = createCalls.find(([data]) => data.email === 'chulpan@stankoff.ru');
      expect(chulpan).toBeDefined();
      expect(chulpan![0].department).toBe('Бухгалтерия');

      const grachev = createCalls.find(([data]) => data.email === 'grachev@stankoff.ru');
      expect(grachev).toBeDefined();
      expect(grachev![0].department).toBe('Отдел продаж');

      const andrey = createCalls.find(([data]) => data.email === 'andrey@stankoff.ru');
      expect(andrey).toBeDefined();
      expect(andrey![0].department).toBe('Сервисный отдел');
    });

    it('должен установить isActive: true для всех пользователей', async () => {
      await service.createAll();

      const createCalls = userRepo.create.mock.calls;
      for (const [userData] of createCalls) {
        expect(userData.isActive).toBe(true);
      }
    });

    it('должен передать firstName и lastName из EMPLOYEES', async () => {
      await service.createAll();

      const createCalls = userRepo.create.mock.calls;
      const youredik = createCalls.find(([data]) => data.email === 'youredik@gmail.com');
      expect(youredik![0].firstName).toBe('Эдуард');
      expect(youredik![0].lastName).toBe('Сарваров');
    });

    it('должен соответствовать каждому отделу из DEPARTMENTS', async () => {
      await service.createAll();

      const createCalls = userRepo.create.mock.calls;
      const departmentNames = [...new Set(createCalls.map(([data]) => data.department))];

      // Каждое название отдела должно быть из DEPARTMENTS
      for (const deptName of departmentNames) {
        const found = DEPARTMENTS.find((d) => d.name === deptName);
        expect(found).toBeDefined();
      }
    });
  });

  describe('findByEmail', () => {
    it('должен вернуть пользователя по email', () => {
      const users = [
        { id: '1', email: 'youredik@gmail.com', firstName: 'Эдуард' },
        { id: '2', email: 'grachev@stankoff.ru', firstName: 'Максим' },
      ] as User[];

      const result = service.findByEmail(users, 'youredik@gmail.com');

      expect(result).toBeDefined();
      expect(result!.email).toBe('youredik@gmail.com');
      expect(result!.firstName).toBe('Эдуард');
    });

    it('должен вернуть undefined для несуществующего email', () => {
      const users = [
        { id: '1', email: 'youredik@gmail.com' },
      ] as User[];

      const result = service.findByEmail(users, 'nonexistent@test.com');
      expect(result).toBeUndefined();
    });
  });

  describe('findByDepartment', () => {
    it('должен вернуть пользователей из указанного отдела', () => {
      // Используем реальные email из EMPLOYEES для отдела IT
      const users = [
        { id: '1', email: 'youredik@gmail.com' },
        { id: '2', email: 's.korshunov88@ya.ru' },
        { id: '3', email: 'grachev@stankoff.ru' },
      ] as User[];

      const itUsers = service.findByDepartment(users, 'it');

      expect(itUsers).toHaveLength(2);
      expect(itUsers.map((u) => u.email)).toContain('youredik@gmail.com');
      expect(itUsers.map((u) => u.email)).toContain('s.korshunov88@ya.ru');
    });

    it('должен вернуть пустой массив для несуществующего отдела', () => {
      const users = [
        { id: '1', email: 'youredik@gmail.com' },
      ] as User[];

      const result = service.findByDepartment(users, 'nonexistent');
      expect(result).toHaveLength(0);
    });

    it('должен вернуть сотрудников маркетинга по ключу marketing', () => {
      // Берём реальные email из EMPLOYEES для маркетинга
      const marketingEmails = EMPLOYEES
        .filter((e) => e.departmentKey === 'marketing')
        .map((e) => e.email);

      const users = marketingEmails.map((email, i) => ({
        id: String(i),
        email,
      })) as User[];

      const result = service.findByDepartment(users, 'marketing');
      expect(result).toHaveLength(marketingEmails.length);
    });
  });
});
