import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { LegacyImportController } from './legacy-import.controller';
import { LegacyService } from './services/legacy.service';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';

describe('LegacyImportController', () => {
  let controller: LegacyImportController;
  let legacyService: jest.Mocked<LegacyService>;
  let keycloakAdminService: jest.Mocked<KeycloakAdminService>;

  const mockEmployees = [
    {
      id: 1,
      userId: 100,
      alias: 'john',
      firstName: 'John',
      lastName: 'Doe',
      displayName: 'John Doe',
      email: 'john@example.com',
      phone: '123456789',
      departmentId: 1,
      departmentName: 'IT',
      isActive: true,
      isOnVacation: false,
      canAcceptRequests: true,
      canSale: false,
      telegramId: '12345',
    },
    {
      id: 2,
      userId: 101,
      alias: 'jane',
      firstName: 'Jane',
      lastName: 'Smith',
      displayName: 'Jane Smith',
      email: null,
      phone: null,
      departmentId: 2,
      departmentName: 'Sales',
      isActive: true,
      isOnVacation: false,
      canAcceptRequests: false,
      canSale: true,
      telegramId: null,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LegacyImportController],
      providers: [
        {
          provide: LegacyService,
          useValue: {
            isAvailable: jest.fn(),
            getAllActiveEmployees: jest.fn(),
          },
        },
        {
          provide: KeycloakAdminService,
          useValue: {
            isConfigured: jest.fn(),
            importLegacyEmployees: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LegacyImportController>(LegacyImportController);
    legacyService = module.get(LegacyService);
    keycloakAdminService = module.get(KeycloakAdminService);
  });

  describe('getImportStatus', () => {
    it('должен возвращать статус систем', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      keycloakAdminService.isConfigured.mockReturnValue(true);
      legacyService.getAllActiveEmployees.mockResolvedValue(mockEmployees);

      const result = await controller.getImportStatus();

      expect(result.legacyDbAvailable).toBe(true);
      expect(result.keycloakAdminConfigured).toBe(true);
      expect(result.activeEmployeesCount).toBe(2);
      expect(result.employeesWithEmail).toBe(1);
      expect(result.employeesWithoutEmail).toBe(1);
    });

    it('должен возвращать нули если legacy БД недоступна', async () => {
      legacyService.isAvailable.mockReturnValue(false);
      keycloakAdminService.isConfigured.mockReturnValue(true);

      const result = await controller.getImportStatus();

      expect(result.legacyDbAvailable).toBe(false);
      expect(result.activeEmployeesCount).toBe(0);
    });
  });

  describe('previewImport', () => {
    it('должен выбрасывать ошибку если legacy БД недоступна', async () => {
      legacyService.isAvailable.mockReturnValue(false);

      await expect(controller.previewImport()).rejects.toThrow(HttpException);
    });

    it('должен возвращать превью импорта', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      legacyService.getAllActiveEmployees.mockResolvedValue(mockEmployees);

      const result = await controller.previewImport();

      expect(result.employees.length).toBe(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.willBeImported).toBe(1);
      expect(result.summary.willBeSkipped).toBe(1);
    });

    it('должен фильтровать по отделу', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      legacyService.getAllActiveEmployees.mockResolvedValue(mockEmployees);

      const result = await controller.previewImport('1');

      expect(result.employees.length).toBe(1);
      expect(result.employees[0].department).toBe('IT');
    });

    it('должен помечать сотрудников без email как пропущенных', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      legacyService.getAllActiveEmployees.mockResolvedValue(mockEmployees);

      const result = await controller.previewImport();

      const jane = result.employees.find((e) => e.alias === 'jane');
      expect(jane?.willBeImported).toBe(false);
      expect(jane?.skipReason).toBe('Нет email');
    });
  });

  describe('importEmployees', () => {
    it('должен выбрасывать ошибку если legacy БД недоступна', async () => {
      legacyService.isAvailable.mockReturnValue(false);

      await expect(controller.importEmployees({})).rejects.toThrow(HttpException);
    });

    it('должен выбрасывать ошибку если Keycloak Admin не настроен', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      keycloakAdminService.isConfigured.mockReturnValue(false);

      await expect(controller.importEmployees({})).rejects.toThrow(HttpException);
    });

    it('должен вызывать importLegacyEmployees с правильными параметрами', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      keycloakAdminService.isConfigured.mockReturnValue(true);
      legacyService.getAllActiveEmployees.mockResolvedValue(mockEmployees);
      keycloakAdminService.importLegacyEmployees.mockResolvedValue({
        total: 2,
        created: 1,
        skipped: 1,
        failed: 0,
        results: [],
      });

      await controller.importEmployees({ dryRun: true, skipExisting: true });

      expect(keycloakAdminService.importLegacyEmployees).toHaveBeenCalledWith(
        mockEmployees,
        expect.objectContaining({
          dryRun: true,
          skipExisting: true,
        }),
      );
    });

    it('должен фильтровать по employeeIds', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      keycloakAdminService.isConfigured.mockReturnValue(true);
      legacyService.getAllActiveEmployees.mockResolvedValue(mockEmployees);
      keycloakAdminService.importLegacyEmployees.mockResolvedValue({
        total: 1,
        created: 1,
        skipped: 0,
        failed: 0,
        results: [],
      });

      await controller.importEmployees({ employeeIds: [1] });

      expect(keycloakAdminService.importLegacyEmployees).toHaveBeenCalledWith(
        [mockEmployees[0]],
        expect.anything(),
      );
    });

    it('должен фильтровать по departmentIds', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      keycloakAdminService.isConfigured.mockReturnValue(true);
      legacyService.getAllActiveEmployees.mockResolvedValue(mockEmployees);
      keycloakAdminService.importLegacyEmployees.mockResolvedValue({
        total: 1,
        created: 1,
        skipped: 0,
        failed: 0,
        results: [],
      });

      await controller.importEmployees({ departmentIds: [2] });

      expect(keycloakAdminService.importLegacyEmployees).toHaveBeenCalledWith(
        [mockEmployees[1]],
        expect.anything(),
      );
    });
  });

  describe('testImportSingleEmployee', () => {
    it('должен выбрасывать ошибку без employeeId', async () => {
      await expect(controller.testImportSingleEmployee({} as never)).rejects.toThrow(HttpException);
    });

    it('должен выполнять импорт одного сотрудника в dryRun режиме', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      keycloakAdminService.isConfigured.mockReturnValue(true);
      legacyService.getAllActiveEmployees.mockResolvedValue(mockEmployees);
      keycloakAdminService.importLegacyEmployees.mockResolvedValue({
        total: 1,
        created: 1,
        skipped: 0,
        failed: 0,
        results: [],
      });

      await controller.testImportSingleEmployee({ employeeId: 1 });

      expect(keycloakAdminService.importLegacyEmployees).toHaveBeenCalledWith(
        [mockEmployees[0]],
        expect.objectContaining({ dryRun: true }),
      );
    });
  });
});
