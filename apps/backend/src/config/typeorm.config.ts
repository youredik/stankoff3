import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import * as dotenv from 'dotenv';

// Загружаем .env до чтения process.env (ConfigModule загружается позже)
dotenv.config({ path: join(__dirname, '../../../../.env') });

// Паттерны для entities основной БД (PostgreSQL)
// ВАЖНО: legacy entities исключены - они используют отдельный MySQL DataSource
const entityPatterns = [
  __dirname + '/../modules/ai/**/*.entity{.ts,.js}',
  __dirname + '/../modules/analytics/*.entity{.ts,.js}',
  __dirname + '/../modules/audit-log/*.entity{.ts,.js}',
  __dirname + '/../modules/auth/*.entity{.ts,.js}',
  __dirname + '/../modules/automation/*.entity{.ts,.js}',
  __dirname + '/../modules/bpmn/**/*.entity{.ts,.js}',
  __dirname + '/../modules/chat/**/*.entity{.ts,.js}',
  __dirname + '/../modules/connectors/*.entity{.ts,.js}',
  __dirname + '/../modules/dmn/**/*.entity{.ts,.js}',
  __dirname + '/../modules/email/*.entity{.ts,.js}',
  __dirname + '/../modules/entity/*.entity{.ts,.js}',
  __dirname + '/../modules/health/*.entity{.ts,.js}',
  __dirname + '/../modules/s3/*.entity{.ts,.js}',
  __dirname + '/../modules/search/*.entity{.ts,.js}',
  __dirname + '/../modules/section/*.entity{.ts,.js}',
  __dirname + '/../modules/sla/**/*.entity{.ts,.js}',
  __dirname + '/../modules/user/*.entity{.ts,.js}',
  __dirname + '/../modules/websocket/*.entity{.ts,.js}',
  __dirname + '/../modules/onboarding/**/*.entity{.ts,.js}',
  __dirname + '/../modules/rbac/*.entity{.ts,.js}',
  __dirname + '/../modules/invitation/*.entity{.ts,.js}',
  __dirname + '/../modules/knowledge-base/**/*.entity{.ts,.js}',
  __dirname + '/../modules/workspace/*.entity{.ts,.js}',
  // Только PostgreSQL entities из legacy модуля, остальные legacy entities на MySQL DataSource
  __dirname + '/../modules/legacy/entities/legacy-migration-log.entity{.ts,.js}',
  __dirname + '/../modules/legacy/entities/system-sync-log.entity{.ts,.js}',
];

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'stankoff_admin',
  password: process.env.DATABASE_PASSWORD || 'stankoff_secret_2026',
  database: process.env.DATABASE_NAME || 'stankoff_portal',
  entities: entityPatterns,
  // ВАЖНО: synchronize всегда false — все изменения через миграции
  synchronize: false,
  // Миграции применяются автоматически при старте приложения
  migrationsRun: true,
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  logging: process.env.NODE_ENV === 'development',
};
