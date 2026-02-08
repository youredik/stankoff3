import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Legacy сущность: QD_answers
 * Ответы на обращения (переписка, решения)
 * READ-ONLY!
 *
 * Содержит 2.3M+ записей — основной источник для RAG
 */
@Entity('QD_answers')
export class LegacyAnswer {
  @PrimaryColumn({ name: 'AID' })
  id: number;

  @Column({ name: 'RID', type: 'int' })
  requestId: number;

  @Column({ name: 'UID', type: 'int' })
  customerId: number;

  @Column({ name: 'is_client', type: 'tinyint', default: 0 })
  isClient: number;

  @Column({ type: 'text', nullable: true })
  text: string;

  @Column({ name: 'add_date', type: 'datetime', nullable: true })
  createdAt: Date;

  /**
   * Длина текста ответа
   */
  get contentLength(): number {
    return this.text?.length || 0;
  }
}
