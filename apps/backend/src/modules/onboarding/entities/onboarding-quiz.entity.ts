import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Тип вопроса
 */
export enum QuestionType {
  SINGLE = 'single',     // Один правильный ответ
  MULTIPLE = 'multiple', // Несколько правильных ответов
  TEXT = 'text',         // Текстовый ответ
  ORDER = 'order',       // Расположить в правильном порядке
}

/**
 * Вариант ответа
 */
export interface QuizOption {
  id: string;
  text: string;
  isCorrect?: boolean;
  order?: number;  // для type = ORDER
  feedback?: string; // объяснение при выборе
}

/**
 * Вопрос квиза
 */
export interface QuizQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options: QuizOption[];
  correctAnswer?: string; // для type = TEXT
  points: number;
  explanation?: string; // объяснение правильного ответа
  imageUrl?: string;
}

/**
 * Квиз/тест для онбординга
 */
@Entity('onboarding_quizzes')
export class OnboardingQuiz {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Название квиза
   */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /**
   * Описание квиза
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Уникальный код квиза
   */
  @Column({ type: 'varchar', length: 100, unique: true })
  code: string;

  /**
   * Вопросы квиза
   */
  @Column({ type: 'jsonb' })
  questions: QuizQuestion[];

  /**
   * Минимальный процент для прохождения
   */
  @Column({ name: 'passing_score', type: 'int', default: 70 })
  passingScore: number;

  /**
   * Максимальное время на прохождение (секунды, null = без ограничений)
   */
  @Column({ name: 'time_limit', type: 'int', nullable: true })
  timeLimit: number | null;

  /**
   * Количество попыток (null = неограничено)
   */
  @Column({ name: 'max_attempts', type: 'int', nullable: true })
  maxAttempts: number | null;

  /**
   * Перемешивать вопросы
   */
  @Column({ name: 'shuffle_questions', type: 'boolean', default: false })
  shuffleQuestions: boolean;

  /**
   * Перемешивать варианты ответов
   */
  @Column({ name: 'shuffle_options', type: 'boolean', default: false })
  shuffleOptions: boolean;

  /**
   * Показывать объяснения после ответа
   */
  @Column({ name: 'show_explanations', type: 'boolean', default: true })
  showExplanations: boolean;

  /**
   * Показывать результат сразу после завершения
   */
  @Column({ name: 'show_results', type: 'boolean', default: true })
  showResults: boolean;

  /**
   * Активен ли квиз
   */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Получить максимальный балл
   */
  get maxScore(): number {
    return this.questions.reduce((sum, q) => sum + q.points, 0);
  }
}
