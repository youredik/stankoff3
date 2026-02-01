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
  login: (email: string, password: string) => Promise<void>;
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
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(email, password);
      set({
        user: response.user,
        accessToken: response.accessToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Неверный email или пароль';
      set({
        error: errorMessage,
        isLoading: false,
        isAuthenticated: false,
      });
      throw err;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Игнорируем ошибки при logout
    } finally {
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
