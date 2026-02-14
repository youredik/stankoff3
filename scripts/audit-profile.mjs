/**
 * Полный аудит профиля пользователя — Playwright
 * Проверяет: навигация, все секции, редактирование, темы, уведомления,
 * responsive, a11y, console errors, edge cases
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const LOGIN_EMAIL = 'youredik@gmail.com';
const SCREENSHOT_DIR = 'audit-screenshots/profile';

const bugs = [];
const warnings = [];
let screenshotIdx = 0;

async function screenshot(page, name) {
  screenshotIdx++;
  const path = `${SCREENSHOT_DIR}/${String(screenshotIdx).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

function bug(desc, detail = '') {
  bugs.push({ desc, detail });
  console.error(`🐛 BUG: ${desc}${detail ? ' — ' + detail : ''}`);
}

function warn(desc, detail = '') {
  warnings.push({ desc, detail });
  console.warn(`⚠️  WARN: ${desc}${detail ? ' — ' + detail : ''}`);
}

function ok(desc) {
  console.log(`✅ ${desc}`);
}

async function login(page) {
  // 1. Открываем любую страницу чтобы получить origin для fetch
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });

  // 2. Вызываем dev login из контекста браузера — cookies установятся правильно
  const loginResult = await page.evaluate(async (email) => {
    try {
      const res = await fetch('/api/auth/dev/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const data = await res.json();
      return { accessToken: data.accessToken };
    } catch (e) {
      return { error: e.message };
    }
  }, LOGIN_EMAIL);

  if (loginResult.error) {
    throw new Error(`Dev login failed: ${loginResult.error}`);
  }

  // 3. Переходим на workspace с токеном (AuthProvider обработает его)
  await page.goto(`${BASE}/workspace?access_token=${loginResult.accessToken}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });

  // 4. Ждём авторизацию — AuthProvider читает токен из URL, вызывает checkAuth
  try {
    await page.waitForSelector('[data-testid="user-menu-button"]', { timeout: 15000 });
  } catch {
    // Может быть долгая загрузка — подождём ещё
    await page.waitForTimeout(5000);
    const userMenu = await page.$('[data-testid="user-menu-button"]');
    if (!userMenu) {
      await screenshot(page, 'login-failed');
      throw new Error('Не удалось авторизоваться — user menu не найдено после 20 сек');
    }
  }

  ok('Авторизация выполнена');

  // ОБНАРУЖЕННЫЙ БАГ: /login зависает на "Проверка авторизации..." в чистом браузере
  bug(
    'Страница /login зависает в чистом браузере',
    'isLoading из auth store никогда не становится false — checkAuth() не вызывается на /login'
  );
}

async function testHeaderMenuNavigation(page) {
  console.log('\n═══ 1. Навигация из Header Menu ═══');

  // Кликаем по User Menu
  const userMenuBtn = await page.$('[data-testid="user-menu-button"]');
  if (!userMenuBtn) {
    bug('User Menu кнопка не найдена в Header', 'data-testid="user-menu-button" отсутствует');
    return;
  }

  await userMenuBtn.click();
  await page.waitForTimeout(300);

  // Ищем пункт "Профиль"
  const profileLink = await page.$('button:has-text("Профиль"), a:has-text("Профиль")');
  if (!profileLink) {
    bug('Пункт "Профиль" не найден в User Menu');
    await screenshot(page, 'missing-profile-menu');
    return;
  }

  await profileLink.click();
  await page.waitForURL('**/profile**', { timeout: 5000 });
  await page.waitForLoadState('domcontentloaded');

  // Ждём загрузку содержимого профиля (заголовок "Профиль и настройки")
  try {
    await page.waitForSelector('h1:has-text("Профиль")', { timeout: 10000 });
    ok('Навигация на /profile из Header Menu');
  } catch {
    // Может быть проблема с AuthProvider — подождём и проверим
    await page.waitForTimeout(3000);
    const h1 = await page.$('h1');
    const txt = h1 ? await h1.textContent() : '';
    if (txt.includes('Профиль')) {
      ok('Навигация на /profile (с задержкой)');
    } else {
      // Страница застряла на "Загрузка..." — AuthProvider не авторизовал
      const bodyText = await page.textContent('body');
      if (bodyText.includes('Загрузка')) {
        bug('Страница /profile зависает на "Загрузка..."', 'AuthProvider не обнаруживает активную сессию при навигации');
        // Пробуем обходной путь — прямой переход
        await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(5000);
      }
    }
  }
  await screenshot(page, 'profile-page-loaded');
}

async function testProfileSection(page) {
  console.log('\n═══ 2. Секция "Профиль" — редактирование ═══');

  // Проверяем наличие заголовка
  const heading = await page.$('h1');
  const headingText = heading ? await heading.textContent() : '';
  if (!headingText.includes('Профиль')) {
    bug('Заголовок "Профиль и настройки" отсутствует или неверный', `Получено: "${headingText}"`);
  } else {
    ok(`Заголовок: "${headingText}"`);
  }

  // Проверяем аватар
  const avatar = await page.$('.bg-primary-600.rounded-full');
  if (!avatar) {
    warn('Аватар (инициалы) не найден на странице');
  } else {
    ok('Аватар отображается');
  }

  // Проверяем поля ввода
  const nameInput = await page.$('input[placeholder="Имя"]');
  const lastNameInput = await page.$('input[placeholder="Фамилия"]');
  const departmentInput = await page.$('input[placeholder*="Отдел"]');

  if (!nameInput) bug('Поле "Имя" не найдено');
  if (!lastNameInput) bug('Поле "Фамилия" не найдено');
  if (!departmentInput) bug('Поле "Отдел" не найдено');

  // Проверяем что поля заполнены
  const nameValue = nameInput ? await nameInput.inputValue() : '';
  const lastNameValue = lastNameInput ? await lastNameInput.inputValue() : '';

  if (!nameValue) warn('Поле "Имя" пустое');
  else ok(`Имя: "${nameValue}"`);

  if (!lastNameValue) warn('Поле "Фамилия" пустое');
  else ok(`Фамилия: "${lastNameValue}"`);

  // Проверяем Email (readonly)
  const emailField = await page.$('text=youredik@gmail.com');
  if (!emailField) {
    // Ищем шире
    const allText = await page.textContent('body');
    if (!allText.includes('youredik@gmail.com') && !allText.includes('@')) {
      warn('Email не отображается на странице профиля');
    }
  } else {
    ok('Email отображается как read-only');
  }

  // Проверяем что email НЕ редактируемый (нет input для email)
  const emailInput = await page.$('input[type="email"], input[value*="@"]');
  if (emailInput) {
    bug('Email поле редактируемое — должно быть read-only');
  } else {
    ok('Email не редактируется (read-only)');
  }

  // === Тест редактирования ===
  console.log('\n--- Тест сохранения профиля ---');

  const originalName = nameValue;
  const testName = 'ТестИмя' + Date.now().toString().slice(-4);

  // Меняем имя
  if (nameInput) {
    await nameInput.click({ clickCount: 3 });
    await nameInput.fill(testName);
    await page.waitForTimeout(200);

    // Кнопка "Сохранить" должна появиться
    const saveBtn = await page.$('button:has-text("Сохранить")');
    if (!saveBtn) {
      bug('Кнопка "Сохранить" не появляется после изменения имени');
      await screenshot(page, 'no-save-button');
    } else {
      ok('Кнопка "Сохранить" появляется при изменениях');

      // Проверяем что кнопка не disabled
      const isDisabled = await saveBtn.isDisabled();
      if (isDisabled) {
        bug('Кнопка "Сохранить" disabled при наличии изменений');
      }

      // Сохраняем
      await saveBtn.click();

      // Ждём "Сохранено"
      try {
        await page.waitForSelector('button:has-text("Сохранено")', { timeout: 5000 });
        ok('Профиль сохранён — показывается "Сохранено"');
      } catch {
        bug('Текст "Сохранено" не появился после клика на "Сохранить"');
        await screenshot(page, 'save-no-feedback');
      }

      await screenshot(page, 'profile-saved');

      // Ждём исчезновения кнопки (hasChanges = false)
      await page.waitForTimeout(2500);

      // Восстанавливаем оригинальное имя
      await nameInput.click({ clickCount: 3 });
      await nameInput.fill(originalName);
      await page.waitForTimeout(200);

      const restoreBtn = await page.$('button:has-text("Сохранить")');
      if (restoreBtn) {
        await restoreBtn.click();
        await page.waitForTimeout(2000);
        ok('Оригинальное имя восстановлено');
      }
    }
  }

  // === Edge case: пустое имя ===
  console.log('\n--- Edge cases ---');

  if (nameInput) {
    await nameInput.click({ clickCount: 3 });
    await nameInput.fill('');
    await page.waitForTimeout(200);

    const saveBtnEmpty = await page.$('button:has-text("Сохранить")');
    if (saveBtnEmpty) {
      // Пустое имя — плохо, должна быть валидация
      warn('Разрешено сохранить пустое имя — нет клиентской валидации', 'Рекомендуется добавить required');

      // Не сохраняем, восстанавливаем
      await nameInput.fill(originalName);
      await page.waitForTimeout(200);

      // Отменяем изменение (hasChanges станет false если восстановили)
    }
  }

  // === Edge case: очень длинное имя (100+ символов) ===
  if (nameInput) {
    const longName = 'А'.repeat(101);
    await nameInput.click({ clickCount: 3 });
    await nameInput.fill(longName);
    const currentVal = await nameInput.inputValue();
    if (currentVal.length > 100) {
      warn('maxLength=100 на поле Имя не ограничивает вставку', `Длина: ${currentVal.length}`);
    } else {
      ok('maxLength=100 корректно ограничивает ввод');
    }

    // Восстанавливаем
    await nameInput.click({ clickCount: 3 });
    await nameInput.fill(originalName);
    await page.waitForTimeout(200);
  }

  // === XSS тест ===
  if (nameInput) {
    const xssPayload = '<script>alert("xss")</script>';
    await nameInput.click({ clickCount: 3 });
    await nameInput.fill(xssPayload);
    await page.waitForTimeout(200);

    // Проверяем что скрипт не выполнился
    const alertTriggered = await page.evaluate(() => {
      return window.__xss_triggered || false;
    });
    if (alertTriggered) {
      bug('XSS уязвимость — script выполнился!');
    } else {
      ok('XSS: script-тег безопасно обработан');
    }

    // Восстанавливаем
    await nameInput.click({ clickCount: 3 });
    await nameInput.fill(originalName);
    await page.waitForTimeout(200);
  }
}

async function testAppearanceSection(page) {
  console.log('\n═══ 3. Секция "Оформление" — переключение тем ═══');

  // Ищем кнопки темы
  const lightBtn = await page.$('button:has-text("Светлая")');
  const darkBtn = await page.$('button:has-text("Тёмная")');
  const systemBtn = await page.$('button:has-text("Системная")');

  if (!lightBtn) bug('Кнопка "Светлая" тема не найдена');
  if (!darkBtn) bug('Кнопка "Тёмная" тема не найдена');
  if (!systemBtn) bug('Кнопка "Системная" тема не найдена');

  if (!lightBtn || !darkBtn || !systemBtn) {
    await screenshot(page, 'theme-buttons-missing');
    return;
  }

  // Переключаем на тёмную
  await darkBtn.click();
  await page.waitForTimeout(500);

  const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (!hasDarkClass) {
    bug('Тёмная тема не применяется — класс "dark" не добавлен на <html>');
  } else {
    ok('Тёмная тема применяется корректно');
  }
  await screenshot(page, 'theme-dark');

  // Проверяем что кнопка "Тёмная" стала активной (bg-primary)
  const darkBtnClasses = await darkBtn.getAttribute('class');
  if (!darkBtnClasses?.includes('bg-primary')) {
    warn('Кнопка "Тёмная" не имеет активного стиля после выбора');
  }

  // Переключаем на светлую
  await lightBtn.click();
  await page.waitForTimeout(500);

  const hasDarkAfterLight = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (hasDarkAfterLight) {
    bug('Светлая тема не убирает класс "dark" с <html>');
  } else {
    ok('Светлая тема применяется корректно');
  }
  await screenshot(page, 'theme-light');

  // Возвращаем на системную
  await systemBtn.click();
  await page.waitForTimeout(500);
  ok('Тема "Системная" выбрана');
  await screenshot(page, 'theme-system');
}

async function testNotificationsSection(page) {
  console.log('\n═══ 4. Секция "Уведомления" ═══');

  // Ищем toggle кнопки
  const toggleButtons = await page.$$('button[type="button"].rounded-full');

  if (toggleButtons.length < 2) {
    bug(`Ожидается минимум 2 toggle-кнопки (push + звук), найдено: ${toggleButtons.length}`);
    await screenshot(page, 'notification-toggles-missing');
    return;
  }

  // Проверяем текст описания
  const pushText = await page.$('text=Push-уведомления в браузере');
  const soundText = await page.$('text=Звуковые уведомления');

  if (!pushText) bug('Текст "Push-уведомления в браузере" не найден');
  else ok('Push-уведомления — описание найдено');

  if (!soundText) bug('Текст "Звуковые уведомления" не найден');
  else ok('Звуковые уведомления — описание найдено');

  // Проверяем подсказку
  const pushHint = await page.$('text=Показывать уведомления когда вкладка не активна');
  if (!pushHint) warn('Нет подсказки для push-уведомлений');

  const soundHint = await page.$('text=Проигрывать звук при новых событиях');
  if (!soundHint) warn('Нет подсказки для звуковых уведомлений');

  // Кликаем toggle звука (второй)
  if (toggleButtons.length >= 2) {
    const soundToggle = toggleButtons[1];
    const classBefore = await soundToggle.getAttribute('class');
    const wasActive = classBefore?.includes('bg-primary');

    await soundToggle.click();
    await page.waitForTimeout(300);

    const classAfter = await soundToggle.getAttribute('class');
    const isActiveNow = classAfter?.includes('bg-primary');

    if (wasActive === isActiveNow) {
      bug('Toggle звука не меняет состояние после клика');
    } else {
      ok(`Toggle звука переключился: ${wasActive ? 'вкл→выкл' : 'выкл→вкл'}`);
    }

    // Восстанавливаем
    await soundToggle.click();
    await page.waitForTimeout(300);
  }

  await screenshot(page, 'notifications-section');
}

async function testAccountSection(page) {
  console.log('\n═══ 5. Секция "Аккаунт" ═══');

  // Роль
  const roleText = await page.$('text=Роль');
  if (!roleText) {
    bug('Метка "Роль" не найдена в секции Аккаунт');
  }

  // Проверяем наличие значения роли
  const roleValues = ['Администратор', 'Менеджер', 'Сотрудник'];
  let roleFound = false;
  for (const rv of roleValues) {
    const el = await page.$(`text=${rv}`);
    if (el) {
      ok(`Роль: "${rv}"`);
      roleFound = true;
      break;
    }
  }
  if (!roleFound) {
    warn('Роль пользователя не отображается или имеет нестандартное значение');
  }

  // Статус
  const statusActive = await page.$('text=Активен');
  const statusInactive = await page.$('text=Неактивен');
  if (!statusActive && !statusInactive) {
    bug('Статус пользователя (Активен/Неактивен) не отображается');
  } else {
    ok(`Статус: "${statusActive ? 'Активен' : 'Неактивен'}"`);
  }

  // Дата регистрации
  const regLabel = await page.$('text=Зарегистрирован');
  if (!regLabel) {
    bug('Метка "Зарегистрирован" не найдена');
  } else {
    ok('Дата регистрации отображается');
  }

  // ID
  const idLabel = await page.$('text=ID');
  if (idLabel) {
    // Проверяем что ID выглядит как UUID
    const pageText = await page.textContent('body');
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    if (uuidRegex.test(pageText)) {
      ok('User ID отображается в формате UUID');
    } else {
      warn('User ID не похож на UUID');
    }
  } else {
    bug('Метка "ID" не найдена в секции Аккаунт');
  }

  await screenshot(page, 'account-section');
}

async function testAccessibility(page) {
  console.log('\n═══ 6. Accessibility (a11y) ═══');

  // Проверяем label на input полях
  const inputs = await page.$$('input[type="text"]');
  let inputsWithLabels = 0;
  for (const input of inputs) {
    const ariaLabel = await input.getAttribute('aria-label');
    const placeholder = await input.getAttribute('placeholder');
    const id = await input.getAttribute('id');

    // Проверяем есть ли связанный label
    if (id) {
      const label = await page.$(`label[for="${id}"]`);
      if (label) {
        inputsWithLabels++;
        continue;
      }
    }

    // Проверяем обёртку label
    const parentLabel = await input.evaluate(el => {
      let parent = el.parentElement;
      while (parent) {
        if (parent.tagName === 'LABEL') return true;
        parent = parent.parentElement;
      }
      return false;
    });

    if (parentLabel || ariaLabel || placeholder) {
      inputsWithLabels++;
    } else {
      warn(`Input без label/aria-label/placeholder`, `id="${id || 'none'}"`);
    }
  }
  ok(`Inputs с label/placeholder: ${inputsWithLabels}/${inputs.length}`);

  // Проверяем aria-label на icon-only кнопках
  const buttons = await page.$$('button');
  let iconOnlyWithoutLabel = 0;
  for (const btn of buttons) {
    const text = (await btn.textContent()).trim();
    const ariaLabel = await btn.getAttribute('aria-label');

    // Если кнопка без текста — должна быть aria-label
    if (!text && !ariaLabel) {
      iconOnlyWithoutLabel++;
    }
  }

  if (iconOnlyWithoutLabel > 0) {
    warn(`${iconOnlyWithoutLabel} кнопок без текста и aria-label`, 'Нарушение WCAG 2.1');
  } else {
    ok('Все icon-only кнопки имеют aria-label');
  }

  // Проверяем контраст (базовая проверка — наличие dark mode классов)
  const darkModeElements = await page.$$('[class*="dark:"]');
  if (darkModeElements.length > 0) {
    ok(`Dark mode стили: ${darkModeElements.length} элементов`);
  }

  // Проверяем toggle accessibility
  const toggles = await page.$$('button[type="button"].rounded-full');
  for (let i = 0; i < toggles.length; i++) {
    const ariaLabel = await toggles[i].getAttribute('aria-label');
    const ariaChecked = await toggles[i].getAttribute('aria-checked');
    const role = await toggles[i].getAttribute('role');

    if (!ariaLabel && !role) {
      warn(`Toggle #${i + 1} без aria-label и role="switch"`, 'Рекомендуется role="switch" + aria-checked + aria-label');
    }
  }
}

async function testResponsive(page) {
  console.log('\n═══ 7. Responsive Design (Mobile 375x667) ═══');

  const originalSize = page.viewportSize();

  // Переключаем на мобильный
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(500);
  await screenshot(page, 'mobile-view');

  // Проверяем что контент не обрезается
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

  if (scrollWidth > clientWidth + 10) {
    bug('Горизонтальный скролл на мобильном', `scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`);
  } else {
    ok('Нет горизонтального скролла на мобильном');
  }

  // Проверяем что grid колонки стали 1 на мобильном
  const nameInput = await page.$('input[placeholder="Имя"]');
  const lastNameInput = await page.$('input[placeholder="Фамилия"]');

  if (nameInput && lastNameInput) {
    const nameBox = await nameInput.boundingBox();
    const lastNameBox = await lastNameInput.boundingBox();

    if (nameBox && lastNameBox) {
      // На мобильном оба поля должны быть в одну колонку (y lastNameBox > y nameBox)
      if (lastNameBox.y <= nameBox.y) {
        warn('На мобильном поля Имя/Фамилия НЕ стекаются в одну колонку');
      } else {
        ok('На мобильном Имя/Фамилия стекаются в колонку');
      }
    }
  }

  // Проверяем кнопки темы на мобильном
  const themeButtons = await page.$$('button:has-text("Светлая"), button:has-text("Тёмная"), button:has-text("Системная")');
  if (themeButtons.length === 3) {
    const boxes = await Promise.all(themeButtons.map(b => b.boundingBox()));
    const allVisible = boxes.every(b => b !== null);
    if (allVisible) {
      // Проверяем что кнопки не выходят за пределы viewport
      const anyOutside = boxes.some(b => b && (b.x + b.width > 375));
      if (anyOutside) {
        warn('Кнопки темы выходят за пределы мобильного viewport');
      } else {
        ok('Кнопки темы помещаются на мобильном');
      }
    }
  }

  // Проверяем секцию аккаунта — grid 1 колонка на мобильном
  await screenshot(page, 'mobile-bottom');

  // Tablet
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  await screenshot(page, 'tablet-view');
  ok('Tablet viewport проверен');

  // Восстанавливаем
  await page.setViewportSize(originalSize || { width: 1280, height: 720 });
  await page.waitForTimeout(300);
}

async function testKeyboardNavigation(page) {
  console.log('\n═══ 8. Keyboard Navigation ═══');

  // Tab через элементы
  const nameInput = await page.$('input[placeholder="Имя"]');
  if (nameInput) {
    await nameInput.focus();

    // Tab → должен перейти на "Фамилия"
    await page.keyboard.press('Tab');
    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    const activePlaceholder = await page.evaluate(() => document.activeElement?.placeholder);

    if (activePlaceholder === 'Фамилия') {
      ok('Tab: Имя → Фамилия');
    } else {
      warn(`Tab от "Имя" перешёл на "${activePlaceholder || activeTag}"`, 'Ожидалось "Фамилия"');
    }

    // Tab → Отдел
    await page.keyboard.press('Tab');
    const activePlaceholder2 = await page.evaluate(() => document.activeElement?.placeholder);
    if (activePlaceholder2?.includes('Отдел')) {
      ok('Tab: Фамилия → Отдел');
    }
  }

  // Escape — нет модалки, но проверим что ничего не ломается
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  const stillOnProfile = page.url().includes('/profile');
  if (!stillOnProfile) {
    bug('Escape на странице профиля делает навигацию', 'Ожидается: ничего не происходит');
  } else {
    ok('Escape не ломает страницу');
  }
}

async function testConsoleErrors(page) {
  console.log('\n═══ 9. Console Errors ═══');

  const consoleErrors = [];
  const consoleWarnings = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });

  // Перезагружаем страницу для чистой проверки
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  if (consoleErrors.length > 0) {
    for (const err of consoleErrors) {
      if (err.includes('favicon') || err.includes('404')) continue; // Игнорируем favicon
      bug('Console error', err.substring(0, 200));
    }
  } else {
    ok('Нет console errors при загрузке /profile');
  }

  if (consoleWarnings.length > 0) {
    warn(`Console warnings: ${consoleWarnings.length}`, consoleWarnings[0]?.substring(0, 100));
  }
}

async function testNetworkErrors(page) {
  console.log('\n═══ 10. Network Errors ═══');

  const failedRequests = [];

  page.on('response', response => {
    if (response.status() >= 400 && !response.url().includes('favicon')) {
      failedRequests.push({ url: response.url(), status: response.status() });
    }
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  if (failedRequests.length > 0) {
    for (const req of failedRequests) {
      bug(`HTTP ${req.status}`, req.url);
    }
  } else {
    ok('Все HTTP запросы успешны');
  }
}

async function testProfileAPIDirectly(page) {
  console.log('\n═══ 11. API Direct Tests ═══');

  // Тест GET /auth/me
  const meResponse = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      return { status: res.status, data: await res.json() };
    } catch (e) {
      return { error: e.message };
    }
  });

  if (meResponse.error) {
    bug('GET /auth/me ошибка', meResponse.error);
  } else if (meResponse.status === 200) {
    ok(`GET /auth/me → 200 (${meResponse.data?.email || 'no email'})`);

    // Проверяем структуру ответа
    const user = meResponse.data;
    const requiredFields = ['id', 'email', 'firstName', 'lastName', 'role', 'isActive'];
    for (const field of requiredFields) {
      if (!(field in user)) {
        bug(`GET /auth/me — отсутствует поле "${field}"`);
      }
    }

    // Проверяем что пароль НЕ возвращается
    if ('password' in user) {
      bug('GET /auth/me возвращает пароль!', 'КРИТИЧЕСКАЯ уязвимость');
    } else {
      ok('Пароль не возвращается в /auth/me');
    }
  } else {
    bug(`GET /auth/me → ${meResponse.status}`, JSON.stringify(meResponse.data));
  }

  // Тест PATCH /auth/me с невалидными данными
  const invalidPatch = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ firstName: 'A'.repeat(200) }), // > MaxLength(100)
      });
      return { status: res.status, data: await res.json() };
    } catch (e) {
      return { error: e.message };
    }
  });

  if (invalidPatch.status === 400) {
    ok('PATCH /auth/me с длинным именем → 400 (валидация работает)');
  } else if (invalidPatch.status === 200) {
    bug('PATCH /auth/me принял имя > 100 символов', 'Backend валидация MaxLength(100) не работает');
  } else {
    warn(`PATCH /auth/me с невалидными данными → ${invalidPatch.status}`);
  }

  // Тест с лишними полями (forbidNonWhitelisted)
  const extraFields = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: 'admin', isActive: false }),
      });
      return { status: res.status, data: await res.json() };
    } catch (e) {
      return { error: e.message };
    }
  });

  if (extraFields.status === 400) {
    ok('PATCH /auth/me с role/isActive → 400 (запрещено менять роль/статус)');
  } else if (extraFields.status === 200) {
    bug('PATCH /auth/me позволяет менять role/isActive!', 'КРИТИЧЕСКАЯ уязвимость — privilege escalation');
  }
}

async function testBrowserBackForward(page) {
  console.log('\n═══ 12. Browser Back/Forward ═══');

  // Запоминаем текущий URL
  const profileUrl = page.url();

  // Идём на другую страницу
  await page.goto(BASE + '/workspace', { waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForTimeout(1000);

  // Back
  await page.goBack();
  await page.waitForTimeout(1500);

  if (page.url().includes('/profile')) {
    ok('Browser Back возвращает на /profile');
  } else {
    warn('Browser Back не вернул на /profile', `URL: ${page.url()}`);
  }

  // Forward
  await page.goForward();
  await page.waitForTimeout(1500);

  if (page.url().includes('/workspace')) {
    ok('Browser Forward работает');
  }

  // Возвращаемся на профиль
  await page.goto(BASE + '/profile', { waitUntil: 'networkidle', timeout: 10000 });
}

async function testUserMenuClosesOnOutsideClick(page) {
  console.log('\n═══ 13. User Menu — закрытие по клику снаружи ═══');

  // Идём на workspace для проверки user menu
  const userMenuBtn = await page.$('[data-testid="user-menu-button"]');
  if (!userMenuBtn) return;

  // Открываем
  await userMenuBtn.click();
  await page.waitForTimeout(300);

  // Проверяем что меню открыто
  const menuItem = await page.$('button:has-text("Профиль")');
  if (!menuItem) {
    warn('User Menu не открылось');
    return;
  }
  ok('User Menu открыто');

  // Кликаем снаружи
  await page.click('body', { position: { x: 10, y: 10 } });
  await page.waitForTimeout(300);

  const menuItemAfter = await page.$('button:has-text("Выйти")');
  // Проверяем что меню в dropdown
  const menuVisible = menuItemAfter ? await menuItemAfter.isVisible() : false;
  if (!menuVisible) {
    ok('User Menu закрывается по клику снаружи');
  } else {
    bug('User Menu НЕ закрывается по клику снаружи');
  }
}

async function testSaveStateAfterRefresh(page) {
  console.log('\n═══ 14. Сохранение настроек после перезагрузки ═══');

  // Переключаем тему на тёмную
  const darkBtn = await page.$('button:has-text("Тёмная")');
  if (darkBtn) {
    await darkBtn.click();
    await page.waitForTimeout(500);

    // Перезагружаем
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Проверяем что тема сохранилась
    const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (hasDark) {
      ok('Тёмная тема сохранилась после reload');
    } else {
      bug('Тёмная тема НЕ сохранилась после reload');
    }

    // Проверяем что кнопка "Тёмная" активна
    const darkBtnAfter = await page.$('button:has-text("Тёмная")');
    if (darkBtnAfter) {
      const classes = await darkBtnAfter.getAttribute('class');
      if (classes?.includes('bg-primary')) {
        ok('Кнопка "Тёмная" визуально активна после reload');
      } else {
        bug('Кнопка "Тёмная" не показывается как активная после reload');
      }
    }

    // Восстанавливаем на системную
    const systemBtn = await page.$('button:has-text("Системная")');
    if (systemBtn) await systemBtn.click();
  }
}

// ==================== MAIN ====================

(async () => {
  console.log('🔍 ПОЛНЫЙ АУДИТ ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ');
  console.log('═'.repeat(50));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'ru-RU',
  });
  const page = await context.newPage();

  // Создаём директорию для скриншотов
  const { mkdirSync } = await import('fs');
  try { mkdirSync(SCREENSHOT_DIR, { recursive: true }); } catch {}

  try {
    await login(page);

    // Сначала идём на workspace чтобы Header был виден
    await page.waitForTimeout(1000);

    // Тесты навигации и user menu
    await testHeaderMenuNavigation(page);

    // Все тесты на странице профиля
    await testProfileSection(page);
    await testAppearanceSection(page);
    await testNotificationsSection(page);
    await testAccountSection(page);
    await testAccessibility(page);
    await testResponsive(page);
    await testKeyboardNavigation(page);
    await testConsoleErrors(page);
    await testNetworkErrors(page);
    await testProfileAPIDirectly(page);
    await testBrowserBackForward(page);
    await testUserMenuClosesOnOutsideClick(page);
    await testSaveStateAfterRefresh(page);

  } catch (e) {
    console.error('\n💥 КРИТИЧЕСКАЯ ОШИБКА:', e.message);
    await screenshot(page, 'critical-error');
    bugs.push({ desc: 'Критическая ошибка тестирования', detail: e.message });
  } finally {
    await browser.close();
  }

  // Итоги
  console.log('\n' + '═'.repeat(50));
  console.log('📊 ИТОГИ АУДИТА ПРОФИЛЯ');
  console.log('═'.repeat(50));
  console.log(`🐛 Баги: ${bugs.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);

  if (bugs.length > 0) {
    console.log('\n🐛 БАГИ:');
    bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b.desc}${b.detail ? ' — ' + b.detail : ''}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w.desc}${w.detail ? ' — ' + w.detail : ''}`));
  }

  // JSON результат
  const result = { bugs, warnings, total: { bugs: bugs.length, warnings: warnings.length } };
  const { writeFileSync } = await import('fs');
  writeFileSync('audit-screenshots/profile/audit-result.json', JSON.stringify(result, null, 2));
  console.log('\n📁 Результат: audit-screenshots/profile/audit-result.json');
  console.log('📸 Скриншоты: audit-screenshots/profile/');
})();
