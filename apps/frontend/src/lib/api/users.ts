import { apiClient } from './client';
import type { User } from '@/types';

export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  department?: string;
  role?: 'admin' | 'manager' | 'employee';
}

export interface UpdateUserData {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  role?: 'admin' | 'manager' | 'employee';
  isActive?: boolean;
}

export const usersApi = {
  getAll: () => apiClient.get<User[]>('/users').then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<User>(`/users/${id}`).then((r) => r.data),

  create: (data: CreateUserData) =>
    apiClient.post<User>('/users', data).then((r) => r.data),

  update: (id: string, data: UpdateUserData) =>
    apiClient.put<User>(`/users/${id}`, data).then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/users/${id}`),
};
