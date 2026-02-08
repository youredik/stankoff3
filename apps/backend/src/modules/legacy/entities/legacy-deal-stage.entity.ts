import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Legacy сущность: deal_stage
 * Этапы воронки продаж
 * READ-ONLY!
 */
@Entity('deal_stage')
export class LegacyDealStage {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ name: 'funnel_id', type: 'int', default: 1 })
  funnelId: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  color: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_final', type: 'tinyint', default: 0 })
  isFinal: number;

  @Column({ name: 'is_success', type: 'tinyint', default: 0 })
  isSuccess: number;

  /**
   * Является ли этап финальным
   */
  get isFinalStage(): boolean {
    return this.isFinal === 1;
  }

  /**
   * Является ли этап успешным (выигранная сделка)
   */
  get isSuccessStage(): boolean {
    return this.isSuccess === 1;
  }
}
