import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceEntity } from './entity.entity';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';
import { EventsGateway } from '../websocket/events.gateway';

@Injectable()
export class EntityService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
    private eventsGateway: EventsGateway,
  ) {}

  async findAll(workspaceId?: string): Promise<WorkspaceEntity[]> {
    return this.entityRepository.find({
      where: workspaceId ? { workspaceId } : {},
      relations: ['assignee'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<WorkspaceEntity> {
    const entity = await this.entityRepository.findOne({
      where: { id },
      relations: ['assignee', 'comments', 'comments.author'],
    });
    if (!entity) {
      throw new NotFoundException(`Entity ${id} not found`);
    }
    return entity;
  }

  async create(dto: CreateEntityDto): Promise<WorkspaceEntity> {
    const entity = this.entityRepository.create(dto);
    const saved = await this.entityRepository.save(entity);
    this.eventsGateway.emitEntityCreated(saved);
    return saved;
  }

  async update(id: string, dto: UpdateEntityDto): Promise<WorkspaceEntity> {
    await this.findOne(id);
    await this.entityRepository.update(id, dto);
    const updated = await this.findOne(id);
    this.eventsGateway.emitEntityUpdated(updated);
    return updated;
  }

  async updateStatus(id: string, status: string): Promise<WorkspaceEntity> {
    await this.findOne(id);
    await this.entityRepository.update(id, { status });
    const updated = await this.findOne(id);
    this.eventsGateway.emitStatusChanged({ id, status, entity: updated });
    return updated;
  }

  async updateAssignee(
    id: string,
    assigneeId: string | null,
  ): Promise<WorkspaceEntity> {
    const current = await this.findOne(id);
    const previousAssigneeId = current.assigneeId;
    await this.entityRepository.update(id, { assigneeId });
    const updated = await this.findOne(id);
    this.eventsGateway.emitEntityUpdated(updated);
    // Emit specific assignee change event for notifications
    if (assigneeId !== previousAssigneeId) {
      this.eventsGateway.emitAssigneeChanged({
        entityId: id,
        entity: updated,
        assigneeId,
        previousAssigneeId,
      });
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.entityRepository.remove(entity);
  }
}
