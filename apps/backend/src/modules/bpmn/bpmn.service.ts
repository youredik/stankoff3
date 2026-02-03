import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camunda8 } from '@camunda8/sdk';
import { ProcessDefinition } from './entities/process-definition.entity';
import {
  ProcessInstance,
  ProcessInstanceStatus,
} from './entities/process-instance.entity';
import { BpmnWorkersService } from './bpmn-workers.service';

@Injectable()
export class BpmnService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BpmnService.name);
  private camunda: Camunda8 | null = null;
  private zeebeClient: ReturnType<Camunda8['getZeebeGrpcApiClient']> | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000; // 5 seconds
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(ProcessDefinition)
    private processDefinitionRepository: Repository<ProcessDefinition>,
    @InjectRepository(ProcessInstance)
    private processInstanceRepository: Repository<ProcessInstance>,
    @Inject(forwardRef(() => BpmnWorkersService))
    private workersService: BpmnWorkersService,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.zeebeClient) {
      try {
        await this.zeebeClient.close();
        this.logger.log('Zeebe client closed');
      } catch (error) {
        this.logger.warn(`Error closing Zeebe client: ${error.message}`);
      }
    }
  }

  /**
   * Connect to Zeebe with auto-reconnect support
   */
  private async connect(): Promise<void> {
    const zeebeAddress = process.env.ZEEBE_ADDRESS || 'localhost:26500';
    const zeebeRestAddress = process.env.ZEEBE_REST_ADDRESS || 'http://localhost:8088';

    this.logger.log(`Connecting to Zeebe at ${zeebeAddress}...`);

    try {
      // Determine auth strategy based on environment variables
      const clientId = process.env.ZEEBE_CLIENT_ID;
      const clientSecret = process.env.ZEEBE_CLIENT_SECRET;
      const authStrategy = clientId && clientSecret ? 'OAUTH' : 'NONE';

      this.camunda = new Camunda8({
        ZEEBE_GRPC_ADDRESS: zeebeAddress,
        ZEEBE_REST_ADDRESS: zeebeRestAddress,
        CAMUNDA_AUTH_STRATEGY: authStrategy,
        CAMUNDA_SECURE_CONNECTION: process.env.CAMUNDA_SECURE_CONNECTION === 'true',
        ...(authStrategy === 'OAUTH' && {
          ZEEBE_CLIENT_ID: clientId,
          ZEEBE_CLIENT_SECRET: clientSecret,
          CAMUNDA_OAUTH_URL: process.env.CAMUNDA_OAUTH_URL,
        }),
      });

      this.zeebeClient = this.camunda.getZeebeGrpcApiClient();

      const topology = await this.zeebeClient.topology();
      this.isConnected = true;
      this.reconnectAttempts = 0;

      this.logger.log(
        `Connected to Zeebe cluster: ${topology.brokers.length} broker(s), partitions: ${topology.partitionsCount}`,
      );

      // Pass the client to workers service
      this.workersService.setZeebeClient(this.zeebeClient);
    } catch (error) {
      this.isConnected = false;
      this.reconnectAttempts++;

      if (this.reconnectAttempts <= this.maxReconnectAttempts) {
        this.logger.warn(
          `Failed to connect to Zeebe (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}): ${error.message}. Retrying in ${this.reconnectDelay / 1000}s...`,
        );
        this.scheduleReconnect();
      } else {
        this.logger.warn(
          `Failed to connect to Zeebe after ${this.maxReconnectAttempts} attempts. BPMN features will be unavailable. Error: ${error.message}`,
        );
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  /**
   * Manually trigger reconnection
   */
  async reconnect(): Promise<boolean> {
    this.reconnectAttempts = 0;
    await this.connect();
    return this.isConnected;
  }

  // ==================== Health Check ====================

  isZeebeConnected(): boolean {
    return this.isConnected;
  }

  async getHealth(): Promise<{
    connected: boolean;
    brokers?: number;
    partitions?: number;
    clusterSize?: number;
  }> {
    if (!this.isConnected || !this.zeebeClient) {
      return { connected: false };
    }

    try {
      const topology = await this.zeebeClient.topology();
      return {
        connected: true,
        brokers: topology.brokers.length,
        partitions: topology.partitionsCount,
        clusterSize: topology.clusterSize,
      };
    } catch {
      this.isConnected = false;
      this.scheduleReconnect();
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
    // Check if definition with same processId exists in workspace
    const existing = await this.processDefinitionRepository.findOne({
      where: { workspaceId, processId: data.processId },
    });

    if (existing) {
      // Update existing definition
      existing.name = data.name;
      existing.description = data.description ?? existing.description;
      existing.bpmnXml = data.bpmnXml;
      existing.isDefault = data.isDefault ?? existing.isDefault;
      return this.processDefinitionRepository.save(existing);
    }

    // Create new definition
    const definition = this.processDefinitionRepository.create({
      workspaceId,
      ...data,
      createdById,
    });
    return this.processDefinitionRepository.save(definition);
  }

  async deployDefinition(id: string): Promise<ProcessDefinition> {
    const definition = await this.findDefinition(id);

    if (!this.isConnected || !this.zeebeClient) {
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
      `Deployed process ${definition.processId}, key: ${definition.deployedKey}, version: ${definition.version}`,
    );

    return definition;
  }

  async deleteDefinition(id: string): Promise<void> {
    const definition = await this.findDefinition(id);

    // Check if there are active instances
    const activeInstances = await this.processInstanceRepository.count({
      where: { processDefinitionId: id, status: ProcessInstanceStatus.ACTIVE },
    });

    if (activeInstances > 0) {
      throw new Error(
        `Cannot delete process definition with ${activeInstances} active instance(s)`,
      );
    }

    await this.processDefinitionRepository.remove(definition);
    this.logger.log(`Deleted process definition ${id}`);
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

    if (!this.isConnected || !this.zeebeClient) {
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
      relations: ['processDefinition'],
    });
  }

  async findInstancesByWorkspace(
    workspaceId: string,
  ): Promise<ProcessInstance[]> {
    return this.processInstanceRepository.find({
      where: { workspaceId },
      order: { startedAt: 'DESC' },
      relations: ['processDefinition'],
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
          status === ProcessInstanceStatus.COMPLETED ||
          status === ProcessInstanceStatus.TERMINATED
            ? new Date()
            : undefined,
      },
    );
  }

  async cancelInstance(processInstanceKey: string): Promise<void> {
    if (!this.isConnected || !this.zeebeClient) {
      throw new Error('Zeebe is not connected. Cannot cancel instance.');
    }

    await this.zeebeClient.cancelProcessInstance(processInstanceKey as unknown as string);
    await this.updateInstanceStatus(
      processInstanceKey,
      ProcessInstanceStatus.TERMINATED,
    );

    this.logger.log(`Cancelled process instance ${processInstanceKey}`);
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
    // Validate definition exists
    await this.findDefinition(definitionId);

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
      this.processDefinitionRepository
        .createQueryBuilder('def')
        .where('def.workspaceId = :workspaceId', { workspaceId })
        .andWhere('def.deployedKey IS NOT NULL')
        .getCount(),
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
    if (!this.isConnected || !this.zeebeClient) {
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
}
