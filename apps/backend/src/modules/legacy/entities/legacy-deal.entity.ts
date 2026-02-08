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

  @Column({ name: 'creator_user_id', type: 'int', nullable: true })
  creatorUserId: number;

  @Column({ name: 'default_client_user_id', type: 'int', nullable: true })
  defaultClientUserId: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  amount: number;

  @Column({ name: 'deal_stage_id', type: 'int', nullable: true })
  dealStageId: number;

  @Column({ name: 'deal_stage_time', type: 'datetime', nullable: true })
  dealStageTime: Date;

  @Column({ name: 'funnel_id', type: 'int', default: 1 })
  funnelId: number;

  @Column({ type: 'varchar', nullable: true })
  status: string;

  @Column({ name: 'status_time', type: 'datetime', nullable: true })
  statusTime: Date;

  @Column({ type: 'varchar', nullable: true })
  completion: string;

  @Column({ name: 'completion_at', type: 'datetime', nullable: true })
  completionAt: Date;

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt: Date;

  // --- Backward-compatible aliases for existing code ---

  /**
   * Alias: title (для обратной совместимости, раньше было name)
   */
  get name(): string | null {
    return this.title;
  }

  /**
   * Alias: amount (для обратной совместимости, раньше было sum)
   */
  get sum(): number {
    return this.amount;
  }

  /**
   * Закрыта ли сделка (на основе completion_at)
   */
  get isClosed(): boolean {
    return this.completionAt !== null && this.completionAt !== undefined;
  }

  /**
   * Alias: completionAt (для обратной совместимости, раньше было closedAt)
   */
  get closedAt(): Date | null {
    return this.completionAt;
  }

  /**
   * Форматированная сумма
   */
  get formattedSum(): string {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
    }).format(this.amount);
  }
}
