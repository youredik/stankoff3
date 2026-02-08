'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { OnboardingTooltip } from './OnboardingTooltip';

interface OnboardingProviderProps {
  children: React.ReactNode;
}

/**
 * Провайдер онбординга
 *
 * Отслеживает авторизацию и автоматически запускает туры при первом входе
 */
export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
  const {
    loadStatus,
    checkAutoStart,
    currentStep,
    isVisible,
    closeTour,
  } = useOnboardingStore();

  const [hasCheckedAutoStart, setHasCheckedAutoStart] = useState(false);

  // Загружаем статус онбординга при авторизации
  useEffect(() => {
    if (isAuthenticated && user) {
      loadStatus();
    }
  }, [isAuthenticated, user, loadStatus]);

  // Проверяем автостарт туры только один раз после авторизации
  useEffect(() => {
    if (isAuthenticated && user && !hasCheckedAutoStart) {
      // Небольшая задержка для загрузки страницы
      const timer = setTimeout(() => {
        checkAutoStart();
        setHasCheckedAutoStart(true);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, user, hasCheckedAutoStart, checkAutoStart]);

  // Закрываем тур при смене страницы, если текущий шаг не для этой страницы
  useEffect(() => {
    if (!currentStep || !isVisible) return;

    if (currentStep.route) {
      // Проверяем соответствие маршрута
      const routePattern = currentStep.route.replace(/\*/g, '.*');
      const regex = new RegExp(`^${routePattern}$`);

      if (!regex.test(pathname)) {
        closeTour();
      }
    }
  }, [pathname, currentStep, isVisible, closeTour]);

  return (
    <>
      {children}
      <OnboardingTooltip />

      {/* Глобальные стили для подсветки элементов */}
      <style jsx global>{`
        .onboarding-highlight {
          position: relative;
          z-index: 9999;
          box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.4);
          border-radius: 8px;
        }

        @keyframes onboarding-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.4);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(20, 184, 166, 0.2);
          }
        }

        .onboarding-highlight {
          animation: onboarding-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
