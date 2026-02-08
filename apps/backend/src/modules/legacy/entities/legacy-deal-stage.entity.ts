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

  @Column({ type: 'varchar', length: 255, nullable: true })
  alias: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', nullable: true })
  completion: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  color: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  // --- Backward-compatible alias for existing code ---

  /**
   * Alias: title (для обратной совместимости, раньше было name)
   */
  get name(): string {
    return this.title;
  }
}
