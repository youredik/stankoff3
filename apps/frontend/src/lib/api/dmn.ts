import { apiClient } from './client';
import type {
  DecisionTable,
  DecisionRule,
  DecisionEvaluation,
  HitPolicy,
  InputColumn,
  OutputColumn,
} from '@/types';

export interface CreateDecisionTableDto {
  workspaceId: string;
  name: string;
  description?: string;
  hitPolicy?: HitPolicy;
  inputColumns: InputColumn[];
  outputColumns: OutputColumn[];
  rules?: DecisionRule[];
  isActive?: boolean;
}

export type UpdateDecisionTableDto = Partial<Omit<CreateDecisionTableDto, 'workspaceId'>>;

export interface EvaluateDecisionDto {
  decisionTableId: string;
  inputData: Record<string, unknown>;
  targetType?: string;
  targetId?: string;
  triggeredBy?: 'manual' | 'api' | 'automation';
}

export interface EvaluationOutput {
  results: Array<{
    ruleId: string;
    outputs: Record<string, unknown>;
    matched: boolean;
  }>;
  finalOutput: Record<string, unknown>;
  matchedCount: number;
  evaluationTimeMs: number;
}

export interface EvaluationResponse {
  evaluation: DecisionEvaluation;
  output: EvaluationOutput;
}

export interface DecisionTableStatistics {
  totalEvaluations: number;
  avgEvaluationTime: number;
  ruleHitCounts: Record<string, number>;
  recentEvaluations: DecisionEvaluation[];
}

export interface PaginatedEvaluations {
  evaluations: DecisionEvaluation[];
  total: number;
}

// ===================== Decision Tables =====================

export async function getTables(workspaceId: string): Promise<DecisionTable[]> {
  const response = await apiClient.get<DecisionTable[]>('/dmn/tables', {
    params: { workspaceId },
  });
  return response.data;
}

export async function getTable(id: string): Promise<DecisionTable> {
  const response = await apiClient.get<DecisionTable>(`/dmn/tables/${id}`);
  return response.data;
}

export async function createTable(dto: CreateDecisionTableDto): Promise<DecisionTable> {
  const response = await apiClient.post<DecisionTable>('/dmn/tables', dto);
  return response.data;
}

export async function updateTable(
  id: string,
  dto: UpdateDecisionTableDto,
): Promise<DecisionTable> {
  const response = await apiClient.put<DecisionTable>(`/dmn/tables/${id}`, dto);
  return response.data;
}

export async function deleteTable(id: string): Promise<void> {
  await apiClient.delete(`/dmn/tables/${id}`);
}

export async function cloneTable(
  id: string,
  newName: string,
): Promise<DecisionTable> {
  const response = await apiClient.post<DecisionTable>(`/dmn/tables/${id}/clone`, {
    name: newName,
  });
  return response.data;
}

// ===================== Evaluation =====================

export async function evaluate(dto: EvaluateDecisionDto): Promise<EvaluationResponse> {
  const response = await apiClient.post<EvaluationResponse>('/dmn/evaluate', dto);
  return response.data;
}

export async function evaluateQuick(
  tableId: string,
  inputData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiClient.post<Record<string, unknown>>(
    `/dmn/tables/${tableId}/evaluate-quick`,
    inputData,
  );
  return response.data;
}

export async function evaluateByName(
  workspaceId: string,
  tableName: string,
  inputData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiClient.post<Record<string, unknown>>(
    '/dmn/evaluate-by-name',
    { workspaceId, tableName, inputData },
  );
  return response.data;
}

// ===================== Evaluation History =====================

export async function getEvaluations(
  tableId: string,
  params?: { limit?: number; offset?: number },
): Promise<PaginatedEvaluations> {
  const response = await apiClient.get<PaginatedEvaluations>(
    `/dmn/tables/${tableId}/evaluations`,
    { params },
  );
  return response.data;
}

export async function getTargetEvaluations(
  targetType: string,
  targetId: string,
): Promise<DecisionEvaluation[]> {
  const response = await apiClient.get<DecisionEvaluation[]>(
    `/dmn/evaluations/${targetType}/${targetId}`,
  );
  return response.data;
}

// ===================== Statistics =====================

export async function getStatistics(tableId: string): Promise<DecisionTableStatistics> {
  const response = await apiClient.get<DecisionTableStatistics>(
    `/dmn/tables/${tableId}/statistics`,
  );
  return response.data;
}

// ===================== Helpers =====================

export function getHitPolicyLabel(policy: HitPolicy): string {
  const labels: Record<HitPolicy, string> = {
    UNIQUE: 'Уникальный',
    FIRST: 'Первый',
    ANY: 'Любой',
    COLLECT: 'Собрать все',
    RULE_ORDER: 'По порядку правил',
  };
  return labels[policy] || policy;
}

export function getHitPolicyDescription(policy: HitPolicy): string {
  const descriptions: Record<HitPolicy, string> = {
    UNIQUE: 'Должно сработать только одно правило',
    FIRST: 'Возвращается результат первого сработавшего правила',
    ANY: 'Все сработавшие правила должны дать одинаковый результат',
    COLLECT: 'Собираются результаты всех сработавших правил',
    RULE_ORDER: 'Возвращаются результаты всех правил в порядке их определения',
  };
  return descriptions[policy] || '';
}

export function getOperatorLabel(operator: string): string {
  const labels: Record<string, string> = {
    eq: '=',
    neq: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    in: 'в списке',
    not_in: 'не в списке',
    contains: 'содержит',
    between: 'между',
    any: 'любое',
  };
  return labels[operator] || operator;
}

export function getColumnTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    string: 'Строка',
    number: 'Число',
    boolean: 'Логический',
    date: 'Дата',
  };
  return labels[type] || type;
}

export function generateRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateColumnId(): string {
  return `col-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
