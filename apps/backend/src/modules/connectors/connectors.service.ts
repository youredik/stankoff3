import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Camunda8 } from '@camunda8/sdk';
import {
  IConnector,
  ConnectorMetadata,
  ConnectorContext,
} from './interfaces/connector.interface';
import { EmailConnector } from './implementations/email.connector';
import { TelegramConnector } from './implementations/telegram.connector';
import { RestConnector } from './implementations/rest.connector';

/**
 * Сервис управления коннекторами
 * Отвечает за регистрацию коннекторов как Zeebe workers
 */
@Injectable()
export class ConnectorsService implements OnModuleInit {
  private readonly logger = new Logger(ConnectorsService.name);
  private readonly connectors = new Map<string, IConnector>();
  private zeebeClient: ReturnType<Camunda8['getZeebeGrpcApiClient']> | null = null;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly emailConnector: EmailConnector,
    private readonly telegramConnector: TelegramConnector,
    private readonly restConnector: RestConnector,
  ) {}

  async onModuleInit() {
    // Регистрируем все коннекторы
    this.registerConnector(this.emailConnector);
    this.registerConnector(this.telegramConnector);
    this.registerConnector(this.restConnector);

    this.logger.log(
      `Registered ${this.connectors.size} connectors: ${Array.from(this.connectors.keys()).join(', ')}`,
    );
  }

  /**
   * Регистрация коннектора
   */
  registerConnector(connector: IConnector): void {
    if (this.connectors.has(connector.type)) {
      this.logger.warn(`Connector ${connector.type} already registered, skipping`);
      return;
    }

    this.connectors.set(connector.type, connector);
    this.logger.debug(`Registered connector: ${connector.type} (${connector.name})`);
  }

  /**
   * Получить коннектор по типу
   */
  getConnector(type: string): IConnector | undefined {
    return this.connectors.get(type);
  }

  /**
   * Получить все зарегистрированные коннекторы
   */
  getAllConnectors(): ConnectorMetadata[] {
    return Array.from(this.connectors.values()).map((connector) => ({
      type: connector.type,
      name: connector.name,
      description: connector.description,
      category: this.getConnectorCategory(connector.type),
      configSchema: connector.configSchema,
      inputSchema: connector.inputSchema,
      outputSchema: connector.outputSchema,
    }));
  }

  /**
   * Определить категорию коннектора по типу
   */
  private getConnectorCategory(
    type: string,
  ): 'communication' | 'integration' | 'data' | 'utility' {
    if (type.includes('email') || type.includes('telegram')) {
      return 'communication';
    }
    if (type.includes('rest') || type.includes('webhook')) {
      return 'integration';
    }
    return 'utility';
  }

  /**
   * Установить Zeebe клиент и зарегистрировать workers
   */
  setZeebeClient(client: ReturnType<Camunda8['getZeebeGrpcApiClient']>): void {
    this.zeebeClient = client;
    this.registerZeebeWorkers();
  }

  /**
   * Регистрация Zeebe workers для всех коннекторов
   */
  private registerZeebeWorkers(): void {
    if (!this.zeebeClient) {
      this.logger.warn('Zeebe client not available, skipping connector workers registration');
      return;
    }

    for (const [type, connector] of this.connectors) {
      this.registerWorkerForConnector(type, connector);
    }

    this.logger.log(`Registered ${this.connectors.size} connector workers in Zeebe`);
  }

  /**
   * Регистрация одного Zeebe worker для коннектора
   */
  private registerWorkerForConnector(type: string, connector: IConnector): void {
    this.zeebeClient!.createWorker({
      taskType: type,
      taskHandler: async (job) => {
        const startTime = Date.now();

        this.logger.log(
          `[${type}] Job ${job.key} started for process ${job.processInstanceKey}`,
        );

        try {
          // Собираем контекст
          const context: ConnectorContext = {
            processInstanceKey: String(job.processInstanceKey),
            workspaceId: job.variables.workspaceId as string,
            entityId: job.variables.entityId as string,
            userId: job.variables.userId as string,
            variables: job.variables as Record<string, unknown>,
          };

          // Выполняем коннектор
          const result = await connector.execute(
            job.variables as Record<string, unknown>,
            context,
          );

          const duration = Date.now() - startTime;

          if (result.success) {
            this.logger.log(
              `[${type}] Job ${job.key} completed successfully in ${duration}ms`,
            );

            return job.complete({
              ...result.data,
              _connectorResult: {
                success: true,
                executionTimeMs: result.executionTimeMs,
              },
            });
          } else {
            this.logger.warn(
              `[${type}] Job ${job.key} failed: ${result.error} (${duration}ms)`,
            );

            // Для некритичных ошибок - завершаем job но с флагом ошибки
            return job.complete({
              _connectorResult: {
                success: false,
                error: result.error,
                executionTimeMs: result.executionTimeMs,
              },
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          this.logger.error(
            `[${type}] Job ${job.key} threw exception: ${errorMessage}`,
            error instanceof Error ? error.stack : undefined,
          );

          // При исключении - fail с retry
          return job.fail({
            errorMessage,
            retries: job.retries - 1,
          });
        }
      },
    });
  }

  /**
   * Выполнить коннектор напрямую (без Zeebe)
   * Используется для тестирования и предпросмотра
   */
  async executeConnector(
    type: string,
    input: Record<string, unknown>,
    context: Partial<ConnectorContext> = {},
  ): Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  }> {
    const connector = this.connectors.get(type);

    if (!connector) {
      return {
        success: false,
        error: `Connector ${type} not found`,
      };
    }

    const fullContext: ConnectorContext = {
      processInstanceKey: context.processInstanceKey || 'direct-execution',
      workspaceId: context.workspaceId,
      entityId: context.entityId,
      userId: context.userId,
      variables: { ...input, ...context.variables },
    };

    return connector.execute(input, fullContext);
  }

  /**
   * Валидировать конфигурацию коннектора
   */
  async validateConnector(
    type: string,
    config: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }> {
    const connector = this.connectors.get(type);

    if (!connector) {
      return { valid: false, error: `Connector ${type} not found` };
    }

    if (connector.validate) {
      return connector.validate(config);
    }

    return { valid: true };
  }
}
