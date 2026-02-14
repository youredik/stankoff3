import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsGateway } from './events.gateway';
import { ConversationParticipant } from '../chat/entities/conversation-participant.entity';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let jwtService: jest.Mocked<JwtService>;

  const mockServer = {
    emit: jest.fn(),
    sockets: { sockets: new Map() },
  };

  const createMockSocket = (id: string, token?: string, user?: any) => ({
    id,
    handshake: {
      auth: { token },
      headers: {},
    },
    data: { user },
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ConversationParticipant),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    jwtService = module.get(JwtService);
    (gateway as any).server = mockServer;

    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('должен аутентифицировать клиента по токену из auth', () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'user' };
      jwtService.verify.mockReturnValue(payload);

      const socket = createMockSocket('socket-1', 'valid-token');
      gateway.handleConnection(socket as any);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(socket.data.user).toEqual(payload);
    });

    it('должен разрешать анонимное подключение', () => {
      const socket = createMockSocket('socket-1');
      gateway.handleConnection(socket as any);

      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('должен разрешать подключение с невалидным токеном', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const socket = createMockSocket('socket-1', 'bad-token');
      gateway.handleConnection(socket as any);

      // Не должен бросить ошибку
      expect(jwtService.verify).toHaveBeenCalled();
    });

    it('должен добавлять пользователя в onlineUsers при подключении', () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'user' };
      jwtService.verify.mockReturnValue(payload);

      const socket = createMockSocket('socket-1', 'valid-token');
      gateway.handleConnection(socket as any);

      expect(gateway.getOnlineUserIds()).toContain('user-1');
      expect(mockServer.emit).toHaveBeenCalledWith('presence:update', {
        onlineUserIds: ['user-1'],
      });
    });
  });

  describe('handleDisconnect', () => {
    it('должен удалять пользователя из onlineUsers при отключении', () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'user' };
      jwtService.verify.mockReturnValue(payload);

      const socket = createMockSocket('socket-1', 'valid-token');
      gateway.handleConnection(socket as any);

      // Заполняем data для disconnect
      socket.data.user = payload;
      gateway.handleDisconnect(socket as any);

      expect(gateway.getOnlineUserIds()).not.toContain('user-1');
      expect(mockServer.emit).toHaveBeenLastCalledWith('presence:update', {
        onlineUserIds: [],
      });
    });

    it('должен сохранять пользователя если есть другие сокеты', () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'user' };
      jwtService.verify.mockReturnValue(payload);

      const socket1 = createMockSocket('socket-1', 'valid-token');
      const socket2 = createMockSocket('socket-2', 'valid-token');
      gateway.handleConnection(socket1 as any);
      gateway.handleConnection(socket2 as any);

      // Отключаем первый сокет
      socket1.data.user = payload;
      gateway.handleDisconnect(socket1 as any);

      expect(gateway.getOnlineUserIds()).toContain('user-1');
    });

    it('должен удалить пользователя только после отключения всех сокетов', () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'user' };
      jwtService.verify.mockReturnValue(payload);

      const socket1 = createMockSocket('socket-1', 'valid-token');
      const socket2 = createMockSocket('socket-2', 'valid-token');
      gateway.handleConnection(socket1 as any);
      gateway.handleConnection(socket2 as any);

      socket1.data.user = payload;
      socket2.data.user = payload;
      gateway.handleDisconnect(socket1 as any);
      gateway.handleDisconnect(socket2 as any);

      expect(gateway.getOnlineUserIds()).not.toContain('user-1');
    });
  });

  describe('presence broadcasting', () => {
    it('должен отправлять список всех онлайн пользователей', () => {
      const user1 = { sub: 'user-1', email: 'a@test.com', role: 'user' };
      const user2 = { sub: 'user-2', email: 'b@test.com', role: 'user' };
      jwtService.verify
        .mockReturnValueOnce(user1)
        .mockReturnValueOnce(user2);

      gateway.handleConnection(createMockSocket('s1', 'token1') as any);
      gateway.handleConnection(createMockSocket('s2', 'token2') as any);

      const lastCall = mockServer.emit.mock.calls[mockServer.emit.mock.calls.length - 1];
      expect(lastCall[0]).toBe('presence:update');
      expect(lastCall[1].onlineUserIds).toHaveLength(2);
      expect(lastCall[1].onlineUserIds).toContain('user-1');
      expect(lastCall[1].onlineUserIds).toContain('user-2');
    });
  });

  describe('getOnlineUserIds', () => {
    it('должен возвращать пустой массив при отсутствии подключений', () => {
      expect(gateway.getOnlineUserIds()).toEqual([]);
    });
  });

  describe('emit methods', () => {
    it('emitEntityCreated должен отправлять событие', () => {
      const data = { id: '1', title: 'Test' };
      gateway.emitEntityCreated(data);
      expect(mockServer.emit).toHaveBeenCalledWith('entity:created', data);
    });

    it('emitEntityUpdated должен отправлять событие', () => {
      const data = { id: '1', title: 'Updated' };
      gateway.emitEntityUpdated(data);
      expect(mockServer.emit).toHaveBeenCalledWith('entity:updated', data);
    });

    it('emitStatusChanged должен отправлять событие', () => {
      const data = { id: '1', status: 'done' };
      gateway.emitStatusChanged(data);
      expect(mockServer.emit).toHaveBeenCalledWith('status:changed', data);
    });

    it('emitCommentCreated должен отправлять событие', () => {
      const data = { id: 'c1', text: 'Comment' };
      gateway.emitCommentCreated(data);
      expect(mockServer.emit).toHaveBeenCalledWith('comment:created', data);
    });

    it('emitAssigneeChanged должен отправлять событие', () => {
      const data = {
        entityId: '1',
        entity: {},
        assigneeId: 'user-1',
        previousAssigneeId: null,
      };
      gateway.emitAssigneeChanged(data);
      expect(mockServer.emit).toHaveBeenCalledWith('user:assigned', data);
    });

    it('emitToWorkspace должен включать workspaceId в payload', () => {
      const data = { some: 'data' };
      gateway.emitToWorkspace('ws-1', 'custom:event', data);
      expect(mockServer.emit).toHaveBeenCalledWith('custom:event', { some: 'data', workspaceId: 'ws-1' });
    });
  });

  describe('handleAuthRefresh', () => {
    it('должен обновлять user при валидном токене', async () => {
      const newPayload = { sub: 'user-1', email: 'new@example.com', role: 'admin' };
      jwtService.verify.mockReturnValue(newPayload);

      const socket = createMockSocket('socket-1', undefined, {
        sub: 'user-1',
        email: 'old@example.com',
        role: 'user',
      });

      // Подключаем сокет для presence
      const connectPayload = { sub: 'user-1', email: 'old@example.com', role: 'user' };
      jwtService.verify.mockReturnValueOnce(connectPayload);
      gateway.handleConnection(
        createMockSocket('socket-1', 'old-token') as any,
      );
      jwtService.verify.mockReturnValue(newPayload);

      const result = await gateway.handleAuthRefresh(socket as any, { token: 'new-token' });

      expect(result).toEqual({ success: true });
      expect(socket.data.user).toEqual(newPayload);
    });

    it('должен возвращать success: false при невалидном токене', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const socket = createMockSocket('socket-1', undefined, {
        sub: 'user-1',
        email: 'test@example.com',
        role: 'user',
      });

      const result = await gateway.handleAuthRefresh(socket as any, { token: 'bad-token' });

      expect(result).toEqual({ success: false });
    });

    it('должен обновлять presence при смене userId', async () => {
      const oldPayload = { sub: 'user-1', email: 'a@test.com', role: 'user' };
      jwtService.verify.mockReturnValue(oldPayload);
      const socket = createMockSocket('socket-1', 'old-token');
      gateway.handleConnection(socket as any);

      expect(gateway.getOnlineUserIds()).toContain('user-1');

      const newPayload = { sub: 'user-2', email: 'b@test.com', role: 'user' };
      jwtService.verify.mockReturnValue(newPayload);
      socket.data.user = oldPayload;

      await gateway.handleAuthRefresh(socket as any, { token: 'new-token' });

      expect(gateway.getOnlineUserIds()).not.toContain('user-1');
      expect(gateway.getOnlineUserIds()).toContain('user-2');
    });
  });

  describe('task events', () => {
    it('emitTaskCreated должен отправлять событие', () => {
      const data = { id: 'task-1', workspaceId: 'ws-1', assigneeId: 'user-1' };
      gateway.emitTaskCreated(data);
      expect(mockServer.emit).toHaveBeenCalledWith('task:created', data);
    });

    it('emitTaskUpdated должен отправлять событие', () => {
      const data = { id: 'task-1', workspaceId: 'ws-1', assigneeId: 'user-1', status: 'claimed' };
      gateway.emitTaskUpdated(data);
      expect(mockServer.emit).toHaveBeenCalledWith('task:updated', data);
    });
  });

  describe('AI events', () => {
    it('emitAiClassificationReady должен отправлять событие', () => {
      const data = {
        entityId: 'entity-1',
        workspaceId: 'ws-1',
        classification: {
          category: 'technical_support',
          priority: 'high',
          skills: ['mechanical'],
          confidence: 0.92,
        },
      };
      gateway.emitAiClassificationReady(data);
      expect(mockServer.emit).toHaveBeenCalledWith('ai:classification:ready', data);
    });
  });

  describe('handleMessage', () => {
    it('должен возвращать подтверждение', () => {
      const result = gateway.handleMessage({} as any, {});
      expect(result).toBe('Message received');
    });
  });
});
