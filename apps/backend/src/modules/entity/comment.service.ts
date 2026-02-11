import { Injectable, NotFoundException, Inject, forwardRef, Optional, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { WorkspaceEntity } from './entity.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { EventsGateway } from '../websocket/events.gateway';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { TriggersService } from '../bpmn/triggers/triggers.service';
import { TriggerType as BpmnTriggerType } from '../bpmn/entities/process-trigger.entity';
import { BpmnService } from '../bpmn/bpmn.service';
import { SlaService } from '../sla/sla.service';

// Response attachment type with signed URLs
export interface AttachmentWithUrls {
  id: string;
  name: string;
  size: number;
  url: string;
  mimeType: string;
  thumbnailUrl?: string;
  key: string; // S3 key for download endpoint
}

// Comment response type with signed URLs
export interface CommentWithUrls extends Omit<Comment, 'attachments'> {
  attachments: AttachmentWithUrls[];
}

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);

  constructor(
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
    private eventsGateway: EventsGateway,
    private s3Service: S3Service,
    @Inject(forwardRef(() => AuditLogService))
    private auditLogService: AuditLogService,
    @Optional()
    @Inject(forwardRef(() => TriggersService))
    private triggersService: TriggersService,
    @Optional()
    @Inject(forwardRef(() => BpmnService))
    private bpmnService: BpmnService,
    private slaService: SlaService,
  ) {}

  async findOne(id: string): Promise<Comment | null> {
    return this.commentRepository.findOne({
      where: { id },
      relations: ['author'],
    });
  }

  async findByEntity(entityId: string): Promise<CommentWithUrls[]> {
    const comments = await this.commentRepository.find({
      where: { entityId },
      relations: ['author'],
      order: { createdAt: 'ASC' },
    });

    // Collect all S3 keys for batch signed URL generation
    const allKeys: string[] = [];
    for (const comment of comments) {
      for (const att of comment.attachments || []) {
        allKeys.push(att.key);
        if (att.thumbnailKey) {
          allKeys.push(att.thumbnailKey);
        }
      }
    }

    // Generate signed URLs in batch
    const signedUrls = allKeys.length > 0
      ? await this.s3Service.getSignedUrlsBatch(allKeys)
      : new Map<string, string>();

    // Map comments with signed URLs
    return comments.map((comment) => ({
      ...comment,
      attachments: (comment.attachments || []).map((att) => ({
        id: att.id,
        name: att.name,
        size: att.size,
        mimeType: att.mimeType,
        key: att.key,
        url: signedUrls.get(att.key) || '',
        thumbnailUrl: att.thumbnailKey ? signedUrls.get(att.thumbnailKey) : undefined,
      })),
    }));
  }

  async create(
    entityId: string,
    dto: CreateCommentDto,
    authorId: string,
  ): Promise<CommentWithUrls> {
    const comment = this.commentRepository.create({
      entityId,
      authorId,
      content: dto.content,
      attachments: dto.attachments || [],
    });
    const saved = await this.commentRepository.save(comment);
    const withAuthor = await this.commentRepository.findOne({
      where: { id: saved.id },
      relations: ['author'],
    });

    // Generate signed URLs for attachments
    const allKeys: string[] = [];
    for (const att of withAuthor!.attachments || []) {
      allKeys.push(att.key);
      if (att.thumbnailKey) {
        allKeys.push(att.thumbnailKey);
      }
    }

    const signedUrls = allKeys.length > 0
      ? await this.s3Service.getSignedUrlsBatch(allKeys)
      : new Map<string, string>();

    const result: CommentWithUrls = {
      ...withAuthor!,
      attachments: (withAuthor!.attachments || []).map((att) => ({
        id: att.id,
        name: att.name,
        size: att.size,
        mimeType: att.mimeType,
        key: att.key,
        url: signedUrls.get(att.key) || '',
        thumbnailUrl: att.thumbnailKey ? signedUrls.get(att.thumbnailKey) : undefined,
      })),
    };

    this.eventsGateway.emitCommentCreated(result);

    // Логирование создания комментария
    const entity = await this.entityRepository.findOne({ where: { id: entityId } });
    if (entity) {
      const attachmentNames = (dto.attachments || []).map(a => a.name).join(', ');
      await this.auditLogService.log(
        AuditActionType.COMMENT_CREATED,
        entity.workspaceId,
        authorId,
        {
          description: 'Добавлен комментарий',
          commentId: saved.id,
          ...(attachmentNames && { fileName: attachmentNames }),
        },
        entityId,
      );

      // BPMN триггеры: comment_added
      if (this.triggersService) {
        try {
          await this.triggersService.evaluateTriggers(
            BpmnTriggerType.COMMENT_ADDED,
            {
              entityId,
              workspaceId: entity.workspaceId,
              commentId: saved.id,
              authorId: authorId,
              hasAttachments: (dto.attachments || []).length > 0,
              attachmentCount: (dto.attachments || []).length,
              contentLength: dto.content?.length || 0,
              entityTitle: entity.title,
              entityStatus: entity.status,
              entityPriority: entity.priority,
            },
            entity.workspaceId,
          );
        } catch (err) {
          this.logger.error(`BPMN trigger error on comment create: ${err.message}`);
        }
      }

      // BPMN message correlation: уведомить ожидающие процессы о комментарии
      // Публикуем только если комментарий НЕ от исполнителя (т.е. от клиента)
      if (this.bpmnService && entity.assigneeId && entity.assigneeId !== authorId) {
        try {
          // service-support-v2: Event-Based Gateway ожидает "client-response"
          await this.bpmnService.sendMessage('client-response', entityId, {
            commentId: saved.id,
            authorId: authorId,
          });
          // support-ticket: ожидает "customer-response"
          await this.bpmnService.sendMessage('customer-response', entityId, {
            commentId: saved.id,
            authorId: authorId,
          });
          this.logger.debug(`BPMN messages published for entity ${entityId} comment`);
        } catch (err) {
          // Не критично — процесс может не ожидать message в этот момент
          this.logger.debug(`BPMN message publish (non-critical): ${err.message}`);
        }
      }

      // SLA: отмечаем первый ответ при добавлении комментария
      try {
        await this.slaService.recordResponse('entity', entityId);
        this.logger.debug(`SLA response recorded for entity ${entityId}`);
      } catch (err) {
        this.logger.error(`SLA response recording error: ${err.message}`);
      }
    }

    return result;
  }

  async update(id: string, content: string, actorId?: string): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id },
      relations: ['author', 'entity'],
    });
    if (!comment) {
      throw new NotFoundException(`Comment ${id} not found`);
    }

    const oldContent = comment.content;
    comment.content = content;
    const updated = await this.commentRepository.save(comment);

    // Логирование обновления комментария
    if (actorId && comment.entity) {
      await this.auditLogService.log(
        AuditActionType.COMMENT_UPDATED,
        comment.entity.workspaceId,
        actorId,
        {
          description: 'Отредактирован комментарий',
          commentId: id,
          oldValues: { content: oldContent.substring(0, 100) },
          newValues: { content: content.substring(0, 100) },
        },
        comment.entityId,
      );
    }

    return updated;
  }

  async remove(id: string, actorId?: string): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id },
      relations: ['entity'],
    });
    if (!comment) {
      throw new NotFoundException(`Comment ${id} not found`);
    }

    // Логирование удаления (перед удалением)
    if (actorId && comment.entity) {
      await this.auditLogService.log(
        AuditActionType.COMMENT_DELETED,
        comment.entity.workspaceId,
        actorId,
        {
          description: 'Удалён комментарий',
          commentId: id,
        },
        comment.entityId,
      );
    }

    await this.commentRepository.remove(comment);
  }
}
