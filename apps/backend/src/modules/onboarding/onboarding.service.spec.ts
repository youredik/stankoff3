import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingTour, TourAudience } from './entities/onboarding-tour.entity';
import { OnboardingStep, StepType, TooltipPosition } from './entities/onboarding-step.entity';
import { OnboardingProgress, ProgressStatus } from './entities/onboarding-progress.entity';
import { OnboardingQuiz, QuestionType, QuizQuestion } from './entities/onboarding-quiz.entity';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let tourRepository: jest.Mocked<Repository<OnboardingTour>>;
  let stepRepository: jest.Mocked<Repository<OnboardingStep>>;
  let progressRepository: jest.Mocked<Repository<OnboardingProgress>>;
  let quizRepository: jest.Mocked<Repository<OnboardingQuiz>>;

  const mockTour: OnboardingTour = {
    id: 'tour-1',
    name: 'Platform Basics',
    description: 'Learn the basics',
    code: 'platform_basics',
    audience: TourAudience.ALL,
    targetRoles: [],
    targetDepartments: [],
    order: 0,
    isActive: true,
    isRequired: true,
    autoStart: true,
    icon: 'Book',
    steps: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStep: OnboardingStep = {
    id: 'step-1',
    tourId: 'tour-1',
    tour: mockTour,
    title: 'Welcome',
    content: 'Welcome to the platform',
    type: StepType.TOOLTIP,
    targetSelector: '#welcome',
    route: '/dashboard',
    tooltipPosition: TooltipPosition.BOTTOM,
    videoUrl: null,
    quizId: null,
    requiredAction: null,
    order: 0,
    skippable: true,
    delay: 0,
    isActive: true,
    createdAt: new Date(),
  };

  const mockProgress: OnboardingProgress = {
    id: 'progress-1',
    userId: 'user-1',
    user: null as any,
    tourId: 'tour-1',
    tour: mockTour,
    status: ProgressStatus.NOT_STARTED,
    currentStepId: null,
    completedSteps: [],
    skippedSteps: [],
    completionPercentage: 0,
    quizResults: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQuiz: OnboardingQuiz = {
    id: 'quiz-1',
    name: 'Platform Quiz',
    description: 'Test your knowledge',
    code: 'platform_quiz',
    questions: [
      {
        id: 'q1',
        text: 'What is this platform?',
        type: QuestionType.SINGLE,
        options: [
          { id: 'a', text: 'A BPM system', isCorrect: true },
          { id: 'b', text: 'A game', isCorrect: false },
        ],
        points: 10,
      },
    ],
    passingScore: 70,
    timeLimit: null,
    maxAttempts: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    showExplanations: true,
    showResults: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    get maxScore(): number {
      return this.questions.reduce((sum: number, q: QuizQuestion) => sum + q.points, 0);
    },
  };

  beforeEach(async () => {
    const mockTourRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTour]),
      })),
    };

    const mockStepRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };

    const mockProgressRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockQuizRepository = {
      findOneBy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getRepositoryToken(OnboardingTour), useValue: mockTourRepository },
        { provide: getRepositoryToken(OnboardingStep), useValue: mockStepRepository },
        { provide: getRepositoryToken(OnboardingProgress), useValue: mockProgressRepository },
        { provide: getRepositoryToken(OnboardingQuiz), useValue: mockQuizRepository },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    tourRepository = module.get(getRepositoryToken(OnboardingTour));
    stepRepository = module.get(getRepositoryToken(OnboardingStep));
    progressRepository = module.get(getRepositoryToken(OnboardingProgress));
    quizRepository = module.get(getRepositoryToken(OnboardingQuiz));
  });

  describe('Tour Methods', () => {
    describe('createTour', () => {
      it('должен создать тур', async () => {
        tourRepository.create.mockReturnValue(mockTour);
        tourRepository.save.mockResolvedValue(mockTour);

        const result = await service.createTour({
          name: 'Platform Basics',
          code: 'platform_basics',
        });

        expect(result).toEqual(mockTour);
        expect(tourRepository.create).toHaveBeenCalled();
        expect(tourRepository.save).toHaveBeenCalled();
      });
    });

    describe('updateTour', () => {
      it('должен обновить тур', async () => {
        const updatedTour = { ...mockTour, name: 'Updated Tour' };
        tourRepository.findOneBy.mockResolvedValue(mockTour);
        tourRepository.save.mockResolvedValue(updatedTour);

        const result = await service.updateTour('tour-1', { name: 'Updated Tour' });

        expect(result.name).toBe('Updated Tour');
      });

      it('должен выбросить NotFoundException если тур не найден', async () => {
        tourRepository.findOneBy.mockResolvedValue(null);

        await expect(service.updateTour('invalid', { name: 'Test' }))
          .rejects.toThrow(NotFoundException);
      });
    });

    describe('deleteTour', () => {
      it('должен удалить тур', async () => {
        tourRepository.delete.mockResolvedValue({ affected: 1 } as any);

        await expect(service.deleteTour('tour-1')).resolves.not.toThrow();
      });

      it('должен выбросить NotFoundException если тур не найден', async () => {
        tourRepository.delete.mockResolvedValue({ affected: 0 } as any);

        await expect(service.deleteTour('invalid')).rejects.toThrow(NotFoundException);
      });
    });

    describe('getTour', () => {
      it('должен вернуть тур со шагами', async () => {
        const tourWithSteps = { ...mockTour, steps: [mockStep] };
        tourRepository.findOne.mockResolvedValue(tourWithSteps);

        const result = await service.getTour('tour-1');

        expect(result).toEqual(tourWithSteps);
        expect(result.steps).toHaveLength(1);
      });

      it('должен выбросить NotFoundException если тур не найден', async () => {
        tourRepository.findOne.mockResolvedValue(null);

        await expect(service.getTour('invalid')).rejects.toThrow(NotFoundException);
      });
    });

    describe('getTourByCode', () => {
      it('должен найти тур по коду', async () => {
        tourRepository.findOne.mockResolvedValue(mockTour);

        const result = await service.getTourByCode('platform_basics');

        expect(result).toEqual(mockTour);
      });
    });
  });

  describe('Step Methods', () => {
    describe('createStep', () => {
      it('должен создать шаг', async () => {
        tourRepository.findOneBy.mockResolvedValue(mockTour);
        stepRepository.findOne.mockResolvedValue(null);
        stepRepository.create.mockReturnValue(mockStep);
        stepRepository.save.mockResolvedValue(mockStep);

        const result = await service.createStep({
          tourId: 'tour-1',
          title: 'Welcome',
          content: 'Welcome to the platform',
        });

        expect(result).toEqual(mockStep);
      });

      it('должен выбросить NotFoundException если тур не найден', async () => {
        tourRepository.findOneBy.mockResolvedValue(null);

        await expect(service.createStep({
          tourId: 'invalid',
          title: 'Test',
          content: 'Test',
        })).rejects.toThrow(NotFoundException);
      });
    });

    describe('reorderSteps', () => {
      it('должен обновить порядок шагов', async () => {
        stepRepository.update.mockResolvedValue({ affected: 1 } as any);

        await service.reorderSteps('tour-1', ['step-2', 'step-1', 'step-3']);

        expect(stepRepository.update).toHaveBeenCalledTimes(3);
        expect(stepRepository.update).toHaveBeenCalledWith('step-2', { order: 0 });
        expect(stepRepository.update).toHaveBeenCalledWith('step-1', { order: 1 });
        expect(stepRepository.update).toHaveBeenCalledWith('step-3', { order: 2 });
      });
    });
  });

  describe('Progress Methods', () => {
    describe('getUserOnboardingStatus', () => {
      it('должен вернуть статус онбординга', async () => {
        const tourWithSteps = { ...mockTour, steps: [mockStep] };
        (tourRepository.createQueryBuilder as jest.Mock).mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([tourWithSteps]),
        });
        progressRepository.find.mockResolvedValue([]);

        const result = await service.getUserOnboardingStatus('user-1');

        expect(result.hasCompletedInitialOnboarding).toBe(false);
        expect(result.requiredTours).toHaveLength(1);
        expect(result.requiredTours[0].status).toBe(ProgressStatus.NOT_STARTED);
      });

      it('должен вернуть hasCompletedInitialOnboarding=true если все обязательные туры завершены', async () => {
        const tourWithSteps = { ...mockTour, steps: [mockStep] };
        const completedProgress = {
          ...mockProgress,
          status: ProgressStatus.COMPLETED,
          completionPercentage: 100,
        };

        (tourRepository.createQueryBuilder as jest.Mock).mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([tourWithSteps]),
        });
        progressRepository.find.mockResolvedValue([completedProgress]);

        const result = await service.getUserOnboardingStatus('user-1');

        expect(result.hasCompletedInitialOnboarding).toBe(true);
      });
    });

    describe('startTour', () => {
      it('должен начать новый тур', async () => {
        const tourWithSteps = { ...mockTour, steps: [mockStep] };
        tourRepository.findOne.mockResolvedValue(tourWithSteps);
        progressRepository.findOne.mockResolvedValue(null);
        progressRepository.create.mockReturnValue({
          ...mockProgress,
          status: ProgressStatus.IN_PROGRESS,
          currentStepId: 'step-1',
        });
        progressRepository.save.mockImplementation((p) => Promise.resolve(p as OnboardingProgress));

        const result = await service.startTour('user-1', 'tour-1');

        expect(result.status).toBe(ProgressStatus.IN_PROGRESS);
        expect(result.currentStepId).toBe('step-1');
      });

      it('должен выбросить BadRequestException если тур не содержит активных шагов', async () => {
        const emptyTour = { ...mockTour, steps: [] };
        tourRepository.findOne.mockResolvedValue(emptyTour);

        await expect(service.startTour('user-1', 'tour-1'))
          .rejects.toThrow(BadRequestException);
      });
    });

    describe('completeStep', () => {
      it('должен завершить шаг и перейти к следующему', async () => {
        const step2 = { ...mockStep, id: 'step-2', order: 1 };
        const tourWithSteps = { ...mockTour, steps: [mockStep, step2] };
        const inProgressProgress = {
          ...mockProgress,
          status: ProgressStatus.IN_PROGRESS,
          currentStepId: 'step-1',
          completedSteps: [],
        };

        tourRepository.findOne.mockResolvedValue(tourWithSteps);
        progressRepository.findOne.mockResolvedValue(inProgressProgress);
        progressRepository.save.mockImplementation((p) => Promise.resolve(p as OnboardingProgress));

        const result = await service.completeStep('user-1', 'tour-1', {
          stepId: 'step-1',
        });

        expect(result.currentStepId).toBe('step-2');
        expect(result.completedSteps).toContain('step-1');
      });

      it('должен завершить тур если это последний шаг', async () => {
        const tourWithSteps = { ...mockTour, steps: [mockStep] };
        const inProgressProgress = {
          ...mockProgress,
          status: ProgressStatus.IN_PROGRESS,
          currentStepId: 'step-1',
          completedSteps: [],
          skippedSteps: [],
        };

        tourRepository.findOne.mockResolvedValue(tourWithSteps);
        progressRepository.findOne.mockResolvedValue(inProgressProgress);
        progressRepository.save.mockImplementation((p) => Promise.resolve(p as OnboardingProgress));

        const result = await service.completeStep('user-1', 'tour-1', {
          stepId: 'step-1',
        });

        expect(result.status).toBe(ProgressStatus.COMPLETED);
        expect(result.completionPercentage).toBe(100);
      });

      it('должен выбросить NotFoundException если прогресс не найден', async () => {
        progressRepository.findOne.mockResolvedValue(null);

        await expect(service.completeStep('user-1', 'tour-1', { stepId: 'step-1' }))
          .rejects.toThrow(NotFoundException);
      });
    });

    describe('skipTour', () => {
      it('должен пропустить тур', async () => {
        progressRepository.findOne.mockResolvedValue(null);
        progressRepository.create.mockReturnValue({
          ...mockProgress,
          status: ProgressStatus.SKIPPED,
        });
        progressRepository.save.mockImplementation((p) => Promise.resolve(p as OnboardingProgress));

        const result = await service.skipTour('user-1', 'tour-1');

        expect(result.status).toBe(ProgressStatus.SKIPPED);
      });
    });
  });

  describe('Quiz Methods', () => {
    describe('getQuiz', () => {
      it('должен вернуть квиз', async () => {
        quizRepository.findOneBy.mockResolvedValue(mockQuiz);

        const result = await service.getQuiz('quiz-1');

        expect(result).toEqual(mockQuiz);
      });

      it('должен выбросить NotFoundException если квиз не найден', async () => {
        quizRepository.findOneBy.mockResolvedValue(null);

        await expect(service.getQuiz('invalid')).rejects.toThrow(NotFoundException);
      });
    });

    describe('submitQuiz', () => {
      it('должен вернуть результат квиза с правильным ответом', async () => {
        const progress = { ...mockProgress, status: ProgressStatus.IN_PROGRESS, quizResults: {} };
        quizRepository.findOneBy.mockResolvedValue(mockQuiz);
        progressRepository.findOne.mockResolvedValue(progress);
        progressRepository.save.mockImplementation((p) => Promise.resolve(p as OnboardingProgress));

        const result = await service.submitQuiz('user-1', 'tour-1', {
          quizId: 'quiz-1',
          answers: [{ questionId: 'q1', selectedOptions: ['a'] }],
        });

        expect(result.passed).toBe(true);
        expect(result.score).toBe(10);
        expect(result.percentage).toBe(100);
      });

      it('должен вернуть результат квиза с неправильным ответом', async () => {
        const progress = { ...mockProgress, status: ProgressStatus.IN_PROGRESS, quizResults: {} };
        quizRepository.findOneBy.mockResolvedValue(mockQuiz);
        progressRepository.findOne.mockResolvedValue(progress);
        progressRepository.save.mockImplementation((p) => Promise.resolve(p as OnboardingProgress));

        const result = await service.submitQuiz('user-1', 'tour-1', {
          quizId: 'quiz-1',
          answers: [{ questionId: 'q1', selectedOptions: ['b'] }],
        });

        expect(result.passed).toBe(false);
        expect(result.score).toBe(0);
      });
    });
  });

  describe('Auto Start Tours', () => {
    it('должен вернуть туры для автозапуска', async () => {
      const autoStartTour = { ...mockTour, autoStart: true, steps: [mockStep] };
      tourRepository.find.mockResolvedValue([autoStartTour]);
      progressRepository.find.mockResolvedValue([]);

      const result = await service.getAutoStartTours('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].autoStart).toBe(true);
    });

    it('должен исключить уже завершённые туры', async () => {
      const autoStartTour = { ...mockTour, autoStart: true, steps: [mockStep] };
      const completedProgress = {
        ...mockProgress,
        status: ProgressStatus.COMPLETED,
      };
      tourRepository.find.mockResolvedValue([autoStartTour]);
      progressRepository.find.mockResolvedValue([completedProgress]);

      const result = await service.getAutoStartTours('user-1');

      expect(result).toHaveLength(0);
    });
  });
});
