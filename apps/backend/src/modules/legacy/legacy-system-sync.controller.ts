import { Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SystemSyncService, SystemType } from './services/system-sync.service';

@Controller('legacy/system-sync')
@UseGuards(JwtAuthGuard)
export class LegacySystemSyncController {
  constructor(private readonly systemSyncService: SystemSyncService) {}

  /**
   * Статус синхронизации всех системных справочников
   */
  @Get('status')
  getStatus() {
    return this.systemSyncService.getSyncStatus();
  }

  /**
   * Предварительная оценка объёма данных для конкретного типа
   */
  @Get(':type/preview')
  async getPreview(@Param('type') type: SystemType) {
    this.validateType(type);
    return this.systemSyncService.getPreview(type);
  }

  /**
   * Прогресс текущей синхронизации
   */
  @Get(':type/progress')
  getProgress(@Param('type') type: SystemType) {
    this.validateType(type);
    return this.systemSyncService.getProgress(type);
  }

  /**
   * Запустить синхронизацию (async — возвращается сразу)
   */
  @Post(':type/start')
  @HttpCode(HttpStatus.ACCEPTED)
  async startSync(@Param('type') type: SystemType) {
    this.validateType(type);

    // Запускаем в фоне (не ждём завершения)
    const syncPromise = this.runSync(type);
    syncPromise.catch((e) => {
      // Ошибка уже логируется в сервисе
    });

    return {
      message: `Синхронизация ${type} запущена`,
      statusUrl: `/api/legacy/system-sync/${type}/progress`,
    };
  }

  /**
   * Включить cron-синхронизацию
   */
  @Post('cron/enable')
  @HttpCode(HttpStatus.OK)
  enableCron() {
    this.systemSyncService.enableCron();
    return { message: 'Cron-синхронизация включена' };
  }

  /**
   * Выключить cron-синхронизацию
   */
  @Post('cron/disable')
  @HttpCode(HttpStatus.OK)
  disableCron() {
    this.systemSyncService.disableCron();
    return { message: 'Cron-синхронизация выключена' };
  }

  private async runSync(type: SystemType) {
    switch (type) {
      case 'counterparties':
        return this.systemSyncService.syncCounterparties();
      case 'contacts':
        return this.systemSyncService.syncContacts();
      case 'products':
        return this.systemSyncService.syncProducts();
      case 'deals':
        return this.systemSyncService.syncDeals();
    }
  }

  private validateType(type: string): asserts type is SystemType {
    const validTypes: SystemType[] = ['counterparties', 'contacts', 'products', 'deals'];
    if (!validTypes.includes(type as SystemType)) {
      throw new Error(`Неизвестный тип: ${type}. Допустимые: ${validTypes.join(', ')}`);
    }
  }
}
