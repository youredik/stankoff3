import type { FullConfig } from '@playwright/test';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function globalSetup(_config: FullConfig) {
  console.log('\n🧹 Очистка тестовых данных перед запуском тестов...');

  try {
    // Аутентифицируемся через dev login (без пароля)
    const loginResponse = await fetch(`${API_URL}/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@stankoff.ru' }),
    });

    if (!loginResponse.ok) {
      console.warn('⚠️ Не удалось авторизоваться для очистки тестовых данных (dev login)');
      return;
    }

    const { accessToken } = await loginResponse.json();

    // Вызываем cleanup с токеном
    const response = await fetch(`${API_URL}/entities/cleanup/test-data`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) {
      const result = await response.json();
      if (result.deleted > 0) {
        console.log(`✅ Удалено старых тестовых заявок: ${result.deleted}`);
      } else {
        console.log('✅ Старых тестовых данных не найдено');
      }
    } else {
      console.warn(`⚠️ Не удалось очистить тестовые данные: ${response.status}`);
    }
  } catch (error) {
    console.warn('⚠️ Ошибка при очистке тестовых данных:', error);
  }
}

export default globalSetup;
