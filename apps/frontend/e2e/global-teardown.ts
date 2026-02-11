import type { FullConfig } from '@playwright/test';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function globalTeardown(_config: FullConfig) {
  console.log('\n🧹 Очистка тестовых данных...');

  try {
    // Аутентифицируемся через dev login (без пароля)
    const loginResponse = await fetch(`${API_URL}/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'youredik@gmail.com' }),
    });

    if (!loginResponse.ok) {
      console.warn('⚠️ Не удалось авторизоваться для очистки тестовых данных');
      return;
    }

    const { accessToken } = await loginResponse.json();
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Очистка тестовых заявок
    const entitiesRes = await fetch(`${API_URL}/entities/cleanup/test-data`, {
      method: 'DELETE',
      headers,
    });

    if (entitiesRes.ok) {
      const result = await entitiesRes.json();
      console.log(`✅ Удалено тестовых заявок: ${result.deleted}`);
    }

    // Очистка тестовых чатов
    const chatsRes = await fetch(`${API_URL}/chat/cleanup/test-data`, {
      method: 'DELETE',
      headers,
    });

    if (chatsRes.ok) {
      const result = await chatsRes.json();
      console.log(`✅ Удалено тестовых чатов: ${result.deleted}`);
    }
  } catch (error) {
    console.warn('⚠️ Ошибка при очистке тестовых данных:', error);
  }
}

export default globalTeardown;
