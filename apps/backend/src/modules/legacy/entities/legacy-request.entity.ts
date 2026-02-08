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

  @Column({ type: 'text', nullable: true })
  body: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  type: string;

  @Column({ type: 'tinyint', default: 0 })
  closed: number;

  @Column({ name: 'status_id', type: 'int', nullable: true })
  statusId: number;

  @Column({ name: 'add_date', type: 'datetime', nullable: true })
  createdAt: Date;

  @Column({ name: 'update_date', type: 'datetime', nullable: true })
  updatedAt: Date;

  @Column({ name: 'close_date', type: 'datetime', nullable: true })
  closedAt: Date;

  @Column({ type: 'int', default: 0 })
  priority: number;

  /**
   * Закрыто ли обращение
   */
  get isClosed(): boolean {
    return this.closed === 1;
  }

  /**
   * Текст приоритета
   */
  get priorityLabel(): string {
    switch (this.priority) {
      case 3:
        return 'critical';
      case 2:
        return 'high';
      case 1:
        return 'medium';
      default:
        return 'low';
    }
  }
}
