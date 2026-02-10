import { Test, TestingModule } from '@nestjs/testing';
import { KeycloakAdminService } from '../modules/auth/keycloak-admin.service';
import { User, UserRole } from '../modules/user/user.entity';
import { SeedKeycloakService } from './seed-keycloak.service';
import { EMPLOYEES } from './data/employees';

describe('SeedKeycloakService', () => {
  let service: SeedKeycloakService;
  let keycloakAdmin: jest.Mocked<KeycloakAdminService>;

  const mockUsers: User[] = [
    {
      id: 'u1',
      email: 'youredik@gmail.com',
      firstName: 'Эдуард',
      lastName: 'Сарваров',
      department: 'IT отдел',
      role: UserRole.ADMIN,
      password: 'hashed',
      avatar: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'u2',
      email: 'grachev@stankoff.ru',
      firstName: 'Максим',
      lastName: 'Грачев',
      department: 'Отдел продаж',
      role: UserRole.MANAGER,
      password: 'hashed',
      avatar: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'u3',
      email: 'andrey@stankoff.ru',
      firstName: 'Андрей',
      lastName: 'Кяшкин',
      department: 'Сервисный отдел',
      role: UserRole.MANAGER,
      password: 'hashed',
      avatar: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedKeycloakService,
        {
          provide: KeycloakAdminService,
          useValue: {
            isConfigured: jest.fn(),
            generateSecurePassword: jest.fn(),
            createUser: jest.fn(),
            getUsers: jest.fn(),
            deleteUser: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(SeedKeycloakService);
    keycloakAdmin = module.get(KeycloakAdminService);
  });

  describe('syncUsers', () => {
    it('должен пропустить, если Keycloak не настроен', async () => {
      keycloakAdmin.isConfigured.mockReturnValue(false);

      await service.syncUsers(mockUsers);

      expect(keycloakAdmin.isConfigured).toHaveBeenCalled();
      expect(keycloakAdmin.getUsers).not.toHaveBeenCalled();
      expect(keycloakAdmin.createUser).not.toHaveBeenCalled();
    });

    it('должен удалить существующих пользователей перед созданием новых', async () => {
      keycloakAdmin.isConfigured.mockReturnValue(true);
      keycloakAdmin.generateSecurePassword.mockReturnValue('SecurePass123!');
      keycloakAdmin.createUser.mockResolvedValue({ userId: 'kc-1' });

      // Первый вызов возвращает 2 пользователя (меньше max=100, значит hasMore=false)
      keycloakAdmin.getUsers.mockResolvedValueOnce([
        { id: 'kc-admin', username: 'admin' },
        { id: 'kc-user1', username: 'test@example.com' },
        { id: 'kc-user2', username: 'other@example.com' },
      ]);

      await service.syncUsers(mockUsers);

      // Должен был запросить пользователей
      expect(keycloakAdmin.getUsers).toHaveBeenCalledWith({ first: 0, max: 100 });

      // Должен был удалить НЕ-admin пользователей
      expect(keycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-user1');
      expect(keycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-user2');
      expect(keycloakAdmin.deleteUser).toHaveBeenCalledTimes(2);
    });

    it('не должен удалять пользователя admin', async () => {
      keycloakAdmin.isConfigured.mockReturnValue(true);
      keycloakAdmin.generateSecurePassword.mockReturnValue('SecurePass123!');
      keycloakAdmin.createUser.mockResolvedValue({ userId: 'kc-1' });

      keycloakAdmin.getUsers.mockResolvedValueOnce([
        { id: 'kc-admin', username: 'admin' },
      ]);

      await service.syncUsers(mockUsers);

      expect(keycloakAdmin.deleteUser).not.toHaveBeenCalledWith('kc-admin');
    });

    it('должен создать всех пользователей с корректными атрибутами', async () => {
      keycloakAdmin.isConfigured.mockReturnValue(true);
      keycloakAdmin.generateSecurePassword.mockReturnValue('GenPass456!');
      keycloakAdmin.createUser.mockResolvedValue({ userId: 'kc-new' });
      keycloakAdmin.getUsers.mockResolvedValueOnce([]);

      await service.syncUsers(mockUsers);

      expect(keycloakAdmin.createUser).toHaveBeenCalledTimes(mockUsers.length);

      // Проверяем первого пользователя (youredik) — у него legacyId = 148
      const firstCall = keycloakAdmin.createUser.mock.calls[0][0];
      expect(firstCall.username).toBe('youredik@gmail.com');
      expect(firstCall.email).toBe('youredik@gmail.com');
      expect(firstCall.firstName).toBe('Эдуард');
      expect(firstCall.lastName).toBe('Сарваров');
      expect(firstCall.enabled).toBe(true);
      expect(firstCall.emailVerified).toBe(true);
      expect(firstCall.requiredActions).toEqual(['UPDATE_PASSWORD']);
      expect(firstCall.credentials).toEqual([
        { type: 'password', value: 'GenPass456!', temporary: true },
      ]);

      // department должен быть в атрибутах
      expect(firstCall.attributes).toBeDefined();
      expect(firstCall.attributes!['department']).toEqual(['IT отдел']);

      // legacyManagerId должен быть в атрибутах (youredik legacyId=148)
      expect(firstCall.attributes!['legacyManagerId']).toEqual(['148']);
    });

    it('должен установить атрибут legacyManagerId для сотрудников с legacyId', async () => {
      keycloakAdmin.isConfigured.mockReturnValue(true);
      keycloakAdmin.generateSecurePassword.mockReturnValue('Pass!');
      keycloakAdmin.createUser.mockResolvedValue({ userId: 'kc-new' });
      keycloakAdmin.getUsers.mockResolvedValueOnce([]);

      // grachev (legacyId=1) — проверяем что legacyId попадает в атрибуты
      const usersWithLegacy = [mockUsers[1]]; // grachev
      await service.syncUsers(usersWithLegacy);

      const callData = keycloakAdmin.createUser.mock.calls[0][0];
      expect(callData.attributes!['legacyManagerId']).toEqual(['1']);
    });

    it('должен обработать ошибку Keycloak gracefully при создании пользователя', async () => {
      keycloakAdmin.isConfigured.mockReturnValue(true);
      keycloakAdmin.generateSecurePassword.mockReturnValue('Pass!');
      keycloakAdmin.getUsers.mockResolvedValueOnce([]);

      // Первый пользователь — ошибка, второй — успех, третий — ошибка
      keycloakAdmin.createUser
        .mockRejectedValueOnce(new Error('Conflict: user exists'))
        .mockResolvedValueOnce({ userId: 'kc-ok' })
        .mockRejectedValueOnce(new Error('Connection refused'));

      // Не должен выбросить исключение
      await expect(service.syncUsers(mockUsers)).resolves.not.toThrow();

      // Все 3 попытки создания должны были произойти
      expect(keycloakAdmin.createUser).toHaveBeenCalledTimes(3);
    });

    it('должен обработать критическую ошибку Keycloak gracefully', async () => {
      keycloakAdmin.isConfigured.mockReturnValue(true);

      // Ошибка при получении списка пользователей (критическая)
      keycloakAdmin.getUsers.mockRejectedValue(new Error('Keycloak unreachable'));

      // Не должен выбросить исключение
      await expect(service.syncUsers(mockUsers)).resolves.not.toThrow();

      // createUser не должен вызываться, т.к. упало на deleteExistingUsers
      expect(keycloakAdmin.createUser).not.toHaveBeenCalled();
    });

    it('должен обработать пагинацию при удалении пользователей', async () => {
      keycloakAdmin.isConfigured.mockReturnValue(true);
      keycloakAdmin.generateSecurePassword.mockReturnValue('Pass!');
      keycloakAdmin.createUser.mockResolvedValue({ userId: 'kc-new' });

      // Первая страница — ровно 100 пользователей (hasMore = true)
      const firstPage = Array.from({ length: 100 }, (_, i) => ({
        id: `kc-${i}`,
        username: `user${i}@test.com`,
      }));
      // Вторая страница — меньше 100 (hasMore = false)
      const secondPage = [
        { id: 'kc-last', username: 'last@test.com' },
      ];

      keycloakAdmin.getUsers
        .mockResolvedValueOnce(firstPage)
        .mockResolvedValueOnce(secondPage);

      await service.syncUsers(mockUsers);

      // Должно быть 2 запроса getUsers (пагинация)
      expect(keycloakAdmin.getUsers).toHaveBeenCalledWith({ first: 0, max: 100 });
      expect(keycloakAdmin.getUsers).toHaveBeenCalledWith({ first: 100, max: 100 });

      // Все 101 пользователь должен быть удалён
      expect(keycloakAdmin.deleteUser).toHaveBeenCalledTimes(101);
    });

    it('должен обработать ошибку удаления конкретного пользователя и продолжить', async () => {
      keycloakAdmin.isConfigured.mockReturnValue(true);
      keycloakAdmin.generateSecurePassword.mockReturnValue('Pass!');
      keycloakAdmin.createUser.mockResolvedValue({ userId: 'kc-new' });

      keycloakAdmin.getUsers.mockResolvedValueOnce([
        { id: 'kc-1', username: 'user1@test.com' },
        { id: 'kc-2', username: 'user2@test.com' },
      ]);

      // Первый удаляется с ошибкой, второй — успешно
      keycloakAdmin.deleteUser
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce(undefined);

      await expect(service.syncUsers(mockUsers)).resolves.not.toThrow();

      // Оба вызова должны произойти — ошибка первого не блокирует второй
      expect(keycloakAdmin.deleteUser).toHaveBeenCalledTimes(2);

      // Создание пользователей должно продолжиться
      expect(keycloakAdmin.createUser).toHaveBeenCalledTimes(mockUsers.length);
    });
  });
});
