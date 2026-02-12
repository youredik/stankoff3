import { create } from 'zustand';
import { knowledgeBaseApi } from '@/lib/api/knowledge-base';
import { toast } from '@/lib/toast';
import type {
  KnowledgeArticle,
  ArticleType,
  KnowledgeBaseStats,
} from '@/types/knowledge-base';

interface KnowledgeBaseState {
  articles: KnowledgeArticle[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;

  filters: {
    type?: ArticleType;
    category?: string;
    workspaceId?: string;
    search?: string;
  };

  categories: string[];
  stats: KnowledgeBaseStats | null;

  isLoading: boolean;
  isCreating: boolean;

  fetchArticles: (page?: number) => Promise<void>;
  createFaq: (data: {
    title: string;
    content: string;
    workspaceId?: string;
    category?: string;
    tags?: string[];
  }) => Promise<KnowledgeArticle>;
  uploadDocument: (
    file: File,
    metadata: { title: string; workspaceId?: string; category?: string; tags?: string[] },
  ) => Promise<KnowledgeArticle>;
  deleteArticle: (id: string) => Promise<void>;
  setFilters: (filters: Partial<KnowledgeBaseState['filters']>) => void;
  fetchCategories: (workspaceId?: string) => Promise<void>;
  fetchStats: (workspaceId?: string) => Promise<void>;
}

export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => ({
  articles: [],
  total: 0,
  page: 1,
  perPage: 20,
  totalPages: 0,
  filters: {},
  categories: [],
  stats: null,
  isLoading: false,
  isCreating: false,

  fetchArticles: async (page = 1) => {
    set({ isLoading: true });
    try {
      const { filters, perPage } = get();
      const response = await knowledgeBaseApi.getArticles({ ...filters, page, perPage });
      set({
        articles: response.items,
        total: response.total,
        page: response.page,
        totalPages: response.totalPages,
        isLoading: false,
      });
    } catch {
      toast.error('Не удалось загрузить статьи');
      set({ isLoading: false });
    }
  },

  createFaq: async (data) => {
    set({ isCreating: true });
    try {
      const article = await knowledgeBaseApi.createFaq(data);
      set({ isCreating: false });
      get().fetchArticles(1);
      return article;
    } catch (error) {
      set({ isCreating: false });
      throw error;
    }
  },

  uploadDocument: async (file, metadata) => {
    set({ isCreating: true });
    try {
      const article = await knowledgeBaseApi.uploadDocument(file, metadata);
      set({ isCreating: false });
      get().fetchArticles(1);
      return article;
    } catch (error) {
      set({ isCreating: false });
      throw error;
    }
  },

  deleteArticle: async (id) => {
    try {
      await knowledgeBaseApi.deleteArticle(id);
      get().fetchArticles(get().page);
    } catch (error) {
      throw error;
    }
  },

  setFilters: (newFilters) => {
    set({ filters: { ...get().filters, ...newFilters } });
    get().fetchArticles(1);
  },

  fetchCategories: async (workspaceId) => {
    try {
      const categories = await knowledgeBaseApi.getCategories(workspaceId);
      set({ categories });
    } catch {
      toast.error('Не удалось загрузить категории');
    }
  },

  fetchStats: async (workspaceId) => {
    try {
      const stats = await knowledgeBaseApi.getStats(workspaceId);
      set({ stats });
    } catch {
      toast.error('Не удалось загрузить статистику');
    }
  },
}));
