import { Logger } from '@nestjs/common';
import {
  IConnector,
  ConnectorConfig,
  ConnectorResult,
  ConnectorContext,
} from '../interfaces/connector.interface';

/**
 * Базовый абстрактный класс для коннекторов
 * Предоставляет общую логику логирования, обработки ошибок и метрик
 */
export abstract class BaseConnector implements IConnector {
  protected readonly logger: Logger;

  abstract readonly type: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly configSchema: Record<string, unknown>;
  abstract readonly inputSchema: Record<string, unknown>;
  abstract readonly outputSchema: Record<string, unknown>;

  constructor() {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Основной метод выполнения с обёрткой для логирования и метрик
   */
  async execute(
    input: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const startTime = Date.now();

    this.logger.log(
      `[${this.type}] Executing for process ${context.processInstanceKey}`,
    );
    this.logger.debug(`Input: ${JSON.stringify(input)}`);

    try {
      // Валидация входных данных
      const validationError = this.validateInput(input);
      if (validationError) {
        return {
          success: false,
          error: validationError,
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Выполнение основной логики
      const result = await this.doExecute(input, context);

      this.logger.log(
        `[${this.type}] Completed in ${Date.now() - startTime}ms, success=${result.success}`,
      );

      return {
        ...result,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[${this.type}] Failed after ${Date.now() - startTime}ms: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        success: false,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Абстрактный метод - реализуется в конкретных коннекторах
   */
  protected abstract doExecute(
    input: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult>;

  /**
   * Валидация входных данных (может быть переопределена)
   */
  protected validateInput(input: Record<string, unknown>): string | null {
    // Базовая валидация - проверяем обязательные поля из inputSchema
    const required = (this.inputSchema.required as string[]) || [];

    for (const field of required) {
      if (input[field] === undefined || input[field] === null || input[field] === '') {
        return `Missing required field: ${field}`;
      }
    }

    return null;
  }

  /**
   * Метод валидации конфигурации (по умолчанию возвращает valid=true)
   */
  async validate(
    _config: ConnectorConfig,
  ): Promise<{ valid: boolean; error?: string }> {
    return { valid: true };
  }

  /**
   * Хелпер для интерполяции переменных в строке
   * Поддерживает шаблоны вида {variable} и ${variable}
   */
  protected interpolate(
    template: string,
    variables: Record<string, unknown>,
  ): string {
    return template.replace(/\{(\w+)\}|\$\{(\w+)\}/g, (_, p1, p2) => {
      const key = p1 || p2;
      const value = variables[key];
      return value !== undefined ? String(value) : '';
    });
  }

  /**
   * Хелпер для безопасного получения вложенного значения
   */
  protected getNestedValue(
    obj: Record<string, unknown>,
    path: string,
  ): unknown {
    return path.split('.').reduce((current: unknown, key) => {
      if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}
