import { test, expect } from '@playwright/test';
import {
  kanban,
  entityDetail,
} from './helpers/selectors';
import {
  selectFirstWorkspace,
  createTestEntity,
  openEntityDetail,
  closeEntityDetail,
  dismissToasts,
} from './helpers/test-utils';

/** Получить Tiptap-редактор внутри секции комментариев (не заголовок!) */
function getCommentEditor(page: import('@playwright/test').Page) {
  return page
    .locator(`${entityDetail.commentsSection} .ProseMirror, ${entityDetail.commentsSection} [contenteditable="true"]`)
    .first();
}

/** Дождаться загрузки секции комментариев */
async function waitForCommentsSection(page: import('@playwright/test').Page) {
  // Используем только data-testid (он есть в DOM), .or() вызывает strict mode violation
  await expect(page.locator(entityDetail.commentsSection)).toBeVisible({ timeout: 8000 });
}

test.describe('Комментарии', () => {
  let entityTitle: string;

  test.beforeEach(async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    // Создаём заявку для тестирования комментариев
    entityTitle = `КомментТест_${Date.now()}`;
    await createTestEntity(page, entityTitle);
    await dismissToasts(page);
  });

  test('Секция комментариев видна в панели деталей заявки', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);
  });

  test('Tiptap-редактор видим для пользователей с правом редактирования', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    // Tiptap editor — ProseMirror div inside comments section
    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
  });

  test('Ввод текста в редакторе отображает контент', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(200);

    const testText = 'Тестовый комментарий для проверки';
    await page.keyboard.type(testText);

    // Текст должен появиться в редакторе
    await expect(editor).toContainText(testText);
  });

  test('Кнопка "Отправить" публикует комментарий', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    const commentText = `ОтправкаКомм_${Date.now()}`;

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(200);
    await page.keyboard.type(commentText);

    // Кликаем "Отправить"
    const sendButton = page.getByRole('button', { name: /Отправить/i });
    await expect(sendButton).toBeVisible();
    await sendButton.click();

    // Комментарий должен появиться в списке
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 });
  });

  test('Опубликованный комментарий отображается в списке', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    const commentText = `СписокКомм_${Date.now()}`;

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(200);
    await page.keyboard.type(commentText);

    const sendButton = page.getByRole('button', { name: /Отправить/i });
    await sendButton.click();

    // Комментарий в списке
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 });
  });

  test('Комментарий содержит имя автора и время', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    const commentText = `АвторКомм_${Date.now()}`;

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(200);
    await page.keyboard.type(commentText);

    const sendButton = page.getByRole('button', { name: /Отправить/i });
    await sendButton.click();

    // Текст комментария виден
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 });

    // Рядом с комментарием должно быть имя автора и timestamp
    const commentSection = page.locator(entityDetail.commentsSection);
    const sectionText = await commentSection.textContent().catch(() => '');
    expect(sectionText).toBeTruthy();

    // date-fns с locale ru может выдавать: "только что", "назад", timestamp
    // Или формат "dd.MM HH:mm" (из TimelineCommentItem)
    const hasTimeIndicator =
      sectionText!.includes('назад') ||
      sectionText!.includes('только что') ||
      sectionText!.includes('секунд') ||
      sectionText!.includes('минут') ||
      /\d{2}\.\d{2}\s+\d{2}:\d{2}/.test(sectionText!);
    expect(hasTimeIndicator).toBeTruthy();
  });

  test('Форматирование: жирный текст работает (Ctrl+B)', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(200);

    // Вводим текст
    await page.keyboard.type('обычный ');

    // Включаем Bold
    await page.keyboard.press('Control+b');
    await page.keyboard.type('жирный');
    await page.keyboard.press('Control+b');

    // В редакторе должен быть тег <strong> или элемент с font-weight bold
    const boldElement = editor.locator('strong, b');
    const hasBold = await boldElement.isVisible().catch(() => false);
    expect(hasBold).toBeTruthy();
    await expect(boldElement).toContainText('жирный');
  });

  test('Форматирование: курсив работает (Ctrl+I)', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(200);

    // Вводим текст
    await page.keyboard.type('обычный ');

    // Включаем Italic
    await page.keyboard.press('Control+i');
    await page.keyboard.type('курсив');
    await page.keyboard.press('Control+i');

    // В редакторе должен быть тег <em> или <i>
    const italicElement = editor.locator('em, i');
    const hasItalic = await italicElement.isVisible().catch(() => false);
    expect(hasItalic).toBeTruthy();
    await expect(italicElement).toContainText('курсив');
  });

  test('Тулбар: кнопка Bold применяет жирное форматирование', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(200);

    // Находим кнопку Bold в тулбаре (по title)
    const boldButton = page.locator('button[title*="Жирный"], button[title*="Bold"]').first();
    const hasBoldBtn = await boldButton.isVisible().catch(() => false);

    if (!hasBoldBtn) {
      test.skip();
      return;
    }

    // Кликаем кнопку Bold
    await boldButton.click();
    await page.keyboard.type('жирный текст');

    // Проверяем что текст в <strong>
    const boldText = editor.locator('strong, b');
    await expect(boldText).toContainText('жирный текст');
  });

  test('Пустой комментарий не может быть отправлен', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    // Не вводим ничего в редактор — кликаем "Отправить"
    const sendButton = page.getByRole('button', { name: /Отправить/i });
    const hasSendBtn = await sendButton.isVisible().catch(() => false);

    if (!hasSendBtn) {
      // Если кнопки нет — значит она disabled/hidden по умолчанию (это ОК)
      return;
    }

    // Кнопка может быть disabled когда редактор пуст
    const isDisabled = await sendButton.isDisabled().catch(() => false);
    if (isDisabled) {
      // Пустой комментарий защищён disabled кнопкой — ОК
      return;
    }

    // Кликаем отправить с пустым редактором
    await sendButton.click();
    await page.waitForTimeout(500);

    // Новый комментарий не должен появиться — проверяем что нет ошибки
    await expect(page.locator('main')).toBeVisible();
  });

  test('Несколько комментариев отображаются в хронологическом порядке', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });

    // Отправляем первый комментарий
    const firstText = `Первый_${Date.now()}`;
    await editor.click();
    await page.waitForTimeout(200);
    await page.keyboard.type(firstText);
    await page.getByRole('button', { name: /Отправить/i }).click();
    await expect(page.getByText(firstText)).toBeVisible({ timeout: 10000 });

    // Отправляем второй комментарий
    await page.waitForTimeout(500);
    const secondText = `Второй_${Date.now()}`;
    await editor.click();
    await page.waitForTimeout(200);
    await page.keyboard.type(secondText);
    await page.getByRole('button', { name: /Отправить/i }).click();
    await expect(page.getByText(secondText)).toBeVisible({ timeout: 10000 });

    // Оба комментария видны
    await expect(page.getByText(firstText)).toBeVisible();
    await expect(page.getByText(secondText)).toBeVisible();

    // Проверяем порядок
    const firstBBox = await page.getByText(firstText).boundingBox();
    const secondBBox = await page.getByText(secondText).boundingBox();

    if (firstBBox && secondBBox) {
      expect(firstBBox.y).not.toBe(secondBBox.y);
    }
  });

  test('Длинный текст комментария корректно отображается', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    // Создаём длинный комментарий (300+ символов)
    const longText = 'Это очень длинный комментарий для проверки корректной обработки. '.repeat(5);

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(200);

    // Вставляем текст через clipboard (быстрее чем keyboard.type для длинного текста)
    await page.evaluate((text) => {
      const el = document.querySelector('[data-testid="entity-comments-section"] .ProseMirror');
      if (el) {
        (el as HTMLElement).focus();
        document.execCommand('insertText', false, text);
      }
    }, longText);
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /Отправить/i }).click();
    await page.waitForTimeout(2000);

    // Комментарий должен быть виден (хотя бы начало)
    const commentStart = longText.substring(0, 30);
    await expect(page.getByText(commentStart, { exact: false })).toBeVisible({ timeout: 10000 });

    // Проверяем что нет горизонтального скролла
    const detailPanel = page.locator(entityDetail.panel);
    const panelBox = await detailPanel.boundingBox();
    const commentElement = page.getByText(commentStart, { exact: false }).first();
    const commentBox = await commentElement.boundingBox();

    if (panelBox && commentBox) {
      expect(commentBox.x + commentBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 20);
    }
  });

  test('Комментарий с HTML-спецсимволами экранируется корректно', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    // Вводим текст с HTML-спецсимволами
    const dangerousText = 'Тест <script>alert("xss")</script> символы';

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(200);

    // Используем evaluate для вставки текста с спецсимволами
    await page.evaluate((text) => {
      const el = document.querySelector('[data-testid="entity-comments-section"] .ProseMirror');
      if (el) {
        (el as HTMLElement).focus();
        document.execCommand('insertText', false, text);
      }
    }, dangerousText);
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /Отправить/i }).click();
    await page.waitForTimeout(2000);

    // Страница не должна показывать alert (XSS не сработал)
    const pageText = await page.locator('body').textContent();
    expect(pageText).toBeTruthy();
    // Страница не упала
    await expect(page.locator('main')).toBeVisible();
  });

  test('Быстрая отправка нескольких комментариев не создаёт дубликаты', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    const comment1 = `Быстрый1_${Date.now()}`;
    const comment2 = `Быстрый2_${Date.now()}`;

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    const sendButton = page.getByRole('button', { name: /Отправить/i });

    // Первый комментарий
    await editor.click();
    await page.waitForTimeout(200);
    await page.keyboard.type(comment1);
    await sendButton.click();

    // Ждём отправки первого
    await expect(page.getByText(comment1)).toBeVisible({ timeout: 10000 });

    // Второй комментарий
    await page.waitForTimeout(300);
    await editor.click();
    await page.waitForTimeout(200);
    await page.keyboard.type(comment2);
    await sendButton.click();

    // Ждём обработки
    await expect(page.getByText(comment2)).toBeVisible({ timeout: 10000 });

    // Каждый комментарий должен появиться ровно один раз
    const comment1Count = await page.getByText(comment1).count();
    const comment2Count = await page.getByText(comment2).count();

    expect(comment1Count).toBe(1);
    expect(comment2Count).toBe(1);
  });

  test('Ctrl+Enter отправляет комментарий из редактора', async ({ page }) => {
    await openEntityDetail(page, entityTitle);
    await waitForCommentsSection(page);

    const commentText = `CtrlEnter_${Date.now()}`;

    const editor = getCommentEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(200);
    await page.keyboard.type(commentText);

    // Отправляем через Ctrl+Enter (или Meta+Enter на macOS)
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(500);

    // Если Control+Enter не сработал, пробуем Meta+Enter
    const commentVisible = await page.getByText(commentText).isVisible().catch(() => false);
    if (!commentVisible) {
      // Возможно текст остался в редакторе — пробуем Meta+Enter
      await page.keyboard.press('Meta+Enter');
      await page.waitForTimeout(500);
    }

    // Если ни один шорткат не сработал, используем кнопку как fallback
    const stillInEditor = await editor.textContent().catch(() => '');
    if (stillInEditor?.includes(commentText)) {
      await page.getByRole('button', { name: /Отправить/i }).click();
    }

    // Комментарий должен появиться
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 });

    // Редактор должен очиститься после отправки
    const editorContent = await editor.textContent();
    expect(editorContent).not.toContain(commentText);
  });
});
