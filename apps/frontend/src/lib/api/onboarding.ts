import { apiClient } from './client';

// ==================== Types ====================

export enum TourAudience {
  ALL = 'all',
  NEW_USERS = 'new_users',
  ROLE_BASED = 'role_based',
  DEPARTMENT = 'department',
}

export enum StepType {
  TOOLTIP = 'tooltip',
  MODAL = 'modal',
  HIGHLIGHT = 'highlight',
  VIDEO = 'video',
  QUIZ = 'quiz',
  ACTION = 'action',
}

export enum TooltipPosition {
  TOP = 'top',
  BOTTOM = 'bottom',
  LEFT = 'left',
  RIGHT = 'right',
  AUTO = 'auto',
}

export enum ProgressStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export interface OnboardingStep {
  id: string;
  tourId: string;
  title: string;
  content: string;
  type: StepType;
  targetSelector: string | null;
  route: string | null;
  tooltipPosition: TooltipPosition;
  videoUrl: string | null;
  quizId: string | null;
  requiredAction: Record<string, unknown> | null;
  order: number;
  skippable: boolean;
  delay: number;
  isActive: boolean;
}

export interface OnboardingTour {
  id: string;
  name: string;
  description: string | null;
  code: string;
  audience: TourAudience;
  targetRoles: string[];
  targetDepartments: string[];
  order: number;
  isActive: boolean;
  isRequired: boolean;
  autoStart: boolean;
  icon: string | null;
  steps: OnboardingStep[];
}

export interface OnboardingProgress {
  id: string;
  userId: string;
  tourId: string;
  status: ProgressStatus;
  currentStepId: string | null;
  completedSteps: string[];
  skippedSteps: string[];
  completionPercentage: number;
  quizResults: Record<string, { score: number; maxScore: number; passed: boolean }> | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TourWithProgress {
  id: string;
  name: string;
  description: string | null;
  code: string;
  icon: string | null;
  isRequired: boolean;
  totalSteps: number;
  completedSteps: number;
  status: ProgressStatus;
  completionPercentage: number;
}

export interface UserOnboardingStatus {
  hasCompletedInitialOnboarding: boolean;
  requiredTours: TourWithProgress[];
  optionalTours: TourWithProgress[];
  totalCompletionPercentage: number;
}

export interface QuizQuestion {
  id: string;
  text: string;
  type: 'single' | 'multiple' | 'text' | 'order';
  options: Array<{
    id: string;
    text: string;
    isCorrect?: boolean;
    order?: number;
    feedback?: string;
  }>;
  correctAnswer?: string;
  points: number;
  explanation?: string;
  imageUrl?: string;
}

export interface OnboardingQuiz {
  id: string;
  name: string;
  description: string | null;
  code: string;
  questions: QuizQuestion[];
  passingScore: number;
  timeLimit: number | null;
  maxAttempts: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showExplanations: boolean;
  showResults: boolean;
  isActive: boolean;
}

export interface QuizResult {
  passed: boolean;
  score: number;
  maxScore: number;
  percentage: number;
  passingScore: number;
  feedback: Array<{
    questionId: string;
    correct: boolean;
    explanation?: string;
  }>;
}

// ==================== API Functions ====================

/**
 * Получить статус онбординга пользователя
 */
export async function getOnboardingStatus(): Promise<UserOnboardingStatus> {
  const response = await apiClient.get<UserOnboardingStatus>('/onboarding/status');
  return response.data;
}

/**
 * Получить туры для автозапуска
 */
export async function getAutoStartTours(): Promise<OnboardingTour[]> {
  const response = await apiClient.get<OnboardingTour[]>('/onboarding/auto-start');
  return response.data;
}

/**
 * Получить тур по коду
 */
export async function getTourByCode(code: string): Promise<OnboardingTour> {
  const response = await apiClient.get<OnboardingTour>(`/onboarding/tours/code/${code}`);
  return response.data;
}

/**
 * Начать тур
 */
export async function startTour(tourId: string): Promise<OnboardingProgress> {
  const response = await apiClient.post<OnboardingProgress>(`/onboarding/tours/${tourId}/start`);
  return response.data;
}

/**
 * Завершить/пропустить шаг
 */
export async function completeStep(
  tourId: string,
  stepId: string,
  skipped = false,
): Promise<OnboardingProgress> {
  const response = await apiClient.post<OnboardingProgress>(
    `/onboarding/tours/${tourId}/complete-step`,
    { stepId, skipped },
  );
  return response.data;
}

/**
 * Пропустить весь тур
 */
export async function skipTour(tourId: string): Promise<OnboardingProgress> {
  const response = await apiClient.post<OnboardingProgress>(`/onboarding/tours/${tourId}/skip`);
  return response.data;
}

/**
 * Получить квиз
 */
export async function getQuiz(quizId: string): Promise<OnboardingQuiz> {
  const response = await apiClient.get<OnboardingQuiz>(`/onboarding/quizzes/${quizId}`);
  return response.data;
}

/**
 * Отправить ответы на квиз
 */
export async function submitQuiz(
  tourId: string,
  quizId: string,
  answers: Array<{
    questionId: string;
    selectedOptions?: string[];
    textAnswer?: string;
  }>,
): Promise<QuizResult> {
  const response = await apiClient.post<QuizResult>(
    `/onboarding/tours/${tourId}/submit-quiz`,
    { quizId, answers },
  );
  return response.data;
}
