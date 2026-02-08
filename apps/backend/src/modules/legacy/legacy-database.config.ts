import { DataSource, DataSourceOptions } from 'typeorm';
import { LegacyCustomer } from './entities/legacy-customer.entity';
import { LegacyProduct } from './entities/legacy-product.entity';
import { LegacyCategory } from './entities/legacy-category.entity';
import { LegacyCounterparty } from './entities/legacy-counterparty.entity';
import { LegacyDeal } from './entities/legacy-deal.entity';
import { LegacyDealStage } from './entities/legacy-deal-stage.entity';
import { LegacyRequest } from './entities/legacy-request.entity';
import { LegacyAnswer } from './entities/legacy-answer.entity';
import { LegacyManager } from './entities/legacy-manager.entity';
import { LegacyDepartment } from './entities/legacy-department.entity';

/**
 * Конфигурация подключения к Legacy БД (MariaDB/MySQL)
 * ВАЖНО: Только READ-ONLY доступ!
 */
export const legacyDatabaseConfig: DataSourceOptions = {
  type: 'mysql',
  host: process.env.LEGACY_DB_HOST || 'localhost',
  port: parseInt(process.env.LEGACY_DB_PORT || '3306', 10),
  username: process.env.LEGACY_DB_USER || 'stankoff_portal_readonly',
  password: process.env.LEGACY_DB_PASSWORD || '',
  database: process.env.LEGACY_DB_NAME || 'stankoff',
  entities: [
    LegacyCustomer,
    LegacyProduct,
    LegacyCategory,
    LegacyCounterparty,
    LegacyDeal,
    LegacyDealStage,
    LegacyRequest,
    LegacyAnswer,
    LegacyManager,
    LegacyDepartment,
  ],
  // КРИТИЧЕСКИ ВАЖНО: никогда не синхронизировать схему legacy БД!
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  // Ограничиваем количество соединений
  extra: {
    connectionLimit: 5,
  },
};

/**
 * DataSource для legacy БД
 * Используется для инъекции в модуль
 */
export const LegacyDataSource = new DataSource(legacyDatabaseConfig);

/**
 * Токен для инъекции Legacy DataSource
 */
export const LEGACY_DATA_SOURCE = 'LEGACY_DATA_SOURCE';
