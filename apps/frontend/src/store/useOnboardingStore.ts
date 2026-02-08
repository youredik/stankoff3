'use client';

import { create } from 'zustand';
import {
  OnboardingTour,
  OnboardingStep,
  OnboardingProgress,
  UserOnboardingStatus,
  ProgressStatus,
  getOnboardingStatus,
  getAutoStartTours,
  getTourByCode,
  startTour as apiStartTour,
  completeStep as apiCompleteStep,
  skipTour as apiSkipTour,
} from '@/lib/api/onboarding';

interface OnboardingState {
  // Status
  status: UserOnboardingStatus | null;
  isLoading: boolean;
  error: string | null;

  // Current tour state
  activeTour: OnboardingTour | null;
  progress: OnboardingProgress | null;
  currentStep: OnboardingStep | null;
  currentStepIndex: number;

  // UI state
  isVisible: boolean;
  highlightedElement: Element | null;

  // Actions
  loadStatus: () => Promise<void>;
  checkAutoStart: () => Promise<void>;
  startTourByCode: (code: string) => Promise<void>;
  startTour: (tourId: string) => Promise<void>;
  nextStep: () => Promise<void>;
  prevStep: () => void;
  skipStep: () => Promise<void>;
  skipTour: () => Promise<void>;
  closeTour: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  // Initial state
  status: null,
  isLoading: false,
  error: null,
  activeTour: null,
  progress: null,
  currentStep: null,
  currentStepIndex: 0,
  isVisible: false,
  highlightedElement: null,

  /**
   * Загрузить статус онбординга
   */
  loadStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await getOnboardingStatus();
      set({ status, isLoading: false });
    } catch (err) {
      console.error('Failed to load onboarding status:', err);
      set({ error: 'Не удалось загрузить статус онбординга', isLoading: false });
    }
  },

  /**
   * Проверить и запустить автостартовые туры
   */
  checkAutoStart: async () => {
    const { activeTour } = get();
    if (activeTour) return; // Уже есть активный тур

    try {
      const tours = await getAutoStartTours();
      if (tours.length > 0) {
        // Запускаем первый тур из списка
        const tour = tours[0];
        const progress = await apiStartTour(tour.id);
        const activeSteps = tour.steps.filter((s) => s.isActive);

        set({
          activeTour: tour,
          progress,
          currentStep: activeSteps[0] || null,
          currentStepIndex: 0,
          isVisible: true,
        });
      }
    } catch (err) {
      console.error('Failed to check auto-start tours:', err);
    }
  },

  /**
   * Начать тур по коду
   */
  startTourByCode: async (code: string) => {
    set({ isLoading: true, error: null });
    try {
      const tour = await getTourByCode(code);
      const progress = await apiStartTour(tour.id);
      const activeSteps = tour.steps.filter((s) => s.isActive);

      set({
        activeTour: tour,
        progress,
        currentStep: activeSteps[0] || null,
        currentStepIndex: 0,
        isVisible: true,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to start tour:', err);
      set({ error: 'Не удалось начать тур', isLoading: false });
    }
  },

  /**
   * Начать тур по ID
   */
  startTour: async (tourId: string) => {
    const { status } = get();
    const tourInfo =
      status?.requiredTours.find((t) => t.id === tourId) ||
      status?.optionalTours.find((t) => t.id === tourId);

    if (!tourInfo) {
      set({ error: 'Тур не найден' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const tour = await getTourByCode(tourInfo.code);
      const progress = await apiStartTour(tour.id);
      const activeSteps = tour.steps.filter((s) => s.isActive);

      set({
        activeTour: tour,
        progress,
        currentStep: activeSteps[0] || null,
        currentStepIndex: 0,
        isVisible: true,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to start tour:', err);
      set({ error: 'Не удалось начать тур', isLoading: false });
    }
  },

  /**
   * Перейти к следующему шагу
   */
  nextStep: async () => {
    const { activeTour, currentStep, currentStepIndex, progress } = get();
    if (!activeTour || !currentStep || !progress) return;

    try {
      const newProgress = await apiCompleteStep(activeTour.id, currentStep.id, false);
      const activeSteps = activeTour.steps.filter((s) => s.isActive);
      const nextIndex = currentStepIndex + 1;

      if (nextIndex >= activeSteps.length) {
        // Тур завершён
        set({
          progress: newProgress,
          currentStep: null,
          isVisible: false,
        });
        // Обновляем общий статус
        get().loadStatus();
      } else {
        set({
          progress: newProgress,
          currentStep: activeSteps[nextIndex],
          currentStepIndex: nextIndex,
        });
      }
    } catch (err) {
      console.error('Failed to complete step:', err);
    }
  },

  /**
   * Вернуться к предыдущему шагу (только UI)
   */
  prevStep: () => {
    const { activeTour, currentStepIndex } = get();
    if (!activeTour || currentStepIndex <= 0) return;

    const activeSteps = activeTour.steps.filter((s) => s.isActive);
    const prevIndex = currentStepIndex - 1;

    set({
      currentStep: activeSteps[prevIndex],
      currentStepIndex: prevIndex,
    });
  },

  /**
   * Пропустить текущий шаг
   */
  skipStep: async () => {
    const { activeTour, currentStep, currentStepIndex, progress } = get();
    if (!activeTour || !currentStep || !progress) return;

    try {
      const newProgress = await apiCompleteStep(activeTour.id, currentStep.id, true);
      const activeSteps = activeTour.steps.filter((s) => s.isActive);
      const nextIndex = currentStepIndex + 1;

      if (nextIndex >= activeSteps.length) {
        // Тур завершён
        set({
          progress: newProgress,
          currentStep: null,
          isVisible: false,
        });
        get().loadStatus();
      } else {
        set({
          progress: newProgress,
          currentStep: activeSteps[nextIndex],
          currentStepIndex: nextIndex,
        });
      }
    } catch (err) {
      console.error('Failed to skip step:', err);
    }
  },

  /**
   * Пропустить весь тур
   */
  skipTour: async () => {
    const { activeTour } = get();
    if (!activeTour) return;

    try {
      await apiSkipTour(activeTour.id);
      set({
        activeTour: null,
        progress: null,
        currentStep: null,
        currentStepIndex: 0,
        isVisible: false,
      });
      get().loadStatus();
    } catch (err) {
      console.error('Failed to skip tour:', err);
    }
  },

  /**
   * Закрыть тур (без сохранения)
   */
  closeTour: () => {
    set({
      isVisible: false,
    });
  },

  /**
   * Сбросить состояние
   */
  reset: () => {
    set({
      status: null,
      isLoading: false,
      error: null,
      activeTour: null,
      progress: null,
      currentStep: null,
      currentStepIndex: 0,
      isVisible: false,
      highlightedElement: null,
    });
  },
}));
