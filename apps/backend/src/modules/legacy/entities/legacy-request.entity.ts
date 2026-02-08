import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Legacy сущность: QD_requests
 * Обращения (заявки) в техподдержку
 * READ-ONLY!
 */
@Entity('QD_requests')
export class LegacyRequest {
  @PrimaryColumn({ name: 'RID' })
  id: number;

  @Column({ name: 'customerID', type: 'int' })
  customerId: number;

  @Column({ name: 'manager_id', type: 'int', nullable: true })
  managerId: number;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  type: string;

  @Column({ type: 'tinyint', default: 0 })
  closed: number;

  @Column({ name: 'add_date', type: 'datetime', nullable: true })
  createdAt: Date;

  @Column({ name: 'update_date', type: 'datetime', nullable: true })
  updatedAt: Date;

  @Column({ name: 'answer_date', type: 'datetime', nullable: true })
  answerDate: Date;

  @Column({ name: 'first_reaction_time', type: 'int', nullable: true })
  firstReactionTime: number;

  /**
   * Закрыто ли обращение
   */
  get isClosed(): boolean {
    return this.closed === 1;
  }

}
