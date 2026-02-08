import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Legacy сущность: counterparty
 * Контрагенты (юридические лица)
 * READ-ONLY!
 */
@Entity('counterparty')
export class LegacyCounterparty {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  inn: string;

  @Column({ name: 'dadata_kpp', type: 'varchar', length: 9, nullable: true })
  kpp: string;

  @Column({ name: 'dadata_ogrn', type: 'decimal', precision: 15, scale: 0, nullable: true })
  ogrn: string;

  @Column({ name: 'dadata_address', type: 'text', nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  director: string;

  @Column({ name: 'dadata_status', type: 'varchar', length: 12, nullable: true })
  status: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  type: string;

  /**
   * Короткое название (без ОПФ)
   */
  get shortName(): string {
    if (!this.name) return '';
    // Убираем типичные ОПФ: ООО, ИП, АО, ПАО и т.д.
    return this.name
      .replace(/^(ООО|ОАО|ПАО|АО|ЗАО|ИП)\s+["«]?/i, '')
      .replace(/["»]?\s*$/i, '')
      .trim();
  }
}
