import { apiClient } from './client';
import type {
  KnowledgeArticle,
  ArticleListResponse,
  ArticleType,
  KnowledgeBaseStats,
} from '@/types/knowledge-base';

export const knowledgeBaseApi = {
  getArticles: async (params: {
    type?: ArticleType;
    category?: string;
    workspaceId?: string;
    search?: string;
    page?: number;
    perPage?: number;
  }): Promise<ArticleListResponse> => {
    const query = new URLSearchParams();
    if (params.type) query.append('type', params.type);
    if (params.category) query.append('category', params.category);
    if (params.workspaceId) query.append('workspaceId', params.workspaceId);
    if (params.search) query.append('search', params.search);
    if (params.page) query.append('page', String(params.page));
    if (params.perPage) query.append('perPage', String(params.perPage));

    const res = await apiClient.get<ArticleListResponse>(
      `/knowledge-base/articles?${query.toString()}`,
    );
    return res.data;
  },

  getArticle: async (id: string): Promise<KnowledgeArticle> => {
    const res = await apiClient.get<KnowledgeArticle>(`/knowledge-base/articles/${id}`);
    return res.data;
  },

  createFaq: async (data: {
    title: string;
    content: string;
    workspaceId?: string;
    category?: string;
    tags?: string[];
    status?: 'draft' | 'published';
  }): Promise<KnowledgeArticle> => {
    const res = await apiClient.post<KnowledgeArticle>('/knowledge-base/articles', data);
    return res.data;
  },

  uploadDocument: async (
    file: File,
    metadata: {
      title: string;
      workspaceId?: string;
      category?: string;
      tags?: string[];
    },
  ): Promise<KnowledgeArticle> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', metadata.title);
    if (metadata.workspaceId) formData.append('workspaceId', metadata.workspaceId);
    if (metadata.category) formData.append('category', metadata.category);
    if (metadata.tags) formData.append('tags', JSON.stringify(metadata.tags));

    const res = await apiClient.post<KnowledgeArticle>(
      '/knowledge-base/articles/upload',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data;
  },

  updateArticle: async (
    id: string,
    data: {
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
      status?: 'draft' | 'published';
    },
  ): Promise<KnowledgeArticle> => {
    const res = await apiClient.put<KnowledgeArticle>(
      `/knowledge-base/articles/${id}`,
      data,
    );
    return res.data;
  },

  deleteArticle: async (id: string): Promise<{ success: boolean }> => {
    const res = await apiClient.delete<{ success: boolean }>(
      `/knowledge-base/articles/${id}`,
    );
    return res.data;
  },

  getCategories: async (workspaceId?: string): Promise<string[]> => {
    const query = workspaceId ? `?workspaceId=${workspaceId}` : '';
    const res = await apiClient.get<string[]>(`/knowledge-base/categories${query}`);
    return res.data;
  },

  getStats: async (workspaceId?: string): Promise<KnowledgeBaseStats> => {
    const query = workspaceId ? `?workspaceId=${workspaceId}` : '';
    const res = await apiClient.get<KnowledgeBaseStats>(`/knowledge-base/stats${query}`);
    return res.data;
  },
};
