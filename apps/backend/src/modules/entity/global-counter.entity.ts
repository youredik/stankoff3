import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('global_counters')
export class GlobalCounter {
  @PrimaryColumn()
  name: string; // 'entity_number' - имя счётчика

  @Column({ default: 0 })
  value: number; // Текущее значение счётчика
}
