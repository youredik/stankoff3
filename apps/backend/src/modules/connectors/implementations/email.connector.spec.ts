import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { EmailConnector } from './email.connector';
import { EmailService } from '../../email/email.service';

describe('EmailConnector', () => {
  let connector: EmailConnector;
  let emailService: jest.Mocked<EmailService>;

  beforeEach(async () => {
    const mockEmailService = {
      send: jest.fn().mockResolvedValue(true),
    };

    const mockModuleRef = {
      get: jest.fn().mockReturnValue(mockEmailService),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailConnector,
        { provide: ModuleRef, useValue: mockModuleRef },
      ],
    }).compile();

    connector = module.get<EmailConnector>(EmailConnector);
    emailService = mockEmailService as unknown as jest.Mocked<EmailService>;

    // Manually set emailService since onModuleInit is not called in tests
    (connector as any).emailService = emailService;
  });

  describe('metadata', () => {
    it('should have correct type', () => {
      expect(connector.type).toBe('connector:email');
    });

    it('should have correct name', () => {
      expect(connector.name).toBe('Email');
    });

    it('should have input schema with required fields', () => {
      expect(connector.inputSchema.required).toContain('to');
      expect(connector.inputSchema.required).toContain('subject');
      expect(connector.inputSchema.required).toContain('body');
    });
  });

  describe('execute', () => {
    const baseContext = {
      processInstanceKey: 'test-123',
      workspaceId: 'ws-1',
      entityId: 'entity-1',
      variables: {},
    };

    it('should send email successfully', async () => {
      const result = await connector.execute(
        {
          to: 'test@example.com',
          subject: 'Test Subject',
          body: 'Test Body',
        },
        baseContext,
      );

      expect(result.success).toBe(true);
      expect(result.data?.sent).toBe(true);
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Test Subject',
        }),
      );
    });

    it('should interpolate variables in subject and body', async () => {
      await connector.execute(
        {
          to: 'test@example.com',
          subject: 'Заявка {customId}',
          body: 'Статус: {status}',
        },
        {
          ...baseContext,
          variables: { customId: 'REQ-123', status: 'в работе' },
        },
      );

      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Заявка REQ-123',
          text: 'Статус: в работе',
        }),
      );
    });

    it('should send to multiple recipients', async () => {
      await connector.execute(
        {
          to: ['a@example.com', 'b@example.com'],
          subject: 'Test',
          body: 'Test',
        },
        baseContext,
      );

      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@example.com, b@example.com',
        }),
      );
    });

    it('should apply notification template', async () => {
      await connector.execute(
        {
          to: 'test@example.com',
          subject: 'Test',
          body: 'Content here',
          template: 'notification',
        },
        baseContext,
      );

      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Уведомление'),
        }),
      );
    });

    it('should apply approval template', async () => {
      await connector.execute(
        {
          to: 'test@example.com',
          subject: 'Test',
          body: 'Please approve',
          template: 'approval',
        },
        baseContext,
      );

      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('согласование'),
        }),
      );
    });

    it('should return error when required field is missing', async () => {
      const result = await connector.execute(
        {
          to: 'test@example.com',
          // subject missing
          body: 'Test',
        },
        baseContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('subject');
    });

    it('should return error when EmailService not available', async () => {
      (connector as any).emailService = null;

      const result = await connector.execute(
        {
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test',
        },
        baseContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('EmailService');
    });

    it('should handle email send failure', async () => {
      emailService.send.mockResolvedValue(false);

      const result = await connector.execute(
        {
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test',
        },
        baseContext,
      );

      expect(result.success).toBe(false);
    });
  });
});
