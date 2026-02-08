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

  @Column({ name: 'customerID', type: 'int' })
  customerId: number;

  @Column({ type: 'text', nullable: true })
  answer: string;

  @Column({ name: 'add_date', type: 'datetime', nullable: true })
  createdAt: Date;

  @Column({ name: 'is_hidden', type: 'tinyint', default: 0 })
  isHidden: number;

  @Column({ name: 'is_internal', type: 'tinyint', default: 0 })
  isInternal: number;

  /**
   * Является ли ответ скрытым от клиента
   */
  get hidden(): boolean {
    return this.isHidden === 1;
  }

  /**
   * Является ли ответ внутренним (только для сотрудников)
   */
  get internal(): boolean {
    return this.isInternal === 1;
  }

  /**
   * Длина текста ответа
   */
  get contentLength(): number {
    return this.answer?.length || 0;
  }
}
