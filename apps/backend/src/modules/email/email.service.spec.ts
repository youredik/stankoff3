import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { User, UserRole } from '../user/user.entity';
import { WorkspaceEntity } from '../entity/entity.entity';

describe('EmailService', () => {
  let service: EmailService;

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    password: 'hashedPassword',
    firstName: 'Test',
    lastName: 'User',
    avatar: undefined as any,
    department: undefined as any,
    role: UserRole.EMPLOYEE,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEntity: WorkspaceEntity = {
    id: 'entity-1',
    customId: 'TASK-1',
    title: 'Test Entity',
    status: 'new',
    workspaceId: 'ws-1',
    assigneeId: null,
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as WorkspaceEntity;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          SMTP_FROM_EMAIL: 'noreply@test.com',
          SMTP_FROM_NAME: 'Test Portal',
          SMTP_ENABLED: 'false',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  describe('send', () => {
    it('должен вернуть false если email отключен', async () => {
      const result = await service.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result).toBe(false);
    });
  });

  describe('sendAssignmentNotification', () => {
    it('должен сформировать корректное письмо о назначении', async () => {
      const sendSpy = jest.spyOn(service, 'send').mockResolvedValue(false);

      await service.sendAssignmentNotification(
        mockUser,
        mockEntity,
        mockUser,
        'http://localhost:3000',
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Вам назначена заявка TASK-1',
        }),
      );
    });
  });

  describe('sendCommentNotification', () => {
    it('должен сформировать корректное письмо о комментарии', async () => {
      const sendSpy = jest.spyOn(service, 'send').mockResolvedValue(false);

      await service.sendCommentNotification(
        mockUser,
        mockEntity,
        mockUser,
        'Тестовый комментарий',
        'http://localhost:3000',
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Новый комментарий в заявке TASK-1',
        }),
      );
    });

    it('должен обрезать длинный комментарий', async () => {
      const sendSpy = jest.spyOn(service, 'send').mockResolvedValue(false);
      const longComment = 'A'.repeat(300);

      await service.sendCommentNotification(
        mockUser,
        mockEntity,
        mockUser,
        longComment,
        'http://localhost:3000',
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('...'),
        }),
      );
    });
  });

  describe('sendStatusChangeNotification', () => {
    it('должен сформировать корректное письмо об изменении статуса', async () => {
      const sendSpy = jest.spyOn(service, 'send').mockResolvedValue(false);

      await service.sendStatusChangeNotification(
        mockUser,
        mockEntity,
        mockUser,
        'new',
        'in_progress',
        'http://localhost:3000',
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Статус заявки TASK-1 изменён',
        }),
      );
      expect(sendSpy.mock.calls[0][0].html).toContain('new');
      expect(sendSpy.mock.calls[0][0].html).toContain('in_progress');
    });
  });
});
