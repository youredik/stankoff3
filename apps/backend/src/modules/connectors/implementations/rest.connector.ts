import { Injectable } from '@nestjs/common';
import { BaseConnector } from '../base/base-connector';
import {
  ConnectorResult,
  ConnectorContext,
  ConnectorConfig,
} from '../interfaces/connector.interface';

export interface RestConnectorInput {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string;
  queryParams?: Record<string, string>;
  timeout?: number;
  // Аутентификация
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'api-key';
    username?: string;
    password?: string;
    token?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  };
  // Обработка ответа
  responseMapping?: Record<string, string>; // { "outputVar": "$.response.path" }
  successStatusCodes?: number[];
}

/**
 * REST/Webhook коннектор для BPMN
 * Позволяет делать HTTP запросы к внешним API из BPMN процессов
 */
@Injectable()
export class RestConnector extends BaseConnector {
  readonly type = 'connector:rest';
  readonly name = 'REST API / Webhook';
  readonly description = 'HTTP запросы к внешним API из BPMN процессов';

  readonly configSchema = {
    type: 'object',
    properties: {
      baseUrl: {
        type: 'string',
        description: 'Базовый URL для запросов',
      },
      defaultHeaders: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Заголовки по умолчанию',
      },
      defaultTimeout: {
        type: 'number',
        default: 30000,
        description: 'Таймаут по умолчанию (мс)',
      },
    },
  };

  readonly inputSchema = {
    type: 'object',
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        description: 'URL запроса (поддерживает шаблоны {variable})',
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        default: 'GET',
        description: 'HTTP метод',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'HTTP заголовки',
      },
      body: {
        oneOf: [{ type: 'object' }, { type: 'string' }],
        description: 'Тело запроса (для POST/PUT/PATCH)',
      },
      queryParams: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Query параметры',
      },
      timeout: {
        type: 'number',
        default: 30000,
        description: 'Таймаут запроса (мс)',
      },
      auth: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['none', 'basic', 'bearer', 'api-key'],
          },
          username: { type: 'string' },
          password: { type: 'string' },
          token: { type: 'string' },
          apiKey: { type: 'string' },
          apiKeyHeader: { type: 'string', default: 'X-API-Key' },
        },
        description: 'Настройки аутентификации',
      },
      responseMapping: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Маппинг полей ответа (JSONPath)',
      },
      successStatusCodes: {
        type: 'array',
        items: { type: 'number' },
        default: [200, 201, 202, 204],
        description: 'Коды статуса, считающиеся успешными',
      },
    },
  };

  readonly outputSchema = {
    type: 'object',
    properties: {
      statusCode: { type: 'number', description: 'HTTP статус код' },
      body: { type: 'object', description: 'Тело ответа (JSON)' },
      headers: { type: 'object', description: 'Заголовки ответа' },
      mappedValues: { type: 'object', description: 'Значения из responseMapping' },
    },
  };

  protected async doExecute(
    input: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const restInput = input as unknown as RestConnectorInput;

    // Интерполяция URL
    const url = this.interpolate(restInput.url, context.variables);

    // Добавляем query параметры
    const urlObj = new URL(url);
    if (restInput.queryParams) {
      for (const [key, value] of Object.entries(restInput.queryParams)) {
        urlObj.searchParams.set(key, this.interpolate(value, context.variables));
      }
    }

    // Формируем заголовки
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...restInput.headers,
    };

    // Добавляем аутентификацию
    if (restInput.auth) {
      this.applyAuth(headers, restInput.auth);
    }

    // Интерполируем тело запроса
    let body: string | undefined;
    if (restInput.body && ['POST', 'PUT', 'PATCH'].includes(restInput.method || 'GET')) {
      if (typeof restInput.body === 'string') {
        body = this.interpolate(restInput.body, context.variables);
      } else {
        // Интерполируем значения в объекте
        body = JSON.stringify(this.interpolateObject(restInput.body, context.variables));
      }
    }

    // Выполняем запрос
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      restInput.timeout || 30000,
    );

    try {
      const response = await fetch(urlObj.toString(), {
        method: restInput.method || 'GET',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Парсим ответ
      let responseBody: unknown;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      // Проверяем статус код
      const successCodes = restInput.successStatusCodes || [200, 201, 202, 204];
      const isSuccess = successCodes.includes(response.status);

      // Маппинг значений
      const mappedValues: Record<string, unknown> = {};
      if (restInput.responseMapping && typeof responseBody === 'object') {
        for (const [outputKey, jsonPath] of Object.entries(restInput.responseMapping)) {
          mappedValues[outputKey] = this.extractJsonPath(
            responseBody as Record<string, unknown>,
            jsonPath,
          );
        }
      }

      // Собираем заголовки ответа
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        success: isSuccess,
        data: {
          statusCode: response.status,
          body: responseBody,
          headers: responseHeaders,
          mappedValues,
        },
        error: isSuccess ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timeout after ${restInput.timeout || 30000}ms`,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Применить аутентификацию к заголовкам
   */
  private applyAuth(
    headers: Record<string, string>,
    auth: RestConnectorInput['auth'],
  ): void {
    if (!auth || auth.type === 'none') return;

    switch (auth.type) {
      case 'basic':
        if (auth.username && auth.password) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString(
            'base64',
          );
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;

      case 'bearer':
        if (auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
        break;

      case 'api-key':
        if (auth.apiKey) {
          headers[auth.apiKeyHeader || 'X-API-Key'] = auth.apiKey;
        }
        break;
    }
  }

  /**
   * Интерполяция значений в объекте
   */
  private interpolateObject(
    obj: Record<string, unknown>,
    variables: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.interpolate(value, variables);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.interpolateObject(
          value as Record<string, unknown>,
          variables,
        );
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'string'
            ? this.interpolate(item, variables)
            : typeof item === 'object'
              ? this.interpolateObject(item as Record<string, unknown>, variables)
              : item,
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Извлечь значение по JSONPath-like пути
   * Поддерживает: $.field.nested, $.array[0], $.array[*].field
   */
  private extractJsonPath(obj: Record<string, unknown>, path: string): unknown {
    // Убираем $. в начале если есть
    const cleanPath = path.startsWith('$.') ? path.slice(2) : path;

    const parts = cleanPath.split(/\.|\[|\]/).filter(Boolean);
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;

      if (part === '*') {
        // Wildcard для массивов
        if (Array.isArray(current)) {
          return current;
        }
        return undefined;
      }

      if (Array.isArray(current)) {
        const index = parseInt(part, 10);
        if (!isNaN(index)) {
          current = current[index];
        } else {
          // Маппинг поля для каждого элемента массива
          current = current.map((item) =>
            typeof item === 'object' && item !== null
              ? (item as Record<string, unknown>)[part]
              : undefined,
          );
        }
      } else if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Валидация - проверяем что URL валиден
   */
  async validate(config?: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (config?.baseUrl) {
      try {
        new URL(config.baseUrl as string);
      } catch {
        return { valid: false, error: 'Invalid base URL' };
      }
    }
    return { valid: true };
  }
}
