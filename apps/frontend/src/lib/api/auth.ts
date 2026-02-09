import { apiClient } from './client';
import { User } from '@/types';

export interface RefreshResponse {
  accessToken: string;
}

export interface LogoutResponse {
  message: string;
  keycloakLogoutUrl?: string;
}

export const authApi = {
  refresh: async (): Promise<RefreshResponse> => {
    const { data } = await apiClient.post<RefreshResponse>('/auth/refresh');
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
