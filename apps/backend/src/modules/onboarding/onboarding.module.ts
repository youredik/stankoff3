import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingTour } from './entities/onboarding-tour.entity';
import { OnboardingStep } from './entities/onboarding-step.entity';
import { OnboardingProgress } from './entities/onboarding-progress.entity';
import { OnboardingQuiz } from './entities/onboarding-quiz.entity';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OnboardingTour,
      OnboardingStep,
      OnboardingProgress,
      OnboardingQuiz,
    ]),
  ],
  providers: [OnboardingService],
  controllers: [OnboardingController],
  exports: [OnboardingService],
})
export class OnboardingModule {}
