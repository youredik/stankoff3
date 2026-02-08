import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { IsOptional, IsBoolean, IsNumber, IsArray, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../auth/decorators/public.decorator';
import { LegacyService } from './services/legacy.service';
import { KeycloakAdminService, ImportSummary } from '../auth/keycloak-admin.service';

/**
 * DTO для запроса импорта
 */
class ImportRequestDto {
  /**
   * Пропускать существующих пользователей (по умолчанию true)
   */
  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean = true;

  /**
   * Режим "сухого запуска" — не создаёт пользователей, только показывает что будет сделано
   */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;

  /**
   * Длина генерируемого пароля (по умолчанию 16)
   */
  @IsOptional()
  @IsNumber()
  @Min(12)
  @Max(32)
  @Type(() => Number)
  passwordLength?: number = 16;

  /**
   * Импортировать только конкретные ID сотрудников (из manager.id)
   */
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  employeeIds?: number[];

  /**
   * Импортировать только сотрудников из конкретных отделов
   */
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  departmentIds?: number[];
}

/**
 * Контроллер для импорта данных из Legacy CRM в новую систему
 *
 * ВАЖНО: Эти эндпоинты должны быть защищены в production!
 * Сейчас используется @Public() для удобства разработки.
 */
@Public()
@Controller('legacy/import')
export class LegacyImportController {
  private readonly logger = new Logger(LegacyImportController.name);

  constructor(
    private readonly legacyService: LegacyService,
    private readonly keycloakAdminService: KeycloakAdminService,
  ) {}

  /**
   * Проверка готовности к импорту
   *
   * GET /api/legacy/import/status
   */
  @Get('status')
  async getImportStatus(): Promise<{
    legacyDbAvailable: boolean;
    keycloakAdminConfigured: boolean;
    activeEmployeesCount: number;
    employeesWithEmail: number;
    employeesWithoutEmail: number;
  }> {
    const legacyDbAvailable = this.legacyService.isAvailable();
    const keycloakAdminConfigured = this.keycloakAdminService.isConfigured();

    let activeEmployeesCount = 0;
    let employeesWithEmail = 0;
    let employeesWithoutEmail = 0;

    if (legacyDbAvailable) {
      const employees = await this.legacyService.getAllActiveEmployees();
      activeEmployeesCount = employees.length;
      employeesWithEmail = employees.filter((e) => e.email).length;
      employeesWithoutEmail = employees.filter((e) => !e.email).length;
    }

    return {
      legacyDbAvailable,
      keycloakAdminConfigured,
      activeEmployeesCount,
      employeesWithEmail,
      employeesWithoutEmail,
    };
  }

  /**
   * Предпросмотр импорта — показывает что будет импортировано
   *
   * GET /api/legacy/import/preview
   */
  @Get('preview')
  async previewImport(
    @Query('departmentId') departmentId?: string,
  ): Promise<{
    employees: Array<{
      id: number;
      email: string | null;
      displayName: string;
      department: string | null;
      alias: string;
      willBeImported: boolean;
      skipReason?: string;
    }>;
    summary: {
      total: number;
      willBeImported: number;
      willBeSkipped: number;
    };
  }> {
    if (!this.legacyService.isAvailable()) {
      throw new HttpException('Legacy БД недоступна', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const allEmployees = await this.legacyService.getAllActiveEmployees();

    // Фильтруем по отделу если указан
    let employees = allEmployees;
    if (departmentId) {
      const deptId = parseInt(departmentId, 10);
      employees = employees.filter((e) => e.departmentId === deptId);
    }

    const preview = employees.map((e) => {
      const willBeImported = !!e.email;
      return {
        id: e.id,
        email: e.email,
        displayName: e.displayName,
        department: e.departmentName,
        alias: e.alias,
        willBeImported,
        skipReason: !e.email ? 'Нет email' : undefined,
      };
    });

    return {
      employees: preview,
      summary: {
        total: preview.length,
        willBeImported: preview.filter((p) => p.willBeImported).length,
        willBeSkipped: preview.filter((p) => !p.willBeImported).length,
      },
    };
  }

  /**
   * Импорт сотрудников в Keycloak
   *
   * POST /api/legacy/import/employees
   *
   * @example
   * // Сухой запуск — просмотр что будет сделано
   * curl -X POST http://localhost:3001/api/legacy/import/employees \
   *   -H "Content-Type: application/json" \
   *   -d '{"dryRun": true}'
   *
   * // Реальный импорт
   * curl -X POST http://localhost:3001/api/legacy/import/employees \
   *   -H "Content-Type: application/json" \
   *   -d '{"skipExisting": true}'
   */
  @Post('employees')
  async importEmployees(@Body() dto: ImportRequestDto): Promise<ImportSummary> {
    if (!this.legacyService.isAvailable()) {
      throw new HttpException('Legacy БД недоступна', HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (!this.keycloakAdminService.isConfigured()) {
      throw new HttpException(
        'Keycloak Admin API не настроен. Проверьте переменные KEYCLOAK_ADMIN_*',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.logger.log('Запуск импорта сотрудников из Legacy в Keycloak');
    this.logger.log(`Параметры: ${JSON.stringify(dto)}`);

    // Получаем всех активных сотрудников
    let employees = await this.legacyService.getAllActiveEmployees();

    // Фильтруем по ID если указаны
    if (dto.employeeIds && dto.employeeIds.length > 0) {
      employees = employees.filter((e) => dto.employeeIds!.includes(e.id));
    }

    // Фильтруем по отделам если указаны
    if (dto.departmentIds && dto.departmentIds.length > 0) {
      employees = employees.filter(
        (e) => e.departmentId && dto.departmentIds!.includes(e.departmentId),
      );
    }

    // Выполняем импорт
    const result = await this.keycloakAdminService.importLegacyEmployees(employees, {
      skipExisting: dto.skipExisting ?? true,
      dryRun: dto.dryRun ?? false,
      passwordLength: dto.passwordLength ?? 16,
    });

    return result;
  }

  /**
   * Экспорт паролей для рассылки сотрудникам
   *
   * POST /api/legacy/import/employees/export-credentials
   *
   * Запускает импорт и возвращает CSV с учётными данными
   */
  @Post('employees/export-credentials')
  async importAndExportCredentials(
    @Body() dto: ImportRequestDto,
  ): Promise<{
    csv: string;
    summary: ImportSummary;
  }> {
    const result = await this.importEmployees({
      ...dto,
      dryRun: dto.dryRun ?? false,
    });

    // Формируем CSV
    const csvLines = [
      'Email,Имя,Фамилия,Отдел,Временный пароль,Статус',
      ...result.results.map((r) => {
        const status = r.success
          ? 'Создан'
          : r.skipped
            ? `Пропущен: ${r.skipReason}`
            : `Ошибка: ${r.error}`;
        return `"${r.email}","","","","${r.temporaryPassword || ''}","${status}"`;
      }),
    ];

    return {
      csv: csvLines.join('\n'),
      summary: result,
    };
  }

  /**
   * Тестовый импорт одного сотрудника
   *
   * POST /api/legacy/import/employees/test
   */
  @Post('employees/test')
  async testImportSingleEmployee(
    @Body() dto: { employeeId: number; dryRun?: boolean },
  ): Promise<ImportSummary> {
    if (!dto.employeeId) {
      throw new HttpException('Укажите employeeId', HttpStatus.BAD_REQUEST);
    }

    return this.importEmployees({
      employeeIds: [dto.employeeId],
      dryRun: dto.dryRun ?? true,
      skipExisting: true,
    });
  }

  /**
   * Список пользователей в Keycloak (для отладки)
   *
   * GET /api/legacy/import/keycloak-users
   */
  @Get('keycloak-users')
  async getKeycloakUsers(@Query('max') max?: string): Promise<unknown[]> {
    if (!this.keycloakAdminService.isConfigured()) {
      throw new HttpException(
        'Keycloak Admin API не настроен',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return this.keycloakAdminService.getUsers({
      max: max ? parseInt(max, 10) : 10,
    });
  }

  /**
   * Сброс паролей для всех импортированных пользователей
   * Генерирует новые пароли и возвращает CSV
   *
   * POST /api/legacy/import/employees/reset-passwords
   */
  @Post('employees/reset-passwords')
  async resetPasswordsAndExport(
    @Body() dto: { dryRun?: boolean; passwordLength?: number },
  ): Promise<{
    csv: string;
    summary: ImportSummary;
  }> {
    if (!this.keycloakAdminService.isConfigured()) {
      throw new HttpException(
        'Keycloak Admin API не настроен',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.logger.log(`Сброс паролей (dryRun: ${dto.dryRun ?? false})`);

    const result = await this.keycloakAdminService.resetPasswordsForLegacyUsers({
      dryRun: dto.dryRun ?? false,
      passwordLength: dto.passwordLength ?? 16,
    });

    // Формируем CSV
    const csvLines = [
      'Email,Временный пароль,Keycloak ID,Статус',
      ...result.results.map((r) => {
        const status = r.success ? 'Обновлён' : `Ошибка: ${r.error}`;
        return `"${r.email}","${r.temporaryPassword || ''}","${r.keycloakId || ''}","${status}"`;
      }),
    ];

    return {
      csv: csvLines.join('\n'),
      summary: result,
    };
  }
}
