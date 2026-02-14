import { apiClient } from './client';

export interface ProductCategory {
  id: string;
  name: string;
  slug: string | null;
  parentId: string | null;
  legacyId: number | null;
  sortOrder: number;
  productCount: number;
  isActive: boolean;
  workspaceId: string;
}

export interface CategoryTreeNode extends ProductCategory {
  children: CategoryTreeNode[];
}

export const productCategoriesApi = {
  getAll: (workspaceId: string) =>
    apiClient
      .get<ProductCategory[]>('/product-categories', { params: { workspaceId } })
      .then((r) => r.data),

  getTree: (workspaceId: string) =>
    apiClient
      .get<CategoryTreeNode[]>('/product-categories/tree', { params: { workspaceId } })
      .then((r) => r.data),

  getById: (id: string) =>
    apiClient
      .get<ProductCategory>(`/product-categories/${id}`)
      .then((r) => r.data),

  create: (data: Partial<ProductCategory>) =>
    apiClient
      .post<ProductCategory>('/product-categories', data)
      .then((r) => r.data),

  update: (id: string, data: Partial<ProductCategory>) =>
    apiClient
      .put<ProductCategory>(`/product-categories/${id}`, data)
      .then((r) => r.data),

  remove: (id: string) =>
    apiClient.delete(`/product-categories/${id}`),
};
