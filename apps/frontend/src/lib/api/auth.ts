import { apiClient } from './client';
import { User } from '@/types';

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface AuthProviderResponse {
  provider: 'local' | 'keycloak';
  keycloakEnabled: boolean;
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', {
      email,
      password,
    });
    return data;
  },

  refresh: async (): Promise<RefreshResponse> => {
    const { data } = await apiClient.post<RefreshResponse>('/auth/refresh');
    return data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  me: async (): Promise<User> => {
    const { data } = await apiClient.get<User>('/auth/me');
    return data;
  },

  getProvider: async (): Promise<AuthProviderResponse> => {
    const { data } = await apiClient.get<AuthProviderResponse>('/auth/provider');
    return data;
  },

  getKeycloakLoginUrl: (): string => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return `${apiUrl}/api/auth/keycloak/login`;
  },
};
