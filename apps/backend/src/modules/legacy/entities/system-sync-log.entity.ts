import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * Лог синхронизации системных справочников (контрагенты, контакты, товары).
 * Хранится в PostgreSQL (основная БД).
 * Используется для идемпотентности и отслеживания прогресса синхронизации.
 */
@Entity('system_sync_log')
@Unique('UQ_system_sync_type_legacy', ['systemType', 'legacyId'])
export class SystemSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30 })
  @Index('idx_system_sync_type')
  systemType: string; // 'counterparties' | 'contacts' | 'products'

  @Column({ type: 'int' })
  legacyId: number;

  @Column({ type: 'uuid' })
  @Index('idx_system_sync_entity')
  entityId: string;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  syncedAt: Date;
}
