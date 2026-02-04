/**
 * Интерфейс коннектора для BPMN service tasks
 * Все коннекторы реализуют этот интерфейс
 */

export interface ConnectorConfig {
  [key: string]: unknown;
}

export interface ConnectorResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  executionTimeMs?: number;
}

export interface ConnectorContext {
  processInstanceKey: string;
  workspaceId?: string;
  entityId?: string;
  userId?: string;
  variables: Record<string, unknown>;
}

/**
 * Абстрактный интерфейс коннектора
 */
export interface IConnector {
  /**
   * Уникальный тип коннектора (используется как taskType в Zeebe)
   */
  readonly type: string;

  /**
   * Человекочитаемое название
   */
  readonly name: string;

  /**
   * Описание коннектора
   */
  readonly description: string;

  /**
   * JSON Schema для конфигурации
   */
  readonly configSchema: Record<string, unknown>;

  /**
   * JSON Schema для входных данных
   */
  readonly inputSchema: Record<string, unknown>;

  /**
   * JSON Schema для выходных данных
   */
  readonly outputSchema: Record<string, unknown>;

  /**
   * Выполнить действие коннектора
   */
  execute(input: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorResult>;

  /**
   * Проверить конфигурацию (например, тестовый запрос)
   */
  validate?(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }>;
}

/**
 * Метаданные коннектора для регистрации
 */
export interface ConnectorMetadata {
  type: string;
  name: string;
  description: string;
  category: 'communication' | 'integration' | 'data' | 'utility';
  icon?: string;
  configSchema: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}
