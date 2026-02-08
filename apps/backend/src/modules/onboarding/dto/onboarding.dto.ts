import { IsString, IsOptional, IsBoolean, IsArray, IsEnum, IsInt, Min, Max, IsUUID } from 'class-validator';
import { TourAudience } from '../entities/onboarding-tour.entity';
import { StepType, TooltipPosition } from '../entities/onboarding-step.entity';
import { ProgressStatus } from '../entities/onboarding-progress.entity';

// ==================== Tour DTOs ====================

export class CreateTourDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  code: string;

  @IsOptional()
  @IsEnum(TourAudience)
  audience?: TourAudience;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetDepartments?: string[];

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateTourDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TourAudience)
  audience?: TourAudience;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetDepartments?: string[];

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;

  @IsOptional()
  @IsString()
  icon?: string;
}

// ==================== Step DTOs ====================

export class CreateStepDto {
  @IsUUID()
  tourId: string;

  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(StepType)
  type?: StepType;

  @IsOptional()
  @IsString()
  targetSelector?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsEnum(TooltipPosition)
  tooltipPosition?: TooltipPosition;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsUUID()
  quizId?: string;

  @IsOptional()
  requiredAction?: Record<string, any>;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  skippable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  delay?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStepDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(StepType)
  type?: StepType;

  @IsOptional()
  @IsString()
  targetSelector?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsEnum(TooltipPosition)
  tooltipPosition?: TooltipPosition;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsUUID()
  quizId?: string;

  @IsOptional()
  requiredAction?: Record<string, any>;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  skippable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  delay?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ==================== Progress DTOs ====================

export class UpdateProgressDto {
  @IsOptional()
  @IsEnum(ProgressStatus)
  status?: ProgressStatus;

  @IsOptional()
  @IsUUID()
  currentStepId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completedSteps?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skippedSteps?: string[];
}

export class CompleteStepDto {
  @IsUUID()
  stepId: string;

  @IsOptional()
  @IsBoolean()
  skipped?: boolean;
}

export class SubmitQuizDto {
  @IsUUID()
  quizId: string;

  @IsArray()
  answers: Array<{
    questionId: string;
    selectedOptions?: string[];
    textAnswer?: string;
  }>;
}

// ==================== Response DTOs ====================

export interface TourWithProgressResponse {
  id: string;
  name: string;
  description: string;
  code: string;
  icon: string;
  isRequired: boolean;
  totalSteps: number;
  completedSteps: number;
  status: ProgressStatus;
  completionPercentage: number;
}

export interface UserOnboardingStatusResponse {
  hasCompletedInitialOnboarding: boolean;
  requiredTours: TourWithProgressResponse[];
  optionalTours: TourWithProgressResponse[];
  totalCompletionPercentage: number;
}

export interface QuizResultResponse {
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
