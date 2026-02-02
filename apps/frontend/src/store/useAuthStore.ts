'use client';

import { create } from 'zustand';
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

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
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
    }
  },

  refreshTokens: async () => {
    try {
      const response = await authApi.refresh();
      set({ accessToken: response.accessToken });
      return true;
    } catch {
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
}));
