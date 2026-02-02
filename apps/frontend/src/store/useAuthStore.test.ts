import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './useAuthStore';

// Mock the auth API
vi.mock('@/lib/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    me: vi.fn(),
  },
}));

import { authApi } from '@/lib/api/auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('должен иметь правильное начальное состояние', () => {
      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('login', () => {
    it('должен успешно залогинить пользователя', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'employee' as const,
        isActive: true,
      };

      vi.mocked(authApi.login).mockResolvedValue({
        user: mockUser,
        accessToken: 'test-token',
      });

      await useAuthStore.getState().login('test@example.com', 'password');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.accessToken).toBe('test-token');
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('должен установить ошибку при неудачном логине', async () => {
      vi.mocked(authApi.login).mockRejectedValue(new Error('Неверные данные'));

      await expect(
        useAuthStore.getState().login('test@example.com', 'wrong'),
      ).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Неверные данные');
    });
  });

  describe('logout', () => {
    it('должен очистить состояние при logout', async () => {
      // Setup authenticated state
      useAuthStore.setState({
        user: { id: '1', email: 'test@example.com' } as any,
        accessToken: 'token',
        isAuthenticated: true,
      });

      vi.mocked(authApi.logout).mockResolvedValue({ message: 'OK' });

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('setAccessToken', () => {
    it('должен установить access token', () => {
      useAuthStore.getState().setAccessToken('new-token');

      expect(useAuthStore.getState().accessToken).toBe('new-token');
    });
  });

  describe('clearError', () => {
    it('должен очистить ошибку', () => {
      useAuthStore.setState({ error: 'Some error' });

      useAuthStore.getState().clearError();

      expect(useAuthStore.getState().error).toBeNull();
    });
  });
});
