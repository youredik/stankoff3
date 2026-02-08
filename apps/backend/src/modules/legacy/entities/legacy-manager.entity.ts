import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Legacy сущность: manager
 * Сотрудники компании (менеджеры)
 * READ-ONLY!
 */
@Entity('manager')
export class LegacyManager {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 10 })
  alias: string;

  @Column({ name: 'department_id', type: 'tinyint', nullable: true })
  departmentId: number;

  @Column({ type: 'tinyint', default: 1 })
  active: number;

  @Column({ type: 'tinyint', default: 0 })
  vacation: number;

  @Column({ name: 'vacation_from', type: 'int', nullable: true })
  vacationFrom: number;

  @Column({ name: 'vacation_to', type: 'int', nullable: true })
  vacationTo: number;

  @Column({ name: 'can_get_request', type: 'tinyint', default: 1 })
  canGetRequest: number;

  @Column({ name: 'can_sale', type: 'tinyint', default: 1 })
  canSale: number;

  @Column({ name: 'show_in_contacts', type: 'tinyint', default: 0 })
  showInContacts: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sip: string;

  @Column({ name: 'telegram_id', type: 'bigint', nullable: true })
  telegramId: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /**
   * Активен ли сотрудник
   */
  get isActive(): boolean {
    return this.active === 1;
  }

  /**
   * В отпуске ли сотрудник
   */
  get isOnVacation(): boolean {
    return this.vacation === 1;
  }

  /**
   * Может ли принимать заявки
   */
  get canAcceptRequests(): boolean {
    return this.canGetRequest === 1 && this.active === 1 && this.vacation !== 1;
  }
}
