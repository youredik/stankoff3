import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../user/user.entity';
import { OnboardingTour } from './onboarding-tour.entity';

/**
 * Статус прохождения тура
 */
export enum ProgressStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

/**
 * Прогресс пользователя по онбордингу
 */
@Entity('onboarding_progress')
@Unique(['userId', 'tourId'])
@Index(['userId', 'status'])
export class OnboardingProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID пользователя
   */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * ID тура
   */
  @Column({ name: 'tour_id', type: 'uuid' })
  tourId: string;

  @ManyToOne(() => OnboardingTour, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tour_id' })
  tour: OnboardingTour;

  /**
   * Статус прохождения
   */
  @Column({
    type: 'varchar',
    length: 50,
    default: ProgressStatus.NOT_STARTED,
  })
  status: ProgressStatus;

  /**
   * ID текущего шага
   */
  @Column({ name: 'current_step_id', type: 'uuid', nullable: true })
  currentStepId: string | null;

  /**
   * Завершённые шаги (массив ID)
   */
  @Column({ name: 'completed_steps', type: 'simple-array', default: '' })
  completedSteps: string[];

  /**
   * Пропущенные шаги (массив ID)
   */
  @Column({ name: 'skipped_steps', type: 'simple-array', default: '' })
  skippedSteps: string[];

  /**
   * Процент завершения (0-100)
   */
  @Column({ name: 'completion_percentage', type: 'int', default: 0 })
  completionPercentage: number;

  /**
   * Результаты квизов
   * { quizId: { score: number, maxScore: number, passed: boolean } }
   */
  @Column({ name: 'quiz_results', type: 'jsonb', nullable: true })
  quizResults: Record<string, { score: number; maxScore: number; passed: boolean }> | null;

  /**
   * Когда начал тур
   */
  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  /**
   * Когда завершил тур
   */
  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
