import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Legacy сущность: deal
 * Сделки CRM
 * READ-ONLY!
 */
@Entity('deal')
export class LegacyDeal {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ name: 'counterparty_id', type: 'int', nullable: true })
  counterpartyId: number;

  @Column({ name: 'employee_user_id', type: 'int', nullable: true })
  employeeUserId: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  sum: number;

  @Column({ name: 'deal_stage_id', type: 'int', nullable: true })
  dealStageId: number;

  @Column({ name: 'funnel_id', type: 'int', default: 1 })
  funnelId: number;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt: Date;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true })
  closedAt: Date;

  @Column({ name: 'expected_close_date', type: 'date', nullable: true })
  expectedCloseDate: Date;

  /**
   * Закрыта ли сделка
   */
  get isClosed(): boolean {
    return this.closedAt !== null;
  }

  /**
   * Форматированная сумма
   */
  get formattedSum(): string {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
    }).format(this.sum);
  }
}
