import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Загружаем .env из корня проекта
dotenv.config({ path: join(__dirname, '../../../../.env') });

// Паттерны для entities основной БД (PostgreSQL)
// ВАЖНО: legacy entities исключены - они используют отдельный MySQL DataSource
const entityPatterns = [
  join(__dirname, '/../modules/ai/**/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/analytics/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/audit-log/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/auth/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/automation/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/bpmn/**/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/connectors/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/dmn/**/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/email/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/entity/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/health/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/s3/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/search/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/section/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/sla/**/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/user/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/websocket/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/onboarding/**/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/rbac/*.entity{.ts,.js}'),
  join(__dirname, '/../modules/workspace/*.entity{.ts,.js}'),
  // Только migration-log (PostgreSQL), остальные legacy entities на MySQL DataSource
  join(__dirname, '/../modules/legacy/entities/legacy-migration-log.entity{.ts,.js}'),
];

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'stankoff_admin',
  password: process.env.DATABASE_PASSWORD || 'stankoff_secret_2026',
  database: process.env.DATABASE_NAME || 'stankoff_portal',
  entities: entityPatterns,
  migrations: [join(__dirname, '/../migrations/*{.ts,.js}')],
  synchronize: false,
  logging: true,
});
