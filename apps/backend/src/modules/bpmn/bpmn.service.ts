import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camunda8 } from '@camunda8/sdk';
import { ProcessDefinition } from './entities/process-definition.entity';
import {
  ProcessInstance,
  ProcessInstanceStatus,
} from './entities/process-instance.entity';

@Injectable()
export class BpmnService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BpmnService.name);
  private camunda: Camunda8;
  private zeebeClient: ReturnType<Camunda8['getZeebeGrpcApiClient']>;
  private isConnected = false;

  constructor(
    @InjectRepository(ProcessDefinition)
    private processDefinitionRepository: Repository<ProcessDefinition>,
    @InjectRepository(ProcessInstance)
    private processInstanceRepository: Repository<ProcessInstance>,
  ) {}

  async onModuleInit() {
    const zeebeAddress = process.env.ZEEBE_ADDRESS || 'localhost:26500';

    this.logger.log(`Initializing Camunda SDK, Zeebe address: ${zeebeAddress}`);

    try {
      this.camunda = new Camunda8({
        ZEEBE_GRPC_ADDRESS: zeebeAddress,
        ZEEBE_REST_ADDRESS:
          process.env.ZEEBE_REST_ADDRESS || 'http://localhost:8088',
        CAMUNDA_AUTH_STRATEGY: 'NONE',
        CAMUNDA_SECURE_CONNECTION: process.env.CAMUNDA_SECURE_CONNECTION === 'true',
      });

      this.zeebeClient = this.camunda.getZeebeGrpcApiClient();

      const topology = await this.zeebeClient.topology();
      this.isConnected = true;
      this.logger.log(
        `Connected to Zeebe cluster: ${topology.brokers.length} broker(s)`,
      );

      await this.registerWorkers();
    } catch (error) {
      this.logger.warn(
        `Failed to connect to Zeebe: ${error.message}. BPMN features will be unavailable.`,
      );
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.zeebeClient) {
      await this.zeebeClient.close();
      this.logger.log('Zeebe client closed');
    }
  }

  // ==================== Health Check ====================

  isZeebeConnected(): boolean {
    return this.isConnected;
  }

  async getHealth(): Promise<{
    connected: boolean;
    brokers?: number;
  }> {
    if (!this.isConnected || !this.zeebeClient) {
      return { connected: false };
    }

    try {
      const topology = await this.zeebeClient.topology();
      return {
        connected: true,
        brokers: topology.brokers.length,
      };
    } catch {
      return { connected: false };
    }
  }

  // ==================== Process Definitions ====================

  async findAllDefinitions(workspaceId: string): Promise<ProcessDefinition[]> {
    return this.processDefinitionRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      relations: ['createdBy'],
    });
  }

  async findDefinition(id: string): Promise<ProcessDefinition> {
    const definition = await this.processDefinitionRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!definition) {
      throw new NotFoundException(`Process definition ${id} not found`);
    }
    return definition;
  }

  async createDefinition(
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      processId: string;
      bpmnXml: string;
      isDefault?: boolean;
    },
    createdById?: string,
  ): Promise<ProcessDefinition> {
    const definition = this.processDefinitionRepository.create({
      workspaceId,
      ...data,
      createdById,
    });
    return this.processDefinitionRepository.save(definition);
  }

  async deployDefinition(id: string): Promise<ProcessDefinition> {
    const definition = await this.findDefinition(id);

    if (!this.isConnected) {
      throw new Error('Zeebe is not connected. Cannot deploy process.');
    }

    const deployment = await this.zeebeClient.deployResource({
      process: Buffer.from(definition.bpmnXml),
      name: `${definition.processId}.bpmn`,
    });

    const deployedProcess = deployment.deployments[0]?.process;
    if (deployedProcess) {
      definition.deployedKey = String(deployedProcess.processDefinitionKey);
      definition.version = deployedProcess.version;
      definition.deployedAt = new Date();
      await this.processDefinitionRepository.save(definition);
    }

    this.logger.log(
      `Deployed process ${definition.processId}, key: ${definition.deployedKey}`,
    );

    return definition;
  }

  // ==================== Process Instances ====================

  async startProcess(
    definitionId: string,
    variables: Record<string, any>,
    options: {
      entityId?: string;
      businessKey?: string;
      startedById?: string;
    } = {},
  ): Promise<ProcessInstance> {
    const definition = await this.findDefinition(definitionId);

    if (!definition.deployedKey) {
      throw new Error(
        'Process definition is not deployed. Deploy it first before starting instances.',
      );
    }

    if (!this.isConnected) {
      throw new Error('Zeebe is not connected. Cannot start process.');
    }

    const result = await this.zeebeClient.createProcessInstance({
      bpmnProcessId: definition.processId,
      variables: {
        ...variables,
        entityId: options.entityId,
        workspaceId: definition.workspaceId,
      },
    });

    const instance = this.processInstanceRepository.create({
      workspaceId: definition.workspaceId,
      entityId: options.entityId,
      processDefinitionId: definitionId,
      processDefinitionKey: definition.deployedKey,
      processInstanceKey: String(result.processInstanceKey),
      businessKey: options.businessKey || options.entityId,
      variables,
      startedById: options.startedById,
      status: ProcessInstanceStatus.ACTIVE,
    });

    await this.processInstanceRepository.save(instance);

    this.logger.log(
      `Started process instance ${instance.processInstanceKey} for entity ${options.entityId}`,
    );

    return instance;
  }

  async findInstancesByEntity(entityId: string): Promise<ProcessInstance[]> {
    return this.processInstanceRepository.find({
      where: { entityId },
      order: { startedAt: 'DESC' },
    });
  }

  async findInstancesByWorkspace(
    workspaceId: string,
  ): Promise<ProcessInstance[]> {
    return this.processInstanceRepository.find({
      where: { workspaceId },
      order: { startedAt: 'DESC' },
      take: 100,
    });
  }

  async updateInstanceStatus(
    processInstanceKey: string,
    status: ProcessInstanceStatus,
  ): Promise<void> {
    await this.processInstanceRepository.update(
      { processInstanceKey },
      {
        status,
        completedAt:
          status === ProcessInstanceStatus.COMPLETED ? new Date() : undefined,
      },
    );
  }

  // ==================== Statistics ====================

  async getDefinitionStatistics(definitionId: string): Promise<{
    total: number;
    active: number;
    completed: number;
    terminated: number;
    incident: number;
    avgDurationMs: number | null;
  }> {
    const definition = await this.findDefinition(definitionId);

    const stats = await this.processInstanceRepository
      .createQueryBuilder('instance')
      .select('instance.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        'AVG(EXTRACT(EPOCH FROM (instance.completedAt - instance.startedAt)) * 1000)',
        'avgDuration',
      )
      .where('instance.processDefinitionId = :definitionId', { definitionId })
      .groupBy('instance.status')
      .getRawMany();

    const result = {
      total: 0,
      active: 0,
      completed: 0,
      terminated: 0,
      incident: 0,
      avgDurationMs: null as number | null,
    };

    let totalDuration = 0;
    let completedCount = 0;

    for (const row of stats) {
      const count = parseInt(row.count, 10);
      result.total += count;

      switch (row.status) {
        case ProcessInstanceStatus.ACTIVE:
          result.active = count;
          break;
        case ProcessInstanceStatus.COMPLETED:
          result.completed = count;
          completedCount = count;
          if (row.avgDuration) {
            totalDuration = parseFloat(row.avgDuration) * count;
          }
          break;
        case ProcessInstanceStatus.TERMINATED:
          result.terminated = count;
          break;
        case ProcessInstanceStatus.INCIDENT:
          result.incident = count;
          break;
      }
    }

    if (completedCount > 0) {
      result.avgDurationMs = Math.round(totalDuration / completedCount);
    }

    return result;
  }

  async getWorkspaceStatistics(workspaceId: string): Promise<{
    definitions: number;
    deployedDefinitions: number;
    totalInstances: number;
    activeInstances: number;
    completedInstances: number;
  }> {
    const [definitions, deployedDefinitions] = await Promise.all([
      this.processDefinitionRepository.count({ where: { workspaceId } }),
      this.processDefinitionRepository.count({
        where: { workspaceId, deployedKey: undefined },
      }).then((notDeployed) =>
        this.processDefinitionRepository
          .count({ where: { workspaceId } })
          .then((total) => total - notDeployed),
      ),
    ]);

    const instanceStats = await this.processInstanceRepository
      .createQueryBuilder('instance')
      .select('instance.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('instance.workspaceId = :workspaceId', { workspaceId })
      .groupBy('instance.status')
      .getRawMany();

    let totalInstances = 0;
    let activeInstances = 0;
    let completedInstances = 0;

    for (const row of instanceStats) {
      const count = parseInt(row.count, 10);
      totalInstances += count;
      if (row.status === ProcessInstanceStatus.ACTIVE) {
        activeInstances = count;
      } else if (row.status === ProcessInstanceStatus.COMPLETED) {
        completedInstances = count;
      }
    }

    return {
      definitions,
      deployedDefinitions,
      totalInstances,
      activeInstances,
      completedInstances,
    };
  }

  // ==================== Messages ====================

  async sendMessage(
    messageName: string,
    correlationKey: string,
    variables?: Record<string, any>,
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Zeebe is not connected. Cannot send message.');
    }

    await this.zeebeClient.publishMessage({
      name: messageName,
      correlationKey,
      variables: variables || {},
      timeToLive: 60000,
    });

    this.logger.log(
      `Published message ${messageName} with correlation key ${correlationKey}`,
    );
  }

  // ==================== Workers ====================

  private async registerWorkers() {
    if (!this.zeebeClient) return;

    // Worker: Update entity status
    this.zeebeClient.createWorker({
      taskType: 'update-entity-status',
      taskHandler: async (job) => {
        const { entityId, newStatus } = job.variables as {
          entityId: string;
          newStatus: string;
        };

        this.logger.log(
          `[Worker] update-entity-status: entity=${entityId}, status=${newStatus}`,
        );

        // TODO: Inject EntityService and call updateStatus
        // For now, just complete the job
        return job.complete({ statusUpdated: true, updatedAt: new Date().toISOString() });
      },
    });

    // Worker: Send notification
    this.zeebeClient.createWorker({
      taskType: 'send-notification',
      taskHandler: async (job) => {
        const { userId, message, entityId } = job.variables as {
          userId: string;
          message: string;
          entityId: string;
        };

        this.logger.log(
          `[Worker] send-notification: user=${userId}, entity=${entityId}`,
        );

        // TODO: Inject NotificationService
        return job.complete({ notificationSent: true });
      },
    });

    // Worker: Send email
    this.zeebeClient.createWorker({
      taskType: 'send-email',
      taskHandler: async (job) => {
        const { to, subject } = job.variables as {
          to: string;
          subject: string;
          body: string;
        };

        this.logger.log(`[Worker] send-email: to=${to}, subject=${subject}`);

        // TODO: Inject EmailService
        return job.complete({ emailSent: true });
      },
    });

    // Worker: Log activity
    this.zeebeClient.createWorker({
      taskType: 'log-activity',
      taskHandler: async (job) => {
        const { entityId, action, details } = job.variables as {
          entityId: string;
          action: string;
          details: Record<string, any>;
        };

        this.logger.log(
          `[Worker] log-activity: entity=${entityId}, action=${action}`,
        );

        // TODO: Inject AuditLogService
        return job.complete({ logged: true });
      },
    });

    this.logger.log('BPMN workers registered: update-entity-status, send-notification, send-email, log-activity');
  }
}
