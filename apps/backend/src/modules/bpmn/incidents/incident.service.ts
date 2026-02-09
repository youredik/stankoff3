import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProcessInstance,
  ProcessInstanceStatus,
} from '../entities/process-instance.entity';
import { BpmnService } from '../bpmn.service';
import { EventsGateway } from '../../websocket/events.gateway';

export interface IncidentInfo {
  id: string;
  processInstanceKey: string;
  processDefinitionKey: string;
  definitionName?: string;
  entityId?: string;
  entityTitle?: string;
  entityCustomId?: string;
  workspaceId: string;
  errorMessage?: string;
  startedAt: Date;
  updatedAt: Date;
  variables: Record<string, any>;
}

@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  constructor(
    @InjectRepository(ProcessInstance)
    private readonly instanceRepository: Repository<ProcessInstance>,
    @Inject(forwardRef(() => BpmnService))
    private readonly bpmnService: BpmnService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * Get all incidents for a workspace
   */
  async findIncidents(workspaceId: string): Promise<IncidentInfo[]> {
    const instances = await this.instanceRepository
      .createQueryBuilder('pi')
      .leftJoinAndSelect('pi.processDefinition', 'pd')
      .leftJoinAndSelect('pi.entity', 'entity')
      .where('pi.workspaceId = :workspaceId', { workspaceId })
      .andWhere('pi.status = :status', { status: ProcessInstanceStatus.INCIDENT })
      .orderBy('pi.updatedAt', 'DESC')
      .getMany();

    return instances.map((pi) => ({
      id: pi.id,
      processInstanceKey: pi.processInstanceKey,
      processDefinitionKey: pi.processDefinitionKey,
      definitionName: pi.processDefinition?.name,
      entityId: pi.entityId ?? undefined,
      entityTitle: pi.entity?.title,
      entityCustomId: pi.entity?.customId,
      workspaceId: pi.workspaceId,
      errorMessage: pi.variables?.lastError as string | undefined,
      startedAt: pi.startedAt,
      updatedAt: pi.updatedAt,
      variables: pi.variables,
    }));
  }

  /**
   * Get incident count per workspace
   */
  async getIncidentCount(workspaceId: string): Promise<number> {
    return this.instanceRepository.count({
      where: {
        workspaceId,
        status: ProcessInstanceStatus.INCIDENT,
      },
    });
  }

  /**
   * Mark a process instance as incident
   */
  async markAsIncident(
    processInstanceKey: string,
    errorMessage: string,
  ): Promise<void> {
    const instance = await this.instanceRepository.findOne({
      where: { processInstanceKey },
    });
    if (!instance) return;

    instance.status = ProcessInstanceStatus.INCIDENT;
    instance.variables = {
      ...instance.variables,
      lastError: errorMessage,
      incidentAt: new Date().toISOString(),
    };
    await this.instanceRepository.save(instance);

    this.eventsGateway.emitToWorkspace(instance.workspaceId, 'process:incident', {
      processInstanceId: instance.id,
      processInstanceKey: instance.processInstanceKey,
      errorMessage,
    });

    this.logger.warn(
      `Process instance ${processInstanceKey} marked as incident: ${errorMessage}`,
    );
  }

  /**
   * Cancel an incident (terminates the process instance)
   */
  async cancelIncident(instanceId: string): Promise<void> {
    const instance = await this.instanceRepository.findOne({
      where: { id: instanceId },
    });
    if (!instance) {
      throw new NotFoundException(`Process instance ${instanceId} not found`);
    }

    await this.bpmnService.cancelInstance(instance.processInstanceKey);
    this.logger.log(`Incident cancelled for instance ${instance.processInstanceKey}`);
  }

  /**
   * Resolve incident by re-deploying and restarting
   * Note: Zeebe doesn't support direct incident retry via gRPC from outside.
   * Instead we cancel the old instance and re-create.
   */
  async retryIncident(instanceId: string): Promise<ProcessInstance> {
    const instance = await this.instanceRepository.findOne({
      where: { id: instanceId },
      relations: ['processDefinition'],
    });
    if (!instance) {
      throw new NotFoundException(`Process instance ${instanceId} not found`);
    }

    // Reset status to active so the user can re-start manually
    instance.status = ProcessInstanceStatus.ACTIVE;
    instance.variables = {
      ...instance.variables,
      lastError: undefined,
      incidentAt: undefined,
      retriedAt: new Date().toISOString(),
    };
    await this.instanceRepository.save(instance);

    this.logger.log(`Incident retried for instance ${instance.processInstanceKey}`);
    return instance;
  }
}
