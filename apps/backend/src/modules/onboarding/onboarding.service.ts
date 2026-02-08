import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OnboardingTour,
  TourAudience,
} from './entities/onboarding-tour.entity';
import { OnboardingStep } from './entities/onboarding-step.entity';
import {
  OnboardingProgress,
  ProgressStatus,
} from './entities/onboarding-progress.entity';
import { OnboardingQuiz, QuestionType } from './entities/onboarding-quiz.entity';
import {
  CreateTourDto,
  UpdateTourDto,
  CreateStepDto,
  UpdateStepDto,
  CompleteStepDto,
  SubmitQuizDto,
  TourWithProgressResponse,
  UserOnboardingStatusResponse,
  QuizResultResponse,
} from './dto/onboarding.dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(OnboardingTour)
    private readonly tourRepository: Repository<OnboardingTour>,
    @InjectRepository(OnboardingStep)
    private readonly stepRepository: Repository<OnboardingStep>,
    @InjectRepository(OnboardingProgress)
    private readonly progressRepository: Repository<OnboardingProgress>,
    @InjectRepository(OnboardingQuiz)
    private readonly quizRepository: Repository<OnboardingQuiz>,
  ) {}

  // ==================== Tour Methods ====================

  async createTour(dto: CreateTourDto): Promise<OnboardingTour> {
    const tour = this.tourRepository.create(dto);
    return this.tourRepository.save(tour);
  }

  async updateTour(id: string, dto: UpdateTourDto): Promise<OnboardingTour> {
    const tour = await this.tourRepository.findOneBy({ id });
    if (!tour) {
      throw new NotFoundException('Тур не найден');
    }
    Object.assign(tour, dto);
    return this.tourRepository.save(tour);
  }

  async deleteTour(id: string): Promise<void> {
    const result = await this.tourRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Тур не найден');
    }
  }

  async getTour(id: string): Promise<OnboardingTour> {
    const tour = await this.tourRepository.findOne({
      where: { id },
      relations: ['steps'],
      order: { steps: { order: 'ASC' } },
    });
    if (!tour) {
      throw new NotFoundException('Тур не найден');
    }
    return tour;
  }

  async getTourByCode(code: string): Promise<OnboardingTour> {
    const tour = await this.tourRepository.findOne({
      where: { code },
      relations: ['steps'],
      order: { steps: { order: 'ASC' } },
    });
    if (!tour) {
      throw new NotFoundException('Тур не найден');
    }
    return tour;
  }

  async getAllTours(activeOnly = false): Promise<OnboardingTour[]> {
    const query = this.tourRepository
      .createQueryBuilder('tour')
      .leftJoinAndSelect('tour.steps', 'step')
      .orderBy('tour.order', 'ASC')
      .addOrderBy('step.order', 'ASC');

    if (activeOnly) {
      query.where('tour.isActive = :isActive', { isActive: true });
    }

    return query.getMany();
  }

  // ==================== Step Methods ====================

  async createStep(dto: CreateStepDto): Promise<OnboardingStep> {
    const tour = await this.tourRepository.findOneBy({ id: dto.tourId });
    if (!tour) {
      throw new NotFoundException('Тур не найден');
    }

    // Автоматически установить order как последний
    if (dto.order === undefined) {
      const lastStep = await this.stepRepository.findOne({
        where: { tourId: dto.tourId },
        order: { order: 'DESC' },
      });
      dto.order = lastStep ? lastStep.order + 1 : 0;
    }

    const step = this.stepRepository.create(dto);
    return this.stepRepository.save(step);
  }

  async updateStep(id: string, dto: UpdateStepDto): Promise<OnboardingStep> {
    const step = await this.stepRepository.findOneBy({ id });
    if (!step) {
      throw new NotFoundException('Шаг не найден');
    }
    Object.assign(step, dto);
    return this.stepRepository.save(step);
  }

  async deleteStep(id: string): Promise<void> {
    const result = await this.stepRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Шаг не найден');
    }
  }

  async reorderSteps(tourId: string, stepIds: string[]): Promise<void> {
    await Promise.all(
      stepIds.map((id, index) =>
        this.stepRepository.update(id, { order: index }),
      ),
    );
  }

  // ==================== Progress Methods ====================

  async getUserOnboardingStatus(
    userId: string,
    userRole?: string,
    userDepartment?: string,
  ): Promise<UserOnboardingStatusResponse> {
    // Получаем все активные туры
    const tours = await this.getAllTours(true);

    // Фильтруем по аудитории
    const applicableTours = tours.filter((tour) =>
      this.isTourApplicable(tour, userRole, userDepartment),
    );

    // Получаем прогресс пользователя
    const progressRecords = await this.progressRepository.find({
      where: { userId },
    });
    const progressMap = new Map(progressRecords.map((p) => [p.tourId, p]));

    // Формируем ответ
    const toursWithProgress: TourWithProgressResponse[] = applicableTours.map(
      (tour) => {
        const progress = progressMap.get(tour.id);
        const activeSteps = tour.steps.filter((s) => s.isActive);
        return {
          id: tour.id,
          name: tour.name,
          description: tour.description,
          code: tour.code,
          icon: tour.icon,
          isRequired: tour.isRequired,
          totalSteps: activeSteps.length,
          completedSteps: progress?.completedSteps?.length || 0,
          status: progress?.status || ProgressStatus.NOT_STARTED,
          completionPercentage: progress?.completionPercentage || 0,
        };
      },
    );

    const requiredTours = toursWithProgress.filter((t) => t.isRequired);
    const optionalTours = toursWithProgress.filter((t) => !t.isRequired);

    // Проверяем, завершён ли начальный онбординг
    const hasCompletedInitialOnboarding = requiredTours.every(
      (t) => t.status === ProgressStatus.COMPLETED,
    );

    // Общий процент завершения
    const totalCompletionPercentage =
      toursWithProgress.length > 0
        ? Math.round(
            toursWithProgress.reduce((sum, t) => sum + t.completionPercentage, 0) /
              toursWithProgress.length,
          )
        : 100;

    return {
      hasCompletedInitialOnboarding,
      requiredTours,
      optionalTours,
      totalCompletionPercentage,
    };
  }

  async startTour(userId: string, tourId: string): Promise<OnboardingProgress> {
    const tour = await this.getTour(tourId);
    const activeSteps = tour.steps.filter((s) => s.isActive);

    if (activeSteps.length === 0) {
      throw new BadRequestException('Тур не содержит активных шагов');
    }

    // Проверяем существующий прогресс
    let progress = await this.progressRepository.findOne({
      where: { userId, tourId },
    });

    if (progress && progress.status === ProgressStatus.COMPLETED) {
      // Разрешаем повторное прохождение
      progress.status = ProgressStatus.IN_PROGRESS;
      progress.currentStepId = activeSteps[0].id;
      progress.completedSteps = [];
      progress.skippedSteps = [];
      progress.completionPercentage = 0;
      progress.startedAt = new Date();
      progress.completedAt = null;
    } else if (!progress) {
      progress = this.progressRepository.create({
        userId,
        tourId,
        status: ProgressStatus.IN_PROGRESS,
        currentStepId: activeSteps[0].id,
        completedSteps: [],
        skippedSteps: [],
        startedAt: new Date(),
      });
    } else {
      // Продолжаем существующий тур
      progress.status = ProgressStatus.IN_PROGRESS;
    }

    return this.progressRepository.save(progress);
  }

  async completeStep(
    userId: string,
    tourId: string,
    dto: CompleteStepDto,
  ): Promise<OnboardingProgress> {
    const progress = await this.progressRepository.findOne({
      where: { userId, tourId },
    });

    if (!progress) {
      throw new NotFoundException('Прогресс не найден. Сначала начните тур.');
    }

    const tour = await this.getTour(tourId);
    const activeSteps = tour.steps.filter((s) => s.isActive);
    const stepIndex = activeSteps.findIndex((s) => s.id === dto.stepId);

    if (stepIndex === -1) {
      throw new BadRequestException('Шаг не найден в туре');
    }

    // Добавляем шаг в завершённые или пропущенные
    if (dto.skipped) {
      if (!progress.skippedSteps.includes(dto.stepId)) {
        progress.skippedSteps.push(dto.stepId);
      }
    } else {
      if (!progress.completedSteps.includes(dto.stepId)) {
        progress.completedSteps.push(dto.stepId);
      }
    }

    // Переходим к следующему шагу
    const nextStep = activeSteps[stepIndex + 1];
    if (nextStep) {
      progress.currentStepId = nextStep.id;
    } else {
      // Тур завершён
      progress.status = ProgressStatus.COMPLETED;
      progress.completedAt = new Date();
      progress.currentStepId = null;
    }

    // Обновляем процент завершения
    const totalHandled = progress.completedSteps.length + progress.skippedSteps.length;
    progress.completionPercentage = Math.round(
      (totalHandled / activeSteps.length) * 100,
    );

    return this.progressRepository.save(progress);
  }

  async skipTour(userId: string, tourId: string): Promise<OnboardingProgress> {
    let progress = await this.progressRepository.findOne({
      where: { userId, tourId },
    });

    if (!progress) {
      progress = this.progressRepository.create({
        userId,
        tourId,
        status: ProgressStatus.SKIPPED,
        completedSteps: [],
        skippedSteps: [],
      });
    } else {
      progress.status = ProgressStatus.SKIPPED;
    }

    return this.progressRepository.save(progress);
  }

  // ==================== Quiz Methods ====================

  async getQuiz(id: string): Promise<OnboardingQuiz> {
    const quiz = await this.quizRepository.findOneBy({ id });
    if (!quiz) {
      throw new NotFoundException('Квиз не найден');
    }
    return quiz;
  }

  async submitQuiz(
    userId: string,
    tourId: string,
    dto: SubmitQuizDto,
  ): Promise<QuizResultResponse> {
    const quiz = await this.getQuiz(dto.quizId);
    const progress = await this.progressRepository.findOne({
      where: { userId, tourId },
    });

    if (!progress) {
      throw new NotFoundException('Прогресс не найден');
    }

    // Подсчитываем результат
    let score = 0;
    const feedback: QuizResultResponse['feedback'] = [];

    for (const answer of dto.answers) {
      const question = quiz.questions.find((q) => q.id === answer.questionId);
      if (!question) continue;

      let correct = false;

      switch (question.type) {
        case QuestionType.SINGLE:
        case QuestionType.MULTIPLE: {
          const correctOptionIds = question.options
            .filter((o) => o.isCorrect)
            .map((o) => o.id);
          const selectedIds = answer.selectedOptions || [];
          correct =
            correctOptionIds.length === selectedIds.length &&
            correctOptionIds.every((id) => selectedIds.includes(id));
          break;
        }
        case QuestionType.TEXT: {
          const userAnswer = (answer.textAnswer || '').toLowerCase().trim();
          const expectedAnswer = (question.correctAnswer || '').toLowerCase().trim();
          correct = userAnswer === expectedAnswer;
          break;
        }
        case QuestionType.ORDER: {
          const correctOrder = question.options
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((o) => o.id);
          correct =
            JSON.stringify(answer.selectedOptions) === JSON.stringify(correctOrder);
          break;
        }
      }

      if (correct) {
        score += question.points;
      }

      feedback.push({
        questionId: question.id,
        correct,
        explanation: quiz.showExplanations ? question.explanation : undefined,
      });
    }

    const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0);
    const percentage = Math.round((score / maxScore) * 100);
    const passed = percentage >= quiz.passingScore;

    // Сохраняем результат в прогрессе
    if (!progress.quizResults) {
      progress.quizResults = {};
    }
    progress.quizResults[dto.quizId] = { score, maxScore, passed };
    await this.progressRepository.save(progress);

    return {
      passed,
      score,
      maxScore,
      percentage,
      passingScore: quiz.passingScore,
      feedback: quiz.showResults ? feedback : [],
    };
  }

  // ==================== Helper Methods ====================

  private isTourApplicable(
    tour: OnboardingTour,
    userRole?: string,
    userDepartment?: string,
  ): boolean {
    switch (tour.audience) {
      case TourAudience.ALL:
        return true;
      case TourAudience.NEW_USERS:
        // Проверяется на уровне контроллера
        return true;
      case TourAudience.ROLE_BASED:
        return userRole ? tour.targetRoles?.includes(userRole) || false : false;
      case TourAudience.DEPARTMENT:
        return userDepartment
          ? tour.targetDepartments?.includes(userDepartment) || false
          : false;
      default:
        return true;
    }
  }

  /**
   * Получить туры для автозапуска при первом входе
   */
  async getAutoStartTours(
    userId: string,
    userRole?: string,
    userDepartment?: string,
  ): Promise<OnboardingTour[]> {
    const tours = await this.tourRepository.find({
      where: { isActive: true, autoStart: true },
      relations: ['steps'],
      order: { order: 'ASC' },
    });

    // Фильтруем по аудитории
    const applicableTours = tours.filter((tour) =>
      this.isTourApplicable(tour, userRole, userDepartment),
    );

    // Исключаем уже завершённые
    const progressRecords = await this.progressRepository.find({
      where: { userId, status: ProgressStatus.COMPLETED },
      select: ['tourId'],
    });
    const completedTourIds = new Set(progressRecords.map((p) => p.tourId));

    return applicableTours.filter((tour) => !completedTourIds.has(tour.id));
  }
}
