'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';
import { authApi } from '@/lib/api/auth';

/**
 * Извлекает время истечения JWT токена (в мс) без внешних зависимостей
 */
function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Проверяет, истёк ли токен (с запасом 10 сек на задержку сети)
 */
function isTokenExpired(token: string): boolean {
  const expiryMs = getTokenExpiryMs(token);
  if (!expiryMs) return true;
  return expiryMs <= Date.now() + 10_000;
}

// Глобальный таймер — вне store чтобы не сериализовался
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleProactiveRefresh(token: string, doRefresh: () => Promise<boolean>) {
  clearRefreshTimer();

  const expiryMs = getTokenExpiryMs(token);
  if (!expiryMs) return;

  const now = Date.now();
  const ttl = expiryMs - now;

  if (ttl <= 0) {
    // Токен уже истёк — обновляем немедленно
    doRefresh();
    return;
  }

  // Обновляем за 60 секунд до истечения (минимум 10 сек)
  const refreshIn = Math.max(ttl - 60_000, 10_000);

  refreshTimer = setTimeout(async () => {
    await doRefresh();
    // При неудаче doRefresh() сам устанавливает isAuthenticated: false,
    // AuthProvider обнаружит это и сделает redirect на /login
  }, refreshIn);
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  logout: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
  checkAuth: () => Promise<void>;
  setAccessToken: (token: string | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

  logout: async () => {
    clearRefreshTimer();
    try {
      const response = await authApi.logout();

      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });

      localStorage.removeItem('auth-storage');

      if (response.keycloakLogoutUrl) {
        window.location.href = response.keycloakLogoutUrl;
        return;
      }
    } catch {
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
      localStorage.removeItem('auth-storage');
    }
  },

  refreshTokens: async () => {
    try {
      const response = await authApi.refresh();
      set({ accessToken: response.accessToken });
      // Планируем следующий proactive refresh
      scheduleProactiveRefresh(response.accessToken, get().refreshTokens);
      return true;
    } catch {
      clearRefreshTimer();
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return false;
    }
  },

  checkAuth: async () => {
    const { accessToken, user } = get();

    // Быстрый путь: валидный не-истёкший токен в памяти + данные пользователя
    if (accessToken && user && !isTokenExpired(accessToken)) {
      scheduleProactiveRefresh(accessToken, get().refreshTokens);
      set({ isAuthenticated: true, isLoading: false });
      return;
    }

    // Нужна аутентификация: нет токена, токен истёк, или нет данных пользователя
    set({ isLoading: true });

    // Если токен есть (может быть ещё валидный) — пробуем /auth/me
    if (accessToken && !isTokenExpired(accessToken)) {
      try {
        const freshUser = await authApi.me();
        set({ user: freshUser, isAuthenticated: true, isLoading: false });
        scheduleProactiveRefresh(accessToken, get().refreshTokens);
        return;
      } catch {
        // Токен отклонён сервером — пробуем refresh
      }
    }

    // Silent refresh через httpOnly cookie
    const refreshed = await get().refreshTokens();
    if (refreshed) {
      try {
        const freshUser = await authApi.me();
        set({ user: freshUser, isAuthenticated: true, isLoading: false });
        return;
      } catch {
        // Refresh прошёл, но профиль не удалось получить
      }
    }

    // Ничего не сработало — не авторизован
    set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
  },

  setAccessToken: (token: string | null) => {
    set({ accessToken: token });
    if (token) {
      scheduleProactiveRefresh(token, get().refreshTokens);
    } else {
      clearRefreshTimer();
    }
  },

  clearError: () => {
    set({ error: null });
  },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Персистим ТОЛЬКО user (как hint для UI во время загрузки).
        // accessToken и isAuthenticated НЕ персистятся:
        // - accessToken: защита от XSS (не хранится в localStorage)
        // - isAuthenticated: предотвращает race condition (permissions не загружаются
        //   до того как checkAuth подтвердит авторизацию через silent refresh)
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        // После гидрации всегда нужна проверка auth (токен в памяти отсутствует)
        if (state) {
          state.isLoading = true;
        }
      },
    }
  )
);

// Экспортируем утилиту для тестирования
export { getTokenExpiryMs };
