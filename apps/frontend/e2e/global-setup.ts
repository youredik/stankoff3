import type { FullConfig } from '@playwright/test';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function globalSetup(_config: FullConfig) {
  console.log('\n🧹 Очистка тестовых данных перед запуском тестов...');

  try {
    // Аутентифицируемся через dev login (без пароля)
    const loginResponse = await fetch(`${API_URL}/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'youredik@gmail.com' }),
    });

    if (!loginResponse.ok) {
      console.warn('⚠️ Не удалось авторизоваться для очистки тестовых данных (dev login)');
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
      if (result.deleted > 0) {
        console.log(`✅ Удалено старых тестовых заявок: ${result.deleted}`);
      }
    }

    // Очистка тестовых чатов
    const chatsRes = await fetch(`${API_URL}/chat/cleanup/test-data`, {
      method: 'DELETE',
      headers,
    });

    if (chatsRes.ok) {
      const result = await chatsRes.json();
      if (result.deleted > 0) {
        console.log(`✅ Удалено старых тестовых чатов: ${result.deleted}`);
      }
    }

    console.log('✅ Очистка завершена');
  } catch (error) {
    console.warn('⚠️ Ошибка при очистке тестовых данных:', error);
  }
}

export default globalSetup;
