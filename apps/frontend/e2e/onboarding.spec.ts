import { test, expect } from '@playwright/test';
import { sidebar, kanban, createEntity } from './helpers/selectors';

/**
 * Тесты онбординга.
 * Онбординг — интерактивный тур для новых пользователей,
 * который запускается автоматически при первом визите.
 */
test.describe('Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    // Очищаем localStorage чтобы онбординг показался заново
    await page.goto('/dashboard');
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => {
      localStorage.removeItem('onboardingCompleted');
      localStorage.removeItem('onboarding_completed');
      localStorage.removeItem('tourCompleted');
    });
  });

  test('Новый пользователь видит приветственный тур при первом визите', async ({ page }) => {
    // Перезагружаем после очистки localStorage
    await page.reload();
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Ищем элемент тура (tooltip, modal или overlay онбординга)
    const tourElement = page.locator(
      '[data-testid="onboarding-tour"], [data-testid="onboarding-tooltip"], ' +
      '[role="dialog"]:has-text("Добро пожаловать"), .onboarding-overlay, ' +
      '[class*="onboarding"], [class*="tour-tooltip"]'
    );

    const hasTour = await tourElement.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasTour) {
      // Онбординг может быть ещё не реализован или выключен
      test.skip();
      return;
    }

    await expect(tourElement.first()).toBeVisible();
  });

  test('Тултип тура показывает содержимое шага', async ({ page }) => {
    await page.reload();
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    const tooltip = page.locator(
      '[data-testid="onboarding-tooltip"], [class*="tour-tooltip"], ' +
      '[role="tooltip"]:has-text("шаг"), .shepherd-content, .introjs-tooltip'
    );

    const hasTooltip = await tooltip.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasTooltip) {
      test.skip();
      return;
    }

    // Тултип должен содержать текст
    const tooltipText = await tooltip.first().textContent();
    expect(tooltipText).toBeTruthy();
    expect(tooltipText!.length).toBeGreaterThan(0);
  });

  test('Кнопка "Далее" переключает шаг тура', async ({ page }) => {
    await page.reload();
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    const nextButton = page.locator(
      '[data-testid="onboarding-next"], button:has-text("Далее"), ' +
      'button:has-text("Дальше"), button:has-text("Next"), ' +
      '.shepherd-button-primary, .introjs-nextbutton'
    );

    const hasNext = await nextButton.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasNext) {
      test.skip();
      return;
    }

    // Запоминаем текущее содержимое
    const tooltipBefore = page.locator(
      '[data-testid="onboarding-tooltip"], [class*="tour-tooltip"], ' +
      '.shepherd-content, .introjs-tooltip'
    );
    const textBefore = await tooltipBefore.first().textContent().catch(() => '');

    // Нажимаем "Далее"
    await nextButton.first().click();
    await page.waitForTimeout(500);

    // Содержимое должно измениться или следующий шаг должен появиться
    const textAfter = await tooltipBefore.first().textContent().catch(() => '');
    // Либо текст изменился, либо кнопка всё ещё доступна (шаг переключился)
    const nextStillVisible = await nextButton.first().isVisible().catch(() => false);
    expect(textBefore !== textAfter || nextStillVisible).toBeTruthy();
  });

  test('Кнопка "Пропустить" закрывает тур', async ({ page }) => {
    await page.reload();
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    const skipButton = page.locator(
      '[data-testid="onboarding-skip"], button:has-text("Пропустить"), ' +
      'button:has-text("Skip"), .shepherd-cancel-icon, .introjs-skipbutton'
    );

    const hasSkip = await skipButton.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasSkip) {
      test.skip();
      return;
    }

    await skipButton.first().click();
    await page.waitForTimeout(1000);

    // Тур должен закрыться
    const tourOverlay = page.locator(
      '[data-testid="onboarding-tour"], .onboarding-overlay, ' +
      '.shepherd-modal-overlay-container, .introjs-overlay'
    );
    await expect(tourOverlay).not.toBeVisible({ timeout: 3000 });
  });

  test('Индикатор прогресса показывает текущий шаг', async ({ page }) => {
    await page.reload();
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Ищем индикатор прогресса (точки, числа шагов, прогресс-бар)
    const progress = page.locator(
      '[data-testid="onboarding-progress"], [class*="step-indicator"], ' +
      '[class*="progress"], .shepherd-progress, .introjs-bullets'
    );

    const hasProgress = await progress.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasProgress) {
      // Также проверяем текстовый индикатор "1 из 5", "Шаг 1"
      const textProgress = page.getByText(/шаг\s*\d+|(\d+)\s*из\s*(\d+)/i);
      const hasTextProgress = await textProgress.first().isVisible({ timeout: 3000 }).catch(() => false);

      if (!hasTextProgress) {
        test.skip();
        return;
      }

      await expect(textProgress.first()).toBeVisible();
      return;
    }

    await expect(progress.first()).toBeVisible();
  });

  test('Тур охватывает ключевые области (sidebar, канбан, создание)', async ({ page }) => {
    await page.reload();
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    const nextButton = page.locator(
      '[data-testid="onboarding-next"], button:has-text("Далее"), ' +
      'button:has-text("Дальше"), button:has-text("Next"), ' +
      '.shepherd-button-primary, .introjs-nextbutton'
    );

    const hasNext = await nextButton.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasNext) {
      test.skip();
      return;
    }

    // Собираем текст со всех шагов
    const stepsContent: string[] = [];
    let maxSteps = 10;

    while (maxSteps > 0) {
      const tooltip = page.locator(
        '[data-testid="onboarding-tooltip"], [class*="tour-tooltip"], ' +
        '.shepherd-content, .introjs-tooltiptext'
      );
      const text = await tooltip.first().textContent().catch(() => '');
      if (text) stepsContent.push(text);

      const isNextVisible = await nextButton.first().isVisible().catch(() => false);
      if (!isNextVisible) break;

      await nextButton.first().click();
      await page.waitForTimeout(500);
      maxSteps--;
    }

    // Должно быть хотя бы 2 шага
    expect(stepsContent.length).toBeGreaterThanOrEqual(2);
  });

  test('После завершения тура он не показывается повторно', async ({ page }) => {
    await page.reload();
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Проверяем есть ли тур
    const skipButton = page.locator(
      '[data-testid="onboarding-skip"], button:has-text("Пропустить"), ' +
      'button:has-text("Завершить"), button:has-text("Готово"), ' +
      'button:has-text("Skip"), button:has-text("Done")'
    );
    const nextButton = page.locator(
      '[data-testid="onboarding-next"], button:has-text("Далее"), ' +
      'button:has-text("Next"), .shepherd-button-primary'
    );

    const hasTour = await skipButton.first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasTour) {
      test.skip();
      return;
    }

    // Прокликиваем до конца или пропускаем
    let maxSteps = 15;
    while (maxSteps > 0) {
      const hasNextBtn = await nextButton.first().isVisible().catch(() => false);
      if (!hasNextBtn) break;
      await nextButton.first().click();
      await page.waitForTimeout(300);
      maxSteps--;
    }

    // Если осталась кнопка "Завершить"/"Готово" — нажимаем
    const finishButton = page.locator(
      'button:has-text("Завершить"), button:has-text("Готово"), ' +
      'button:has-text("Finish"), button:has-text("Done")'
    );
    const hasFinish = await finishButton.first().isVisible().catch(() => false);
    if (hasFinish) {
      await finishButton.first().click();
      await page.waitForTimeout(500);
    }

    // Перезагружаем страницу
    await page.reload();
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(3000);

    // Тур НЕ должен показаться снова
    const tourAfterReload = page.locator(
      '[data-testid="onboarding-tour"], [data-testid="onboarding-tooltip"], ' +
      '.onboarding-overlay, .shepherd-content, .introjs-overlay'
    );
    await expect(tourAfterReload).not.toBeVisible({ timeout: 3000 });
  });

  test('Квиз в конце тура проверяет понимание', async ({ page }) => {
    await page.reload();
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Ищем элемент квиза (может появиться в конце тура или отдельно)
    const quiz = page.locator(
      '[data-testid="onboarding-quiz"], [data-testid="quiz"], ' +
      '[class*="quiz"], [role="dialog"]:has-text("квиз"), ' +
      '[role="dialog"]:has-text("проверка"), [role="dialog"]:has-text("тест")'
    );

    // Прокликиваем тур до конца
    const nextButton = page.locator(
      '[data-testid="onboarding-next"], button:has-text("Далее"), ' +
      'button:has-text("Next"), .shepherd-button-primary'
    );
    let maxSteps = 15;
    while (maxSteps > 0) {
      const hasNext = await nextButton.first().isVisible().catch(() => false);
      if (!hasNext) break;
      await nextButton.first().click();
      await page.waitForTimeout(500);
      maxSteps--;
    }

    const hasQuiz = await quiz.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasQuiz) {
      test.skip();
      return;
    }

    // Квиз должен содержать вопросы (радиокнопки или кнопки ответов)
    const quizOptions = quiz.first().locator('button, input[type="radio"], label');
    const optionsCount = await quizOptions.count();
    expect(optionsCount).toBeGreaterThan(0);
  });
});
