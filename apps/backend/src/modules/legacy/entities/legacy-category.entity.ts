import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Legacy сущность: SS_categories
 * Категории товаров
 * READ-ONLY!
 */
@Entity('SS_categories')
export class LegacyCategory {
  @PrimaryColumn({ name: 'categoryID' })
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  uri: string;

  @Column({ type: 'int', nullable: true })
  parent: number;

  @Column({ name: 'category_is_active', type: 'int', default: 1 })
  isActive: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /**
   * Является ли категория корневой
   */
  get isRoot(): boolean {
    return !this.parent || this.parent === 0;
  }
}
