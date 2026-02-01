import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WorkspaceEntity } from './entity.entity';
import { Workspace } from '../workspace/workspace.entity';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';
import { EventsGateway } from '../websocket/events.gateway';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class EntityService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    private dataSource: DataSource,
    private eventsGateway: EventsGateway,
    private s3Service: S3Service,
  ) {}

  async findAll(workspaceId?: string): Promise<WorkspaceEntity[]> {
    return this.entityRepository.find({
      where: workspaceId ? { workspaceId } : {},
      relations: ['assignee'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<any> {
    const entity = await this.entityRepository.findOne({
      where: { id },
      relations: ['assignee', 'comments', 'comments.author'],
    });
    if (!entity) {
      throw new NotFoundException(`Entity ${id} not found`);
    }

    // Generate signed URLs for all comment attachments
    if (entity.comments && entity.comments.length > 0) {
      const allKeys: string[] = [];
      for (const comment of entity.comments) {
        for (const att of comment.attachments || []) {
          if (att.key) allKeys.push(att.key);
          if (att.thumbnailKey) allKeys.push(att.thumbnailKey);
        }
      }

      if (allKeys.length > 0) {
        const signedUrls = await this.s3Service.getSignedUrlsBatch(allKeys);

        // Map attachments with signed URLs
        const commentsWithUrls = entity.comments.map((comment) => ({
          ...comment,
          attachments: (comment.attachments || []).map((att) => ({
            id: att.id,
            name: att.name,
            size: att.size,
            mimeType: att.mimeType,
            key: att.key,
            url: signedUrls.get(att.key) || '',
            thumbnailUrl: att.thumbnailKey
              ? signedUrls.get(att.thumbnailKey)
              : undefined,
          })),
        }));

        return { ...entity, comments: commentsWithUrls };
      }
    }

    return entity;
  }

  async create(dto: CreateEntityDto): Promise<WorkspaceEntity> {
    // Генерируем customId в транзакции для избежания дублирования номеров
    const saved = await this.dataSource.transaction(async (manager) => {
      // Получаем workspace с блокировкой для обновления
      const workspace = await manager.findOne(Workspace, {
        where: { id: dto.workspaceId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!workspace) {
        throw new NotFoundException(`Workspace ${dto.workspaceId} not found`);
      }

      // Инкрементируем счётчик и генерируем customId
      workspace.lastEntityNumber += 1;
      const customId = `${workspace.prefix}-${workspace.lastEntityNumber}`;

      // Сохраняем обновлённый workspace
      await manager.save(Workspace, workspace);

      // Создаём entity с сгенерированным customId
      const entity = manager.create(WorkspaceEntity, {
        ...dto,
        customId,
      });

      return manager.save(WorkspaceEntity, entity);
    });

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

  async removeTestData(): Promise<{ deleted: number }> {
    const testPatterns = [
      'Playwright',
      'Тест карточки',
      'DnD тест',
      'УникальнаяЗаявка',
      'Уведомление ',
      '[E2E]',
    ];

    const entities = await this.entityRepository.find();
    const testEntities = entities.filter((e) =>
      testPatterns.some((pattern) => e.title.includes(pattern)),
    );

    if (testEntities.length > 0) {
      await this.entityRepository.remove(testEntities);
    }

    return { deleted: testEntities.length };
  }
}
