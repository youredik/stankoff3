import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '../user/user.entity';
import { OnboardingService } from './onboarding.service';
import {
  CreateTourDto,
  UpdateTourDto,
  CreateStepDto,
  UpdateStepDto,
  CompleteStepDto,
  SubmitQuizDto,
  UserOnboardingStatusResponse,
  QuizResultResponse,
} from './dto/onboarding.dto';
import { OnboardingTour } from './entities/onboarding-tour.entity';
import { OnboardingStep } from './entities/onboarding-step.entity';
import { OnboardingProgress } from './entities/onboarding-progress.entity';
import { OnboardingQuiz } from './entities/onboarding-quiz.entity';

@Controller('onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly onboardingService: OnboardingService) {}

  // ==================== User Endpoints ====================

  /**
   * Получить статус онбординга текущего пользователя
   *
   * GET /api/onboarding/status
   */
  @Get('status')
  async getMyStatus(
    @CurrentUser() user: User,
  ): Promise<UserOnboardingStatusResponse> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }
    return this.onboardingService.getUserOnboardingStatus(
      user.id,
      user.role,
      user.department ?? undefined,
    );
  }

  /**
   * Получить туры для автозапуска (при первом входе)
   *
   * GET /api/onboarding/auto-start
   */
  @Get('auto-start')
  async getAutoStartTours(
    @CurrentUser() user: User,
  ): Promise<OnboardingTour[]> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }
    return this.onboardingService.getAutoStartTours(
      user.id,
      user.role,
      user.department ?? undefined,
    );
  }

  /**
   * Получить тур по коду
   *
   * GET /api/onboarding/tours/code/:code
   */
  @Get('tours/code/:code')
  async getTourByCode(@Param('code') code: string): Promise<OnboardingTour> {
    return this.onboardingService.getTourByCode(code);
  }

  /**
   * Начать тур
   *
   * POST /api/onboarding/tours/:tourId/start
   */
  @Post('tours/:tourId/start')
  async startTour(
    @Param('tourId') tourId: string,
    @CurrentUser() user: User,
  ): Promise<OnboardingProgress> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }
    return this.onboardingService.startTour(user.id, tourId);
  }

  /**
   * Завершить/пропустить шаг
   *
   * POST /api/onboarding/tours/:tourId/complete-step
   */
  @Post('tours/:tourId/complete-step')
  async completeStep(
    @Param('tourId') tourId: string,
    @Body() dto: CompleteStepDto,
    @CurrentUser() user: User,
  ): Promise<OnboardingProgress> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }
    return this.onboardingService.completeStep(user.id, tourId, dto);
  }

  /**
   * Пропустить весь тур
   *
   * POST /api/onboarding/tours/:tourId/skip
   */
  @Post('tours/:tourId/skip')
  async skipTour(
    @Param('tourId') tourId: string,
    @CurrentUser() user: User,
  ): Promise<OnboardingProgress> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }
    return this.onboardingService.skipTour(user.id, tourId);
  }

  /**
   * Отправить ответы на квиз
   *
   * POST /api/onboarding/tours/:tourId/submit-quiz
   */
  @Post('tours/:tourId/submit-quiz')
  async submitQuiz(
    @Param('tourId') tourId: string,
    @Body() dto: SubmitQuizDto,
    @CurrentUser() user: User,
  ): Promise<QuizResultResponse> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }
    return this.onboardingService.submitQuiz(user.id, tourId, dto);
  }

  /**
   * Получить квиз
   *
   * GET /api/onboarding/quizzes/:id
   */
  @Get('quizzes/:id')
  async getQuiz(@Param('id') id: string): Promise<OnboardingQuiz> {
    return this.onboardingService.getQuiz(id);
  }

  // ==================== Admin Endpoints ====================

  /**
   * Получить все туры (admin)
   *
   * GET /api/onboarding/admin/tours
   */
  @Get('admin/tours')
  @Roles(UserRole.ADMIN)
  async getAllTours(
    @Query('activeOnly') activeOnly?: string,
  ): Promise<OnboardingTour[]> {
    return this.onboardingService.getAllTours(activeOnly === 'true');
  }

  /**
   * Получить тур по ID (admin)
   *
   * GET /api/onboarding/admin/tours/:id
   */
  @Get('admin/tours/:id')
  @Roles(UserRole.ADMIN)
  async getTour(@Param('id') id: string): Promise<OnboardingTour> {
    return this.onboardingService.getTour(id);
  }

  /**
   * Создать тур (admin)
   *
   * POST /api/onboarding/admin/tours
   */
  @Post('admin/tours')
  @Roles(UserRole.ADMIN)
  async createTour(@Body() dto: CreateTourDto): Promise<OnboardingTour> {
    return this.onboardingService.createTour(dto);
  }

  /**
   * Обновить тур (admin)
   *
   * PUT /api/onboarding/admin/tours/:id
   */
  @Put('admin/tours/:id')
  @Roles(UserRole.ADMIN)
  async updateTour(
    @Param('id') id: string,
    @Body() dto: UpdateTourDto,
  ): Promise<OnboardingTour> {
    return this.onboardingService.updateTour(id, dto);
  }

  /**
   * Удалить тур (admin)
   *
   * DELETE /api/onboarding/admin/tours/:id
   */
  @Delete('admin/tours/:id')
  @Roles(UserRole.ADMIN)
  async deleteTour(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.onboardingService.deleteTour(id);
    return { success: true };
  }

  /**
   * Создать шаг (admin)
   *
   * POST /api/onboarding/admin/steps
   */
  @Post('admin/steps')
  @Roles(UserRole.ADMIN)
  async createStep(@Body() dto: CreateStepDto): Promise<OnboardingStep> {
    return this.onboardingService.createStep(dto);
  }

  /**
   * Обновить шаг (admin)
   *
   * PUT /api/onboarding/admin/steps/:id
   */
  @Put('admin/steps/:id')
  @Roles(UserRole.ADMIN)
  async updateStep(
    @Param('id') id: string,
    @Body() dto: UpdateStepDto,
  ): Promise<OnboardingStep> {
    return this.onboardingService.updateStep(id, dto);
  }

  /**
   * Удалить шаг (admin)
   *
   * DELETE /api/onboarding/admin/steps/:id
   */
  @Delete('admin/steps/:id')
  @Roles(UserRole.ADMIN)
  async deleteStep(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.onboardingService.deleteStep(id);
    return { success: true };
  }

  /**
   * Изменить порядок шагов (admin)
   *
   * POST /api/onboarding/admin/tours/:tourId/reorder-steps
   */
  @Post('admin/tours/:tourId/reorder-steps')
  @Roles(UserRole.ADMIN)
  async reorderSteps(
    @Param('tourId') tourId: string,
    @Body() body: { stepIds: string[] },
  ): Promise<{ success: boolean }> {
    await this.onboardingService.reorderSteps(tourId, body.stepIds);
    return { success: true };
  }
}
