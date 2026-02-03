import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Загружаем .env из корня проекта
dotenv.config({ path: join(__dirname, '../../../../.env') });

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'stankoff_admin',
  password: process.env.DATABASE_PASSWORD || 'stankoff_secret_2026',
  database: process.env.DATABASE_NAME || 'stankoff_portal',
  entities: [join(__dirname, '/../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, '/../migrations/*{.ts,.js}')],
  synchronize: false,
  logging: true,
});
