import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { WorkspaceEntity } from './entity.entity';
import { Workspace } from '../workspace/workspace.entity';
import { User } from '../user/user.entity';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';
import { EventsGateway } from '../websocket/events.gateway';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class EntityService {
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
    private eventsGateway: EventsGateway,
    private s3Service: S3Service,
    @Inject(forwardRef(() => AuditLogService))
    private auditLogService: AuditLogService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
  }

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

  async create(dto: CreateEntityDto, actorId?: string): Promise<WorkspaceEntity> {
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

    // Логирование создания
    if (actorId) {
      await this.auditLogService.log(
        AuditActionType.ENTITY_CREATED,
        dto.workspaceId,
        actorId,
        {
          description: 'Создана заявка',
          newValues: { title: saved.title, status: saved.status, customId: saved.customId },
        },
        saved.id,
      );
    }

    return saved;
  }

  async update(id: string, dto: UpdateEntityDto, actorId?: string): Promise<WorkspaceEntity> {
    const current = await this.findOne(id);
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};
    const changedFields: string[] = [];

    // Определяем изменённые поля
    for (const key of Object.keys(dto)) {
      if (current[key] !== (dto as any)[key]) {
        oldValues[key] = current[key];
        newValues[key] = (dto as any)[key];
        changedFields.push(key);
      }
    }

    await this.entityRepository.update(id, dto);
    const updated = await this.findOne(id);
    this.eventsGateway.emitEntityUpdated(updated);

    // Логирование обновления
    if (actorId && changedFields.length > 0) {
      await this.auditLogService.log(
        AuditActionType.ENTITY_UPDATED,
        current.workspaceId,
        actorId,
        {
          description: 'Обновлена заявка',
          oldValues,
          newValues,
          changedFields,
        },
        id,
      );
    }

    return updated;
  }

  async updateStatus(id: string, status: string, actorId?: string): Promise<WorkspaceEntity> {
    const current = await this.findOne(id);
    const oldStatus = current.status;

    await this.entityRepository.update(id, { status });
    const updated = await this.findOne(id);
    this.eventsGateway.emitStatusChanged({ id, status, entity: updated });

    // Логирование изменения статуса
    if (actorId && oldStatus !== status) {
      await this.auditLogService.log(
        AuditActionType.ENTITY_STATUS_CHANGED,
        current.workspaceId,
        actorId,
        {
          description: 'Изменён статус',
          oldValues: { status: oldStatus },
          newValues: { status },
          changedFields: ['status'],
        },
        id,
      );

      // Email уведомление исполнителю об изменении статуса
      if (updated.assigneeId && updated.assigneeId !== actorId) {
        const [assignee, changedBy] = await Promise.all([
          this.userRepository.findOne({ where: { id: updated.assigneeId } }),
          actorId ? this.userRepository.findOne({ where: { id: actorId } }) : null,
        ]);
        if (assignee && changedBy) {
          this.emailService.sendStatusChangeNotification(
            assignee, updated, changedBy, oldStatus, status, this.frontendUrl,
          ).catch(() => {}); // Не блокируем при ошибке
        }
      }
    }

    return updated;
  }

  async updateAssignee(
    id: string,
    assigneeId: string | null,
    actorId?: string,
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

      // Логирование изменения исполнителя
      if (actorId) {
        await this.auditLogService.log(
          AuditActionType.ENTITY_ASSIGNEE_CHANGED,
          current.workspaceId,
          actorId,
          {
            description: 'Изменён исполнитель',
            oldValues: { assigneeId: previousAssigneeId },
            newValues: { assigneeId },
            changedFields: ['assigneeId'],
          },
          id,
        );
      }

      // Email уведомление новому исполнителю
      if (assigneeId && actorId && assigneeId !== actorId) {
        const [assignee, assignedBy] = await Promise.all([
          this.userRepository.findOne({ where: { id: assigneeId } }),
          this.userRepository.findOne({ where: { id: actorId } }),
        ]);
        if (assignee && assignedBy) {
          this.emailService.sendAssignmentNotification(
            assignee, updated, assignedBy, this.frontendUrl,
          ).catch(() => {}); // Не блокируем при ошибке
        }
      }
    }

    return updated;
  }

  async remove(id: string, actorId?: string): Promise<void> {
    const entity = await this.findOne(id);

    // Логирование удаления (перед удалением, чтобы сохранить данные)
    if (actorId) {
      await this.auditLogService.log(
        AuditActionType.ENTITY_DELETED,
        entity.workspaceId,
        actorId,
        {
          description: 'Удалена заявка',
          oldValues: { title: entity.title, customId: entity.customId, status: entity.status },
        },
        id,
      );
    }

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
