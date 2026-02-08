import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OnboardingStep } from './onboarding-step.entity';

/**
 * Тип целевой аудитории тура
 */
export enum TourAudience {
  ALL = 'all',              // Все пользователи
  NEW_USERS = 'new_users',  // Только новые пользователи
  ROLE_BASED = 'role_based', // По ролям
  DEPARTMENT = 'department', // По отделам
}

/**
 * Тур онбординга
 * Представляет набор шагов для обучения пользователя
 */
@Entity('onboarding_tours')
export class OnboardingTour {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Название тура
   */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /**
   * Описание тура
   */
  @Column({ type: 'text', nullable: true })
  description: string;

  /**
   * Уникальный код тура для идентификации
   * Например: 'platform_basics', 'workspace_intro', 'bpmn_training'
   */
  @Column({ type: 'varchar', length: 100, unique: true })
  code: string;

  /**
   * Тип целевой аудитории
   */
  @Column({
    type: 'varchar',
    length: 50,
    default: TourAudience.ALL,
  })
  audience: TourAudience;

  /**
   * Конкретные роли, если audience = ROLE_BASED
   */
  @Column({ type: 'simple-array', nullable: true })
  targetRoles: string[];

  /**
   * Конкретные отделы, если audience = DEPARTMENT
   */
  @Column({ type: 'simple-array', nullable: true })
  targetDepartments: string[];

  /**
   * Порядок отображения
   */
  @Column({ type: 'int', default: 0 })
  order: number;

  /**
   * Активен ли тур
   */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Обязателен ли тур для прохождения
   */
  @Column({ type: 'boolean', default: false })
  isRequired: boolean;

  /**
   * Автоматически запускать при первом входе
   */
  @Column({ type: 'boolean', default: false })
  autoStart: boolean;

  /**
   * Иконка тура (lucide icon name)
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  icon: string;

  /**
   * Шаги тура
   */
  @OneToMany(() => OnboardingStep, (step) => step.tour, { cascade: true })
  steps: OnboardingStep[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
