import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { EntityService } from './entity.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { User, UserRole } from '../user/user.entity';
import { WorkspaceRole } from '../workspace/workspace-member.entity';

describe('CommentController', () => {
  let controller: CommentController;
  let commentService: any;
  let entityService: any;
  let workspaceService: any;

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    password: 'hashed',
    firstName: 'Test',
    lastName: 'User',
    avatar: null,
    department: null,
    role: UserRole.EMPLOYEE,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEntity = {
    id: 'entity-1',
    workspaceId: 'ws-1',
  };

  const mockComment = {
    id: 'comment-1',
    entityId: 'entity-1',
    content: 'Test comment',
    authorId: 'user-1',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockCommentService = {
      findOne: jest.fn(),
      findByEntity: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const mockEntityService = {
      findOne: jest.fn(),
    };

    const mockWorkspaceService = {
      checkAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentController],
      providers: [
        { provide: CommentService, useValue: mockCommentService },
        { provide: EntityService, useValue: mockEntityService },
        { provide: WorkspaceService, useValue: mockWorkspaceService },
      ],
    }).compile();

    controller = module.get<CommentController>(CommentController);
    commentService = module.get(CommentService);
    entityService = module.get(EntityService);
    workspaceService = module.get(WorkspaceService);
  });

  describe('findByEntityParam', () => {
    it('должен вернуть комментарии для entity', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(true);
      commentService.findByEntity.mockResolvedValue([mockComment] as any);

      const result = await controller.findByEntityParam('entity-1', mockUser);

      expect(result).toEqual([mockComment]);
    });

    it('должен выбросить ForbiddenException при отсутствии доступа', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(false);

      await expect(controller.findByEntityParam('entity-1', mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('должен вернуть комментарии если entity не найден', async () => {
      entityService.findOne.mockResolvedValue(null);
      commentService.findByEntity.mockResolvedValue([]);

      const result = await controller.findByEntityParam('entity-1', mockUser);

      expect(result).toEqual([]);
      expect(workspaceService.checkAccess).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    const createDto = { content: 'New comment', authorId: 'user-1' };

    it('должен создать комментарий', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(true);
      commentService.create.mockResolvedValue(mockComment as any);

      const result = await controller.create('entity-1', createDto as any, mockUser);

      expect(result).toEqual(mockComment);
      expect(workspaceService.checkAccess).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        UserRole.EMPLOYEE,
        WorkspaceRole.EDITOR,
      );
    });

    it('должен выбросить ForbiddenException если entity не найден', async () => {
      entityService.findOne.mockResolvedValue(null);

      await expect(controller.create('entity-1', createDto as any, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('должен выбросить ForbiddenException без прав EDITOR', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(false);

      await expect(controller.create('entity-1', createDto as any, mockUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('должен обновить комментарий автора', async () => {
      commentService.findOne.mockResolvedValue(mockComment as any);
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(null); // не admin
      commentService.update.mockResolvedValue({ ...mockComment, content: 'Updated' } as any);

      const result = await controller.update('comment-1', { content: 'Updated' }, mockUser);

      expect(result.content).toBe('Updated');
    });

    it('должен позволить admin обновлять чужой комментарий', async () => {
      const otherUserComment = { ...mockComment, authorId: 'user-2' };
      commentService.findOne.mockResolvedValue(otherUserComment as any);
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      commentService.update.mockResolvedValue({ ...otherUserComment, content: 'Updated' } as any);

      const result = await controller.update('comment-1', { content: 'Updated' }, mockUser);

      expect(result.content).toBe('Updated');
    });

    it('должен выбросить ForbiddenException для чужого комментария без прав admin', async () => {
      const otherUserComment = { ...mockComment, authorId: 'user-2' };
      commentService.findOne.mockResolvedValue(otherUserComment as any);
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(null);

      await expect(controller.update('comment-1', { content: 'Updated' }, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('должен выбросить ForbiddenException если комментарий не найден', async () => {
      commentService.findOne.mockResolvedValue(null);

      await expect(controller.update('non-existent', { content: 'Test' }, mockUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('должен удалить комментарий автора', async () => {
      commentService.findOne.mockResolvedValue(mockComment as any);
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(null);
      commentService.remove.mockResolvedValue(undefined);

      await controller.remove('comment-1', mockUser);

      expect(commentService.remove).toHaveBeenCalledWith('comment-1', 'user-1');
    });

    it('должен позволить admin удалять чужой комментарий', async () => {
      const otherUserComment = { ...mockComment, authorId: 'user-2' };
      commentService.findOne.mockResolvedValue(otherUserComment as any);
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);

      await controller.remove('comment-1', mockUser);

      expect(commentService.remove).toHaveBeenCalled();
    });

    it('должен выбросить ForbiddenException для чужого комментария без прав', async () => {
      const otherUserComment = { ...mockComment, authorId: 'user-2' };
      commentService.findOne.mockResolvedValue(otherUserComment as any);
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(null);

      await expect(controller.remove('comment-1', mockUser)).rejects.toThrow(ForbiddenException);
    });
  });
});
