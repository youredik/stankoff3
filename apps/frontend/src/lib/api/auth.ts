import { apiClient } from './client';
import { User, NotificationPreferences } from '@/types';

export interface RefreshResponse {
  accessToken: string;
}

export interface LogoutResponse {
  message: string;
  keycloakLogoutUrl?: string;
}

const REFRESH_TIMEOUT = 10_000; // 10 секунд на refresh (не должен зависать)

export const authApi = {
  refresh: async (): Promise<RefreshResponse> => {
    // Не передаём body — refresh token читается из httpOnly cookie
    const { data } = await apiClient<RefreshResponse>({
      method: 'POST',
      url: '/auth/refresh',
      timeout: REFRESH_TIMEOUT,
    });
    return data;
  },

  logout: async (): Promise<LogoutResponse> => {
    const { data } = await apiClient.post<LogoutResponse>('/auth/logout');
    return data;
  },

  me: async (): Promise<User> => {
    const { data } = await apiClient.get<User>('/auth/me');
    return data;
  },

  updateProfile: async (profileData: {
    firstName?: string;
    lastName?: string;
    department?: string;
    avatar?: string | null;
    notificationPreferences?: NotificationPreferences;
  }): Promise<User> => {
    const { data } = await apiClient.patch<User>('/auth/me', profileData);
    return data;
  },

  getKeycloakLoginUrl: (): string => {
    // В браузере используем относительный путь для работы через rewrites
    return '/api/auth/keycloak/login';
  },

  getDevUsers: async (): Promise<DevUser[]> => {
    const { data } = await apiClient.get<DevUser[]>('/auth/dev/users');
    return data;
  },

  devLogin: async (email: string): Promise<RefreshResponse> => {
    const { data } = await apiClient.post<RefreshResponse>('/auth/dev/login', { email });
    return data;
  },
};

export interface DevUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  avatar: string | null;
}
