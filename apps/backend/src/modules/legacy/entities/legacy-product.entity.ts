import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Legacy сущность: SS_products
 * Товары (станки, оборудование)
 * READ-ONLY!
 */
@Entity('SS_products')
export class LegacyProduct {
  @PrimaryColumn({ name: 'productID' })
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  uri: string;

  @Column({ name: 'Price', type: 'decimal', precision: 20, scale: 2, default: 0 })
  price: number;

  @Column({ name: 'categoryID', type: 'int', nullable: true })
  categoryId: number;

  @Column({ name: 'default_supplier', type: 'int', nullable: true })
  supplierId: number;

  @Column({ name: 'in_stock', type: 'int', default: 0 })
  inStock: number;

  @Column({ name: 'product_code', type: 'varchar', length: 100, nullable: true })
  productCode: string;

  @Column({ name: 'factory_name', type: 'varchar', length: 255, nullable: true })
  factoryName: string;

  @Column({ type: 'tinyint', default: 1 })
  enabled: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'brief_description', type: 'mediumtext', nullable: true })
  briefDescription: string;

  @Column({ name: 'base_price', type: 'decimal', precision: 20, scale: 2, default: 0 })
  basePrice: number;

  @Column({ name: 'fob_price', type: 'decimal', precision: 20, scale: 2, default: 0 })
  fobPrice: number;

  @Column({ type: 'tinyint', default: 12, nullable: true })
  warranty: number;

  /**
   * Есть ли товар в наличии
   */
  get isInStock(): boolean {
    return this.inStock > 0;
  }

  /**
   * Активен ли товар
   */
  get isActive(): boolean {
    return this.enabled === 1;
  }
}
