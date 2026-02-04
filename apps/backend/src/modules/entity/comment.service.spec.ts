import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CommentService } from './comment.service';
import { Comment } from './comment.entity';
import { WorkspaceEntity } from './entity.entity';
import { EventsGateway } from '../websocket/events.gateway';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SlaService } from '../sla/sla.service';

describe('CommentService', () => {
  let service: CommentService;
  let commentRepo: jest.Mocked<Repository<Comment>>;
  let entityRepo: jest.Mocked<Repository<WorkspaceEntity>>;
  let eventsGateway: jest.Mocked<EventsGateway>;
  let s3Service: jest.Mocked<S3Service>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockComment = {
    id: 'comment-1',
    entityId: 'entity-1',
    authorId: 'user-1',
    content: 'Test comment',
    attachments: [],
    author: { id: 'user-1', firstName: 'Test', lastName: 'User' },
    entity: { id: 'entity-1', workspaceId: 'ws-1' },
    mentionedUserIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Comment;

  const mockEntity = {
    id: 'entity-1',
    workspaceId: 'ws-1',
    title: 'Test Entity',
  } as unknown as WorkspaceEntity;

  beforeEach(async () => {
    const mockCommentRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    const mockEntityRepo = {
      findOne: jest.fn(),
    };

    const mockEventsGateway = {
      emitCommentCreated: jest.fn(),
    };

    const mockS3Service = {
      getSignedUrlsBatch: jest.fn().mockResolvedValue(new Map()),
    };

    const mockAuditLogService = {
      log: jest.fn(),
    };

    const mockSlaService = {
      recordResponse: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        { provide: getRepositoryToken(Comment), useValue: mockCommentRepo },
        { provide: getRepositoryToken(WorkspaceEntity), useValue: mockEntityRepo },
        { provide: EventsGateway, useValue: mockEventsGateway },
        { provide: S3Service, useValue: mockS3Service },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: SlaService, useValue: mockSlaService },
      ],
    }).compile();

    service = module.get<CommentService>(CommentService);
    commentRepo = module.get(getRepositoryToken(Comment));
    entityRepo = module.get(getRepositoryToken(WorkspaceEntity));
    eventsGateway = module.get(EventsGateway);
    s3Service = module.get(S3Service);
    auditLogService = module.get(AuditLogService);
  });

  describe('findOne', () => {
    it('должен вернуть комментарий по ID', async () => {
      commentRepo.findOne.mockResolvedValue(mockComment);

      const result = await service.findOne('comment-1');

      expect(result).toEqual(mockComment);
    });

    it('должен вернуть null если комментарий не найден', async () => {
      commentRepo.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByEntity', () => {
    it('должен вернуть комментарии по entity', async () => {
      commentRepo.find.mockResolvedValue([mockComment]);

      const result = await service.findByEntity('entity-1');

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Test comment');
    });

    it('должен генерировать signed URLs для вложений', async () => {
      const commentWithAttachment = {
        ...mockComment,
        attachments: [{ id: 'att-1', name: 'file.pdf', size: 1000, mimeType: 'application/pdf', key: 's3-key' }],
      };
      commentRepo.find.mockResolvedValue([commentWithAttachment as any]);
      s3Service.getSignedUrlsBatch.mockResolvedValue(new Map([['s3-key', 'https://signed-url']]));

      const result = await service.findByEntity('entity-1');

      expect(s3Service.getSignedUrlsBatch).toHaveBeenCalledWith(['s3-key']);
      expect(result[0].attachments[0].url).toBe('https://signed-url');
    });

    it('должен обрабатывать thumbnailKey для изображений', async () => {
      const commentWithImage = {
        ...mockComment,
        attachments: [{ id: 'att-1', name: 'image.png', size: 1000, mimeType: 'image/png', key: 's3-key', thumbnailKey: 'thumb-key' }],
      };
      commentRepo.find.mockResolvedValue([commentWithImage as any]);
      s3Service.getSignedUrlsBatch.mockResolvedValue(new Map([
        ['s3-key', 'https://signed-url'],
        ['thumb-key', 'https://thumb-url'],
      ]));

      const result = await service.findByEntity('entity-1');

      expect(result[0].attachments[0].thumbnailUrl).toBe('https://thumb-url');
    });
  });

  describe('create', () => {
    it('должен создать комментарий', async () => {
      commentRepo.create.mockReturnValue(mockComment);
      commentRepo.save.mockResolvedValue(mockComment);
      commentRepo.findOne.mockResolvedValue(mockComment);
      entityRepo.findOne.mockResolvedValue(mockEntity);

      const dto = { authorId: 'user-1', content: 'New comment' };
      const result = await service.create('entity-1', dto);

      expect(result.content).toBe('Test comment');
      expect(eventsGateway.emitCommentCreated).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('должен создать комментарий с вложениями', async () => {
      const commentWithAttachment = {
        ...mockComment,
        attachments: [{ id: 'att-1', name: 'file.pdf', size: 1000, mimeType: 'application/pdf', key: 's3-key' }],
      };
      commentRepo.create.mockReturnValue(commentWithAttachment as any);
      commentRepo.save.mockResolvedValue(commentWithAttachment as any);
      commentRepo.findOne.mockResolvedValue(commentWithAttachment as any);
      entityRepo.findOne.mockResolvedValue(mockEntity);
      s3Service.getSignedUrlsBatch.mockResolvedValue(new Map([['s3-key', 'https://signed-url']]));

      const dto = {
        authorId: 'user-1',
        content: 'Comment with attachment',
        attachments: [{ id: 'att-1', name: 'file.pdf', size: 1000, mimeType: 'application/pdf', key: 's3-key' }],
      };
      const result = await service.create('entity-1', dto);

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].url).toBe('https://signed-url');
    });

    it('должен работать без entity (не логировать)', async () => {
      commentRepo.create.mockReturnValue(mockComment);
      commentRepo.save.mockResolvedValue(mockComment);
      commentRepo.findOne.mockResolvedValue(mockComment);
      entityRepo.findOne.mockResolvedValue(null);

      const dto = { authorId: 'user-1', content: 'New comment' };
      await service.create('entity-1', dto);

      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('должен обновить комментарий', async () => {
      commentRepo.findOne.mockResolvedValue(mockComment);
      commentRepo.save.mockResolvedValue({ ...mockComment, content: 'Updated' } as any);

      const result = await service.update('comment-1', 'Updated', 'user-1');

      expect(result.content).toBe('Updated');
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('должен выбросить NotFoundException если комментарий не найден', async () => {
      commentRepo.findOne.mockResolvedValue(null);

      await expect(service.update('non-existent', 'Updated')).rejects.toThrow(NotFoundException);
    });

    it('должен работать без actorId', async () => {
      commentRepo.findOne.mockResolvedValue(mockComment);
      commentRepo.save.mockResolvedValue({ ...mockComment, content: 'Updated' } as any);

      await service.update('comment-1', 'Updated');

      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('должен работать без entity в комментарии', async () => {
      const commentWithoutEntity = { ...mockComment, entity: undefined };
      commentRepo.findOne.mockResolvedValue(commentWithoutEntity as any);
      commentRepo.save.mockResolvedValue({ ...commentWithoutEntity, content: 'Updated' } as any);

      await service.update('comment-1', 'Updated', 'user-1');

      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('должен удалить комментарий', async () => {
      commentRepo.findOne.mockResolvedValue(mockComment);
      commentRepo.remove.mockResolvedValue(mockComment);

      await service.remove('comment-1', 'user-1');

      expect(commentRepo.remove).toHaveBeenCalledWith(mockComment);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('должен выбросить NotFoundException если комментарий не найден', async () => {
      commentRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('должен работать без actorId', async () => {
      commentRepo.findOne.mockResolvedValue(mockComment);
      commentRepo.remove.mockResolvedValue(mockComment);

      await service.remove('comment-1');

      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('должен работать без entity в комментарии', async () => {
      const commentWithoutEntity = { ...mockComment, entity: undefined };
      commentRepo.findOne.mockResolvedValue(commentWithoutEntity as any);
      commentRepo.remove.mockResolvedValue(commentWithoutEntity as any);

      await service.remove('comment-1', 'user-1');

      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });
});
