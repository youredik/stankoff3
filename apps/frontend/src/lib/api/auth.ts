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
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return `${apiUrl}/api/auth/keycloak/login`;
  },
};
