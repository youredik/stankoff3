import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Legacy сущность: department
 * Отделы компании
 * READ-ONLY!
 */
@Entity('department')
export class LegacyDepartment {
  @PrimaryColumn({ type: 'tinyint' })
  id: number;

  @Column({ type: 'varchar', length: 15, nullable: true })
  alias: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title: string;

  @Column({ name: 'phone_number', type: 'decimal', precision: 20, scale: 0, nullable: true })
  phoneNumber: string;

  @Column({ name: 'internal_number', type: 'decimal', precision: 5, scale: 0, nullable: true })
  internalNumber: string;

  @Column({ name: 'sort_order', type: 'tinyint', default: 0 })
  sortOrder: number;
}
