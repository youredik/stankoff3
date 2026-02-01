import type { FullConfig } from '@playwright/test';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function globalTeardown(_config: FullConfig) {
  console.log('\n🧹 Очистка тестовых данных...');

  try {
    // Сначала аутентифицируемся для получения токена
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@stankoff.ru', password: 'password' }),
    });

    if (!loginResponse.ok) {
      console.warn('⚠️ Не удалось авторизоваться для очистки тестовых данных');
      return;
    }

    const { accessToken } = await loginResponse.json();

    // Теперь вызываем cleanup с токеном
    const response = await fetch(`${API_URL}/entities/cleanup/test-data`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Удалено тестовых заявок: ${result.deleted}`);
    } else {
      console.warn(`⚠️ Не удалось очистить тестовые данные: ${response.status}`);
    }
  } catch (error) {
    console.warn('⚠️ Ошибка при очистке тестовых данных:', error);
  }
}

export default globalTeardown;
