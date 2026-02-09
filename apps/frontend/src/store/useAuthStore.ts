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
  // Обновляем за 60 секунд до истечения (минимум 10 сек)
  const refreshIn = Math.max(ttl - 60_000, 10_000);

  refreshTimer = setTimeout(async () => {
    const success = await doRefresh();
    if (!success) {
      console.log('[AuthStore] Proactive refresh failed, session expired');
    }
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
    if (get().isAuthenticated && get().user) {
      // Даже если уже авторизован — планируем refresh по текущему токену
      const token = get().accessToken;
      if (token) {
        scheduleProactiveRefresh(token, get().refreshTokens);
      }
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true });
    try {
      const user = await authApi.me();
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
      });
      const token = get().accessToken;
      if (token) {
        scheduleProactiveRefresh(token, get().refreshTokens);
      }
    } catch {
      const refreshed = await get().refreshTokens();
      if (refreshed) {
        try {
          const user = await authApi.me();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        } catch {
          // Не удалось получить профиль
        }
      }
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
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
        accessToken: state.accessToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          state.isLoading = true;
        } else {
          state!.isLoading = false;
        }
      },
    }
  )
);

// Экспортируем утилиту для тестирования
export { getTokenExpiryMs };
