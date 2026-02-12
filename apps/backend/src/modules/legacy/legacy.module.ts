import { Module, Logger, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LegacyController } from './legacy.controller';
import { LegacyImportController } from './legacy-import.controller';
import { LegacyMigrationController } from './legacy-migration.controller';
import { LegacySyncController } from './legacy-sync.controller';
import { LegacySystemSyncController } from './legacy-system-sync.controller';
import { LegacyService } from './services/legacy.service';
import { LegacyUrlService } from './services/legacy-url.service';
import { LegacyMigrationService } from './services/legacy-migration.service';
import { LegacySyncService } from './services/legacy-sync.service';
import { SystemSyncService } from './services/system-sync.service';
import { LEGACY_DATA_SOURCE, legacyDatabaseConfig } from './legacy-database.config';
import { LegacyMigrationLog } from './entities/legacy-migration-log.entity';
import { SystemSyncLog } from './entities/system-sync-log.entity';
import { User } from '../user/user.entity';
import { Workspace } from '../workspace/workspace.entity';
import { AuthModule } from '../auth/auth.module';

/**
 * Модуль интеграции с Legacy CRM (MariaDB/MySQL)
 *
 * Предоставляет:
 * - READ-ONLY доступ к данным старой системы
 * - Миграция данных из legacy в PostgreSQL
 * - Синхронизация новых данных (cron)
 *
 * Модуль gracefully деградирует если legacy БД недоступна.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([LegacyMigrationLog, SystemSyncLog, User, Workspace]),
    forwardRef(() => AuthModule),
  ],
  controllers: [LegacyController, LegacyImportController, LegacyMigrationController, LegacySyncController, LegacySystemSyncController],
  providers: [
    {
      provide: LEGACY_DATA_SOURCE,
      useFactory: async (configService: ConfigService): Promise<DataSource> => {
        const logger = new Logger('LegacyModule');

        // Проверяем, настроено ли подключение к legacy БД
        const host = configService.get<string>('LEGACY_DB_HOST');
        if (!host) {
          logger.warn('Legacy database not configured (LEGACY_DB_HOST not set). Module will be disabled.');
          // Возвращаем неинициализированный DataSource с фиктивными данными
          // Он не будет инициализирован, поэтому isAvailable() вернёт false
          return new DataSource({
            type: 'mysql',
            host: 'not-configured',
            port: 3306,
            username: 'disabled',
            password: '',
            database: 'disabled',
            entities: legacyDatabaseConfig.entities,
            synchronize: false,
          });
        }

        const dataSource = new DataSource({
          type: 'mysql',
          host: configService.get<string>('LEGACY_DB_HOST'),
          port: configService.get<number>('LEGACY_DB_PORT', 3306),
          username: configService.get<string>('LEGACY_DB_USER', 'stankoff_portal_readonly'),
          password: configService.get<string>('LEGACY_DB_PASSWORD', ''),
          database: configService.get<string>('LEGACY_DB_NAME', 'stankoff'),
          entities: legacyDatabaseConfig.entities,
          synchronize: false,
          logging: configService.get<string>('NODE_ENV') === 'development',
          extra: {
            connectionLimit: 5,
          },
        });

        try {
          await dataSource.initialize();
          logger.log(`Connected to legacy database: ${host}`);
        } catch (error) {
          logger.warn(`Failed to connect to legacy database: ${error.message}`);
          // Не выбрасываем ошибку — модуль продолжит работать в degraded режиме
        }

        return dataSource;
      },
      inject: [ConfigService],
    },
    LegacyService,
    LegacyUrlService,
    LegacyMigrationService,
    LegacySyncService,
    SystemSyncService,
  ],
  exports: [LegacyService, LegacyUrlService, SystemSyncService, LEGACY_DATA_SOURCE],
})
export class LegacyModule {}
