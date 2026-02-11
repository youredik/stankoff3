export type ArticleType = 'document' | 'faq';
export type ArticleStatus = 'draft' | 'published';

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string | null;
  type: ArticleType;
  workspaceId: string | null;
  category: string | null;
  tags: string[];
  fileKey: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  status: ArticleStatus;
  authorId: string | null;
  author?: {
    id: string;
    name: string;
    email: string;
  };
  workspace?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ArticleListResponse {
  items: KnowledgeArticle[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface KnowledgeBaseStats {
  totalDocuments: number;
  totalFaq: number;
  totalArticles: number;
  documentChunks: number;
  faqChunks: number;
  totalChunks: number;
}
