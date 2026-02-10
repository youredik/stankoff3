import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message } from './entities/message.entity';
import { EventsGateway } from '../websocket/events.gateway';

// ─── Helpers ──────────────────────────────────────────────

function createMockRepository() {
  return {
    create: jest.fn((entity) => ({ ...entity })),
    save: jest.fn((entity) => Promise.resolve({ id: 'generated-id', ...entity })),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function mockQueryBuilder(result: any = []) {
  const qb: any = {};
  qb.innerJoin = jest.fn().mockReturnValue(qb);
  qb.leftJoinAndSelect = jest.fn().mockReturnValue(qb);
  qb.leftJoin = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.addOrderBy = jest.fn().mockReturnValue(qb);
  qb.take = jest.fn().mockReturnValue(qb);
  qb.select = jest.fn().mockReturnValue(qb);
  qb.addSelect = jest.fn().mockReturnValue(qb);
  qb.setParameter = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(result);
  qb.getOne = jest.fn().mockResolvedValue(result);
  qb.getRawMany = jest.fn().mockResolvedValue(result);
  return qb;
}

describe('ChatService', () => {
  let service: ChatService;
  let conversationRepo: jest.Mocked<Repository<Conversation>>;
  let participantRepo: jest.Mocked<Repository<ConversationParticipant>>;
  let messageRepo: jest.Mocked<Repository<Message>>;
  let eventsGateway: jest.Mocked<EventsGateway>;

  const userId = 'user-1';
  const otherUserId = 'user-2';
  const conversationId = 'conv-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(Conversation), useFactory: createMockRepository },
        { provide: getRepositoryToken(ConversationParticipant), useFactory: createMockRepository },
        { provide: getRepositoryToken(Message), useFactory: createMockRepository },
        {
          provide: EventsGateway,
          useValue: { emitToUser: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ChatService);
    conversationRepo = module.get(getRepositoryToken(Conversation));
    participantRepo = module.get(getRepositoryToken(ConversationParticipant));
    messageRepo = module.get(getRepositoryToken(Message));
    eventsGateway = module.get(EventsGateway);
  });

  // ─── createConversation ──────────────────────────────────

  describe('createConversation', () => {
    it('должен создать групповой чат', async () => {
      const qb = mockQueryBuilder(null);
      conversationRepo.createQueryBuilder.mockReturnValue(qb);
      conversationRepo.save.mockResolvedValue({
        id: conversationId,
        type: 'group',
        name: 'Тест',
      } as Conversation);
      conversationRepo.findOne.mockResolvedValue({
        id: conversationId,
        type: 'group',
        name: 'Тест',
        participants: [],
      } as any);

      // participantRepo.save returns successfully
      participantRepo.save.mockResolvedValue({} as any);
      // find for emitToConversation
      participantRepo.find.mockResolvedValue([]);

      const result = await service.createConversation(userId, {
        type: 'group',
        name: 'Тест',
        participantIds: [otherUserId],
      });

      expect(conversationRepo.save).toHaveBeenCalled();
      expect(participantRepo.save).toHaveBeenCalledTimes(2); // owner + member
    });

    it('должен отклонить direct чат с неправильным кол-вом участников', async () => {
      await expect(
        service.createConversation(userId, {
          type: 'direct',
          participantIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен дедуплицировать direct чат', async () => {
      const existingConv = {
        id: 'existing-conv',
        type: 'direct',
        participants: [],
      };

      const qb = mockQueryBuilder(existingConv);
      conversationRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.createConversation(userId, {
        type: 'direct',
        participantIds: [otherUserId],
      });

      expect(result).toEqual(existingConv);
      expect(conversationRepo.save).not.toHaveBeenCalled();
    });

    it('должен дедуплицировать entity чат', async () => {
      const entityId = 'entity-1';
      const existingConv = {
        id: 'existing-conv',
        type: 'entity',
        entityId,
        participants: [{ userId, leftAt: null }],
      };

      // findDirectChat returns null (no direct)
      const qb = mockQueryBuilder(null);
      conversationRepo.createQueryBuilder.mockReturnValue(qb);

      // Entity dedup check
      conversationRepo.findOne.mockResolvedValueOnce(existingConv as any);
      // getConversationWithParticipants — already exists
      conversationRepo.findOne.mockResolvedValueOnce(existingConv as any);

      // ensureParticipant — already a participant
      participantRepo.findOne.mockResolvedValue({ userId, leftAt: null } as any);

      const result = await service.createConversation(userId, {
        type: 'entity',
        entityId,
        participantIds: [],
      });

      expect(conversationRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── getMessages ──────────────────────────────────────────

  describe('getMessages', () => {
    it('должен вернуть сообщения с пагинацией', async () => {
      // assertParticipant
      participantRepo.findOne.mockResolvedValue({
        conversationId,
        userId,
        leftAt: null,
      } as any);

      const messages = [
        { id: 'msg-1', content: 'Hello', createdAt: new Date() },
        { id: 'msg-2', content: 'World', createdAt: new Date() },
      ];

      const qb = mockQueryBuilder(messages);
      messageRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMessages(conversationId, userId, { limit: 50 });

      expect(result.messages).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('должен вернуть hasMore=true если больше limit записей', async () => {
      participantRepo.findOne.mockResolvedValue({
        conversationId,
        userId,
        leftAt: null,
      } as any);

      // limit+1 = 3 messages means hasMore
      const messages = Array.from({ length: 3 }, (_, i) => ({
        id: `msg-${i}`,
        content: `Msg ${i}`,
        createdAt: new Date(),
      }));

      const qb = mockQueryBuilder(messages);
      messageRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMessages(conversationId, userId, { limit: 2 });

      expect(result.hasMore).toBe(true);
      expect(result.messages).toHaveLength(2);
    });

    it('должен отклонить запрос от не-участника', async () => {
      participantRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getMessages(conversationId, 'stranger', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── sendMessage ──────────────────────────────────────────

  describe('sendMessage', () => {
    it('должен отправить текстовое сообщение', async () => {
      participantRepo.findOne.mockResolvedValue({
        conversationId,
        userId,
        leftAt: null,
      } as any);

      const savedMsg = {
        id: 'msg-new',
        conversationId,
        authorId: userId,
        content: '<p>Hello</p>',
        type: 'text',
        createdAt: new Date(),
      };

      messageRepo.save.mockResolvedValue(savedMsg as any);
      messageRepo.findOne.mockResolvedValue({
        ...savedMsg,
        author: { id: userId, firstName: 'Test' },
      } as any);

      participantRepo.find.mockResolvedValue([
        { userId, leftAt: null },
        { userId: otherUserId, leftAt: null },
      ] as any);

      const result = await service.sendMessage(conversationId, userId, {
        content: '<p>Hello</p>',
      });

      expect(messageRepo.save).toHaveBeenCalled();
      expect(conversationRepo.update).toHaveBeenCalledWith(conversationId, expect.objectContaining({
        lastMessagePreview: 'Hello',
        lastMessageAuthorId: userId,
      }));
      expect(eventsGateway.emitToUser).toHaveBeenCalled();
    });

    it('должен отправить голосовое сообщение', async () => {
      participantRepo.findOne.mockResolvedValue({
        conversationId,
        userId,
        leftAt: null,
      } as any);

      const savedMsg = {
        id: 'msg-voice',
        conversationId,
        authorId: userId,
        type: 'voice',
        voiceKey: 's3-key',
        voiceDuration: 15,
        createdAt: new Date(),
      };

      messageRepo.save.mockResolvedValue(savedMsg as any);
      messageRepo.findOne.mockResolvedValue(savedMsg as any);
      participantRepo.find.mockResolvedValue([]);

      const result = await service.sendMessage(conversationId, userId, {
        type: 'voice',
        voiceKey: 's3-key',
        voiceDuration: 15,
        voiceWaveform: [0.1, 0.5, 0.3],
      });

      expect(conversationRepo.update).toHaveBeenCalledWith(conversationId, expect.objectContaining({
        lastMessagePreview: 'Голосовое сообщение',
      }));
    });
  });

  // ─── editMessage ──────────────────────────────────────────

  describe('editMessage', () => {
    it('должен отредактировать своё сообщение', async () => {
      participantRepo.findOne.mockResolvedValue({ conversationId, userId, leftAt: null } as any);
      const msg = {
        id: 'msg-1',
        conversationId,
        authorId: userId,
        content: 'old',
        isDeleted: false,
        isEdited: false,
      };
      messageRepo.findOne.mockResolvedValueOnce(msg as any);
      messageRepo.save.mockResolvedValue({ ...msg, content: 'new', isEdited: true } as any);
      messageRepo.findOne.mockResolvedValueOnce({ ...msg, content: 'new', isEdited: true } as any);
      participantRepo.find.mockResolvedValue([]);

      await service.editMessage(conversationId, 'msg-1', userId, { content: 'new' });

      expect(messageRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        content: 'new',
        isEdited: true,
      }));
    });

    it('должен отклонить редактирование чужого сообщения', async () => {
      participantRepo.findOne.mockResolvedValue({ conversationId, userId, leftAt: null } as any);
      messageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        conversationId,
        authorId: 'other-user',
        isDeleted: false,
      } as any);

      await expect(
        service.editMessage(conversationId, 'msg-1', userId, { content: 'hack' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен отклонить редактирование удалённого', async () => {
      participantRepo.findOne.mockResolvedValue({ conversationId, userId, leftAt: null } as any);
      messageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        conversationId,
        authorId: userId,
        isDeleted: true,
      } as any);

      await expect(
        service.editMessage(conversationId, 'msg-1', userId, { content: 'revive' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── deleteMessage ──────────────────────────────────────

  describe('deleteMessage', () => {
    it('должен мягко удалить своё сообщение', async () => {
      participantRepo.findOne.mockResolvedValue({ conversationId, userId, leftAt: null } as any);
      const msg = { id: 'msg-1', conversationId, authorId: userId, isDeleted: false };
      messageRepo.findOne.mockResolvedValue(msg as any);
      messageRepo.save.mockResolvedValue({ ...msg, isDeleted: true } as any);
      participantRepo.find.mockResolvedValue([]);

      const result = await service.deleteMessage(conversationId, 'msg-1', userId);
      expect(result.success).toBe(true);
      expect(messageRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isDeleted: true }));
    });

    it('должен отклонить удаление чужого', async () => {
      participantRepo.findOne.mockResolvedValue({ conversationId, userId, leftAt: null } as any);
      messageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        conversationId,
        authorId: 'other-user',
      } as any);

      await expect(
        service.deleteMessage(conversationId, 'msg-1', userId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── markAsRead ──────────────────────────────────────────

  describe('markAsRead', () => {
    it('должен обновить lastReadMessageId и lastReadAt', async () => {
      const participant = {
        conversationId,
        userId,
        leftAt: null,
        lastReadMessageId: null,
        lastReadAt: null,
      };
      participantRepo.findOne.mockResolvedValue(participant as any);
      participantRepo.save.mockResolvedValue(participant as any);
      participantRepo.find.mockResolvedValue([]);

      const result = await service.markAsRead(conversationId, userId, {
        lastReadMessageId: 'msg-5',
      });

      expect(result.success).toBe(true);
      expect(participantRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        lastReadMessageId: 'msg-5',
      }));
    });
  });

  // ─── addParticipants ──────────────────────────────────────

  describe('addParticipants', () => {
    it('должен добавить участников в групповой чат', async () => {
      participantRepo.findOne
        .mockResolvedValueOnce({ conversationId, userId, leftAt: null } as any) // assertParticipant
        .mockResolvedValueOnce(null); // not existing participant
      conversationRepo.findOne
        .mockResolvedValueOnce({ id: conversationId, type: 'group' } as any) // conversation check
        .mockResolvedValueOnce({ id: conversationId, type: 'group', participants: [] } as any); // return value

      participantRepo.save.mockResolvedValue({} as any);
      // for system message:
      messageRepo.save.mockResolvedValue({ id: 'sys-msg' } as any);
      messageRepo.findOne.mockResolvedValue({ id: 'sys-msg', type: 'system' } as any);
      participantRepo.find.mockResolvedValue([]);

      await service.addParticipants(conversationId, userId, ['user-3']);

      expect(participantRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        conversationId,
        userId: 'user-3',
        role: 'member',
      }));
    });

    it('должен отклонить добавление в direct чат', async () => {
      participantRepo.findOne.mockResolvedValue({ conversationId, userId, leftAt: null } as any);
      conversationRepo.findOne.mockResolvedValue({ id: conversationId, type: 'direct' } as any);

      await expect(
        service.addParticipants(conversationId, userId, ['user-3']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── removeParticipant ──────────────────────────────────

  describe('removeParticipant', () => {
    it('должен мягко удалить участника', async () => {
      participantRepo.findOne
        .mockResolvedValueOnce({ conversationId, userId, leftAt: null } as any) // assertParticipant
        .mockResolvedValueOnce({ conversationId, userId: otherUserId, leftAt: null } as any); // target
      conversationRepo.findOne.mockResolvedValue({ id: conversationId, type: 'group' } as any);
      participantRepo.save.mockResolvedValue({} as any);
      messageRepo.save.mockResolvedValue({ id: 'sys-msg' } as any);
      messageRepo.findOne.mockResolvedValue({ id: 'sys-msg' } as any);
      participantRepo.find.mockResolvedValue([]);

      const result = await service.removeParticipant(conversationId, userId, otherUserId);
      expect(result.success).toBe(true);
    });
  });

  // ─── getUnreadCounts ──────────────────────────────────────

  describe('getUnreadCounts', () => {
    it('должен вернуть подсчёт непрочитанных', async () => {
      const qb = mockQueryBuilder([
        { conversationId: 'conv-1', count: '3' },
        { conversationId: 'conv-2', count: '0' },
      ]);
      participantRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getUnreadCounts(userId);

      expect(result).toEqual({ 'conv-1': 3 });
    });
  });
});
