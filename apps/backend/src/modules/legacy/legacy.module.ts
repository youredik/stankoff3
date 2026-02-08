import { Module, Logger, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { LegacyController } from './legacy.controller';
import { LegacyImportController } from './legacy-import.controller';
import { LegacyService } from './services/legacy.service';
import { LegacyUrlService } from './services/legacy-url.service';
import { LEGACY_DATA_SOURCE, legacyDatabaseConfig } from './legacy-database.config';
import { AuthModule } from '../auth/auth.module';

/**
 * Модуль интеграции с Legacy CRM (MariaDB/MySQL)
 *
 * Предоставляет READ-ONLY доступ к данным старой системы:
 * - Клиенты (SS_customers)
 * - Товары (SS_products) и категории (SS_categories)
 * - Контрагенты (counterparty)
 * - Сделки (deal)
 * - Обращения (QD_requests)
 *
 * Модуль gracefully деградирует если legacy БД недоступна.
 */
@Module({
  imports: [ConfigModule, forwardRef(() => AuthModule)],
  controllers: [LegacyController, LegacyImportController],
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
  ],
  exports: [LegacyService, LegacyUrlService, LEGACY_DATA_SOURCE],
})
export class LegacyModule {}
