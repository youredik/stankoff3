import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Legacy сущность: SS_customers
 * Пользователи системы (клиенты и сотрудники)
 * READ-ONLY!
 */
@Entity('SS_customers')
export class LegacyCustomer {
  @PrimaryColumn({ name: 'customerID' })
  id: number;

  @Column({ name: 'first_name', nullable: true })
  firstName: string;

  @Column({ name: 'last_name', nullable: true })
  lastName: string;

  @Column({ name: 'Email', nullable: true })
  email: string;

  @Column({ type: 'bigint', nullable: true })
  phone: string;

  @Column({ name: 'is_manager', type: 'tinyint', default: 0 })
  isManager: number;

  @Column({ name: 'default_counterparty_id', type: 'int', default: 0 })
  defaultCounterpartyId: number;

  @Column({ name: 'reg_datetime', type: 'datetime', nullable: true })
  registrationDate: Date;

  /**
   * Полное имя пользователя
   */
  get displayName(): string {
    const fullName = `${this.firstName || ''} ${this.lastName || ''}`.trim();
    return fullName || this.email || `ID: ${this.id}`;
  }

  /**
   * Является ли пользователь менеджером (сотрудником)
   */
  get isEmployee(): boolean {
    return this.isManager === 1;
  }
}
