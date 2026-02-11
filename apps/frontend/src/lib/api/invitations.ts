import axios from 'axios';
import { apiClient } from './client';
import type { Invitation, InvitationStatus, InvitationMembership } from '@/types';

export interface CreateInvitationData {
  email: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  globalRoleSlug?: string;
  memberships?: InvitationMembership[];
}

export interface BulkInviteData {
  invitations: CreateInvitationData[];
}

export interface BulkInviteResult {
  total: number;
  created: number;
  existingUsers: number;
  failed: number;
  results: Array<{
    email: string;
    success: boolean;
    isExistingUser?: boolean;
    error?: string;
  }>;
}

// Публичный axios (без auth interceptors)
const publicClient = axios.create({ baseURL: '/api' });

export const invitationsApi = {
  // Защищённые (admin)
  getAll: (params?: { status?: InvitationStatus; search?: string }) =>
    apiClient.get<Invitation[]>('/invitations', { params }).then((r) => r.data),

  create: (data: CreateInvitationData) =>
    apiClient.post('/invitations', data).then((r) => r.data),

  bulkCreate: (data: BulkInviteData) =>
    apiClient.post<BulkInviteResult>('/invitations/bulk', data).then((r) => r.data),

  revoke: (id: string) =>
    apiClient.post(`/invitations/${id}/revoke`).then((r) => r.data),

  resend: (id: string) =>
    apiClient.post(`/invitations/${id}/resend`).then((r) => r.data),

  // Публичные (без auth)
  verifyToken: (token: string) =>
    publicClient.get<{
      valid: boolean;
      invitation?: { email: string; firstName: string | null; lastName: string | null };
    }>(`/invitations/verify/${token}`).then((r) => r.data),

  accept: (data: { token: string; password: string; firstName?: string; lastName?: string }) =>
    publicClient.post('/invitations/accept', data).then((r) => r.data),
};
