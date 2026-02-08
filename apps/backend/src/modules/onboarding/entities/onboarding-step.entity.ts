import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OnboardingTour } from './onboarding-tour.entity';

/**
 * Тип шага онбординга
 */
export enum StepType {
  TOOLTIP = 'tooltip',     // Подсказка с указателем на элемент
  MODAL = 'modal',         // Модальное окно
  HIGHLIGHT = 'highlight', // Подсветка элемента
  VIDEO = 'video',         // Видео-инструкция
  QUIZ = 'quiz',           // Тест/квиз
  ACTION = 'action',       // Требует действия от пользователя
}

/**
 * Позиция tooltip относительно элемента
 */
export enum TooltipPosition {
  TOP = 'top',
  BOTTOM = 'bottom',
  LEFT = 'left',
  RIGHT = 'right',
  AUTO = 'auto',
}

/**
 * Шаг онбординга
 */
@Entity('onboarding_steps')
export class OnboardingStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Тур, которому принадлежит шаг
   */
  @Column({ name: 'tour_id', type: 'uuid' })
  tourId: string;

  @ManyToOne(() => OnboardingTour, (tour) => tour.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tour_id' })
  tour: OnboardingTour;

  /**
   * Заголовок шага
   */
  @Column({ type: 'varchar', length: 255 })
  title: string;

  /**
   * Содержимое шага (поддерживает HTML)
   */
  @Column({ type: 'text' })
  content: string;

  /**
   * Тип шага
   */
  @Column({
    type: 'varchar',
    length: 50,
    default: StepType.TOOLTIP,
  })
  type: StepType;

  /**
   * CSS селектор целевого элемента
   * Например: '#sidebar-menu', '.workspace-card', '[data-tour="create-entity"]'
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  targetSelector: string | null;

  /**
   * Маршрут страницы, где показывать шаг
   * Например: '/dashboard', '/workspace/*'
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  route: string | null;

  /**
   * Позиция tooltip
   */
  @Column({
    type: 'varchar',
    length: 20,
    default: TooltipPosition.AUTO,
  })
  tooltipPosition: TooltipPosition;

  /**
   * URL видео (для type = VIDEO)
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  videoUrl: string | null;

  /**
   * ID квиза (для type = QUIZ)
   */
  @Column({ name: 'quiz_id', type: 'uuid', nullable: true })
  quizId: string | null;

  /**
   * Требуемое действие для завершения шага
   * JSON с описанием: { action: 'click', selector: '.button' }
   */
  @Column({ type: 'jsonb', nullable: true })
  requiredAction: Record<string, any> | null;

  /**
   * Порядок шага в туре
   */
  @Column({ type: 'int', default: 0 })
  order: number;

  /**
   * Можно ли пропустить шаг
   */
  @Column({ type: 'boolean', default: true })
  skippable: boolean;

  /**
   * Задержка перед показом (мс)
   */
  @Column({ type: 'int', default: 0 })
  delay: number;

  /**
   * Активен ли шаг
   */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
