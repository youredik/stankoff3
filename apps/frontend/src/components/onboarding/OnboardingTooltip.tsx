'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { TooltipPosition } from '@/lib/api/onboarding';

interface TooltipStyle {
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  transform?: string;
}

/**
 * Вычисляет позицию tooltip относительно элемента
 */
function calculatePosition(
  targetRect: DOMRect,
  tooltipRect: DOMRect,
  position: TooltipPosition,
  padding = 12,
): TooltipStyle {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let style: TooltipStyle = {};

  // Автоматический выбор позиции если указано 'auto'
  let actualPosition = position;
  if (position === TooltipPosition.AUTO) {
    const spaceAbove = targetRect.top;
    const spaceBelow = viewportHeight - targetRect.bottom;
    const spaceLeft = targetRect.left;
    const spaceRight = viewportWidth - targetRect.right;

    if (spaceBelow >= tooltipRect.height + padding) {
      actualPosition = TooltipPosition.BOTTOM;
    } else if (spaceAbove >= tooltipRect.height + padding) {
      actualPosition = TooltipPosition.TOP;
    } else if (spaceRight >= tooltipRect.width + padding) {
      actualPosition = TooltipPosition.RIGHT;
    } else {
      actualPosition = TooltipPosition.LEFT;
    }
  }

  switch (actualPosition) {
    case TooltipPosition.TOP:
      style = {
        left: targetRect.left + targetRect.width / 2,
        bottom: viewportHeight - targetRect.top + padding,
        transform: 'translateX(-50%)',
      };
      break;
    case TooltipPosition.BOTTOM:
      style = {
        left: targetRect.left + targetRect.width / 2,
        top: targetRect.bottom + padding,
        transform: 'translateX(-50%)',
      };
      break;
    case TooltipPosition.LEFT:
      style = {
        right: viewportWidth - targetRect.left + padding,
        top: targetRect.top + targetRect.height / 2,
        transform: 'translateY(-50%)',
      };
      break;
    case TooltipPosition.RIGHT:
      style = {
        left: targetRect.right + padding,
        top: targetRect.top + targetRect.height / 2,
        transform: 'translateY(-50%)',
      };
      break;
  }

  return style;
}

/**
 * Компонент Tooltip для онбординга
 */
export function OnboardingTooltip() {
  const {
    isVisible,
    currentStep,
    currentStepIndex,
    activeTour,
    nextStep,
    prevStep,
    skipStep,
    skipTour,
    closeTour,
  } = useOnboardingStore();

  const [tooltipStyle, setTooltipStyle] = useState<TooltipStyle>({});
  const [targetElement, setTargetElement] = useState<Element | null>(null);
  const [tooltipRef, setTooltipRef] = useState<HTMLDivElement | null>(null);

  // Найти целевой элемент
  useEffect(() => {
    if (!currentStep?.targetSelector) {
      setTargetElement(null);
      return;
    }

    const findElement = () => {
      const element = document.querySelector(currentStep.targetSelector!);
      setTargetElement(element);
    };

    // Задержка перед показом
    const timer = setTimeout(findElement, currentStep.delay || 0);
    return () => clearTimeout(timer);
  }, [currentStep]);

  // Вычислить позицию tooltip
  const updatePosition = useCallback(() => {
    if (!targetElement || !tooltipRef) {
      // Если нет целевого элемента, показываем по центру
      setTooltipStyle({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }

    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltipRef.getBoundingClientRect();
    const position = currentStep?.tooltipPosition || TooltipPosition.AUTO;

    setTooltipStyle(calculatePosition(targetRect, tooltipRect, position));
  }, [targetElement, tooltipRef, currentStep]);

  // Обновляем позицию при изменении target или размера окна
  useEffect(() => {
    if (!isVisible) return;

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isVisible, updatePosition]);

  // Подсветка целевого элемента
  useEffect(() => {
    if (!targetElement || !isVisible) return;

    targetElement.classList.add('onboarding-highlight');
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    return () => {
      targetElement.classList.remove('onboarding-highlight');
    };
  }, [targetElement, isVisible]);

  if (!isVisible || !currentStep || !activeTour) {
    return null;
  }

  const activeSteps = activeTour.steps.filter((s) => s.isActive);
  const totalSteps = activeSteps.length;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  const tooltipContent = (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={closeTour}
      />

      {/* Spotlight for target element */}
      {targetElement && (
        <div
          className="fixed z-[9999] rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] pointer-events-none"
          style={{
            top: targetElement.getBoundingClientRect().top - 4,
            left: targetElement.getBoundingClientRect().left - 4,
            width: targetElement.getBoundingClientRect().width + 8,
            height: targetElement.getBoundingClientRect().height + 8,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={setTooltipRef}
        className="fixed z-[10000] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-w-md w-full p-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
        style={tooltipStyle}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {currentStep.title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Шаг {currentStepIndex + 1} из {totalSteps}
            </p>
          </div>
          <button
            onClick={closeTour}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
            title="Закрыть"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div
          className="text-sm text-gray-600 dark:text-gray-300 mb-4"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentStep.content) }}
        />

        {/* Progress bar */}
        <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-teal-500 transition-all duration-300"
            style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={prevStep}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <ChevronLeft className="w-4 h-4" />
                Назад
              </button>
            )}
            {currentStep.skippable && (
              <button
                onClick={skipStep}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <SkipForward className="w-4 h-4" />
                Пропустить
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={skipTour}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Пропустить всё
            </button>
            <button
              onClick={nextStep}
              className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-white bg-teal-500 hover:bg-teal-600 rounded"
            >
              {isLastStep ? 'Завершить' : 'Далее'}
              {!isLastStep && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // Render in portal
  if (typeof window === 'undefined') return null;

  return createPortal(tooltipContent, document.body);
}
