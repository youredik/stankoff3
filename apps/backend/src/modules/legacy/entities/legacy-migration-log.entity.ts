import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Лог миграции из Legacy CRM.
 * Хранится в PostgreSQL (основная БД), НЕ в legacy MariaDB.
 * Используется для отслеживания прогресса и идемпотентности миграции.
 */
@Entity('legacy_migration_log')
export class LegacyMigrationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', unique: true })
  @Index('idx_legacy_migration_request')
  legacyRequestId: number;

  @Column({ type: 'uuid' })
  entityId: string;

  @Column({ type: 'int', default: 0 })
  commentsCount: number;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  @Index('idx_legacy_migration_status')
  status: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  migratedAt: Date;
}
