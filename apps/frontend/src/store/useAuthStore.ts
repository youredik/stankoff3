'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';
import { authApi } from '@/lib/api/auth';

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
      isLoading: true, // Начинаем с true чтобы не было редиректа до проверки авторизации
      error: null,

  logout: async () => {
    try {
      const response = await authApi.logout();

      // Очищаем состояние
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });

      // Очищаем localStorage напрямую перед редиректом
      // (persist middleware может не успеть синхронизироваться)
      localStorage.removeItem('auth-storage');

      // Если есть Keycloak logout URL - редиректим на него
      if (response.keycloakLogoutUrl) {
        window.location.href = response.keycloakLogoutUrl;
        return;
      }
    } catch {
      // Игнорируем ошибки при logout, но всё равно очищаем состояние
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
      // Очищаем localStorage и при ошибках
      localStorage.removeItem('auth-storage');
    }
  },

  refreshTokens: async () => {
    console.log('[AuthStore] refreshTokens called');
    try {
      const response = await authApi.refresh();
      console.log('[AuthStore] refresh success, new token received');
      set({ accessToken: response.accessToken });
      return true;
    } catch (err) {
      console.log('[AuthStore] refresh failed:', err);
      // Refresh token истёк - выходим
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
    // Если уже авторизован - не проверяем снова
    if (get().isAuthenticated && get().user) {
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true });
    try {
      // Пробуем получить профиль - если есть валидный refresh token в cookie,
      // interceptor автоматически получит новый access token
      const user = await authApi.me();
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // Пробуем обновить токены
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
        // После восстановления из localStorage - проверяем токен
        if (state?.accessToken) {
          // Токен есть - нужно проверить его валидность
          state.isLoading = true;
        } else {
          state!.isLoading = false;
        }
      },
    }
  )
);
