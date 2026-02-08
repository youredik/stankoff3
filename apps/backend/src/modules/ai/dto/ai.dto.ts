import { IsString, IsUUID, IsOptional, IsNumber, Min, Max } from 'class-validator';

/**
 * DTO для запроса классификации
 */
export class ClassifyRequestDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  equipment?: string;
}

/**
 * DTO для ответа классификации
 */
export class ClassifyResponseDto {
  category: string;
  priority: string;
  skills: string[];
  confidence: number;
  reasoning: string;
  suggestedAssignee?: string;
}

/**
 * DTO для запроса генерации ответа
 */
export class GenerateResponseDto {
  @IsUUID()
  entityId: string;

  @IsOptional()
  @IsString()
  additionalContext?: string;
}

/**
 * DTO для ответа генерации
 */
export class GeneratedResponseDto {
  draft: string;
  sources: Array<{
    type: string;
    id: string;
    title?: string;
    similarity?: number;
  }>;
}

/**
 * DTO для RAG поиска
 */
export class SearchRequestDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minSimilarity?: number;
}

/**
 * Элемент результата поиска с legacy ссылкой
 */
export interface SearchResultItem {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown>;
  similarity: number;
  /** Ссылка на legacy систему (если sourceType === 'legacy_request') */
  legacyUrl?: string;
}

/**
 * Рекомендуемый эксперт на основе похожих решённых заявок
 */
export interface SuggestedExpert {
  /** Имя сотрудника */
  name: string;
  /** ID менеджера (если известен) */
  managerId?: number;
  /** Отдел */
  department?: string;
  /** Количество похожих решённых заявок */
  relevantCases: number;
  /** Темы решённых заявок */
  topics: string[];
}

/**
 * DTO для результата RAG поиска
 */
export class SearchResultDto {
  results: SearchResultItem[];
  generatedAnswer?: string;
  /** Связанные ссылки на legacy систему для использования в AI ответах */
  relatedLinks?: Array<{
    label: string;
    url: string;
    sourceType: string;
  }>;
  /** Рекомендуемые эксперты, решавшие похожие проблемы */
  suggestedExperts?: SuggestedExpert[];
}

/**
 * DTO для суммаризации
 */
export class SummarizeRequestDto {
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

/**
 * DTO для результата суммаризации
 */
export class SummaryResponseDto {
  summary: string;
  keyPoints: string[];
}

/**
 * DTO для применения классификации
 */
export class ApplyClassificationDto {
  @IsUUID()
  entityId: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  priority?: string;
}

/**
 * Похожий случай из базы знаний
 */
export interface SimilarCase {
  /** ID заявки в legacy */
  requestId: number;
  /** Тема заявки */
  subject: string;
  /** Краткое описание решения */
  resolution?: string;
  /** Схожесть (0-1) */
  similarity: number;
  /** Время решения в часах */
  resolutionTimeHours?: number;
  /** Ссылка на legacy */
  legacyUrl: string;
  /** Специалисты, решавшие проблему */
  specialists?: string[];
}

/**
 * Связанный контекст (сделки, контрагенты)
 */
export interface RelatedContext {
  /** Название контрагента */
  counterpartyName?: string;
  /** Ссылка на контрагента */
  counterpartyUrl?: string;
  /** Связанные сделки */
  deals?: Array<{
    id: number;
    name: string;
    sum: number;
    url: string;
  }>;
  /** Количество обращений клиента */
  customerTotalRequests?: number;
}

/**
 * Ответ AI помощника для entity
 */
export interface AiAssistantResponse {
  /** Доступен ли AI */
  available: boolean;
  /** Похожие решённые случаи */
  similarCases: SimilarCase[];
  /** Рекомендуемые эксперты */
  suggestedExperts: SuggestedExpert[];
  /** Связанный контекст (контрагенты, сделки) */
  relatedContext?: RelatedContext;
  /** Предлагаемый черновик ответа */
  suggestedResponse?: string;
  /** Рекомендуемые действия */
  suggestedActions?: string[];
  /** Ключевые слова/теги */
  keywords?: string[];
}
