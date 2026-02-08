import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

interface AuthenticatedSocket extends Socket {
  data: {
    user?: {
      sub: string;
      email: string;
      role: string;
    };
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // userId → Set<socketId> (один пользователь может иметь несколько вкладок)
  private onlineUsers = new Map<string, Set<string>>();

  constructor(private jwtService: JwtService) {}

  handleConnection(client: AuthenticatedSocket) {
    try {
      // Получаем токен из auth или headers
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (token) {
        const payload = this.jwtService.verify(token);
        client.data.user = payload;
        console.log(`Client connected: ${client.id}, user: ${payload.email}`);

        // Presence tracking
        this.addUserPresence(payload.sub, client.id);
      } else {
        // Разрешаем анонимные подключения (для обратной совместимости)
        console.log(`Client connected (anonymous): ${client.id}`);
      }
    } catch {
      // Токен невалидный, но разрешаем подключение (для обратной совместимости)
      console.log(`Client connected (invalid token): ${client.id}`);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userEmail = client.data?.user?.email || 'anonymous';
    console.log(`Client disconnected: ${client.id}, user: ${userEmail}`);

    // Presence tracking
    const userId = client.data?.user?.sub;
    if (userId) {
      this.removeUserPresence(userId, client.id);
    }
  }

  private addUserPresence(userId: string, socketId: string) {
    if (!this.onlineUsers.has(userId)) {
      this.onlineUsers.set(userId, new Set());
    }
    this.onlineUsers.get(userId)!.add(socketId);
    this.broadcastPresence();
  }

  private removeUserPresence(userId: string, socketId: string) {
    const sockets = this.onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.onlineUsers.delete(userId);
      }
    }
    this.broadcastPresence();
  }

  private broadcastPresence() {
    const onlineIds = Array.from(this.onlineUsers.keys());
    this.server.emit('presence:update', { onlineUserIds: onlineIds });
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.onlineUsers.keys());
  }

  // Методы для отправки событий
  emitEntityCreated(data: any) {
    this.server.emit('entity:created', data);
  }

  emitEntityUpdated(data: any) {
    this.server.emit('entity:updated', data);
  }

  emitStatusChanged(data: any) {
    this.server.emit('status:changed', data);
  }

  emitCommentCreated(data: any) {
    this.server.emit('comment:created', data);
  }

  emitAssigneeChanged(data: {
    entityId: string;
    entity: any;
    assigneeId: string | null;
    previousAssigneeId: string | null;
  }) {
    this.server.emit('user:assigned', data);
  }

  // Отправка события конкретному пользователю по userId
  emitToUser(userId: string, event: string, data: any) {
    const clients = this.server.sockets.sockets;
    clients.forEach((client: AuthenticatedSocket) => {
      if (client.data?.user?.sub === userId) {
        client.emit(event, data);
      }
    });
  }

  // Отправка события в workspace (broadcast с workspaceId в payload)
  emitToWorkspace(workspaceId: string, event: string, data: any) {
    // Отправляем всем клиентам с workspaceId в payload
    // Клиент фильтрует по workspaceId
    this.server.emit(event, { ...data, workspaceId });
  }

  // SLA Real-time updates
  emitSlaUpdate(workspaceId: string, data: {
    targetId: string;
    targetType: string;
    instanceId: string;
    responseStatus: string;
    resolutionStatus: string;
    responseDueAt: Date | null;
    resolutionDueAt: Date | null;
    responseRemainingMinutes: number | null;
    resolutionRemainingMinutes: number | null;
    responseUsedPercent: number | null;
    resolutionUsedPercent: number | null;
    isPaused: boolean;
    definitionName: string;
  }) {
    this.server.emit('sla:update', { ...data, workspaceId });
  }

  // Batch SLA updates for multiple entities
  emitSlaBatchUpdate(workspaceId: string, updates: Array<{
    targetId: string;
    targetType: string;
    instanceId: string;
    responseRemainingMinutes: number | null;
    resolutionRemainingMinutes: number | null;
    responseUsedPercent: number | null;
    resolutionUsedPercent: number | null;
    isPaused: boolean;
  }>) {
    this.server.emit('sla:batch-update', { workspaceId, updates });
  }

  @SubscribeMessage('sla:subscribe')
  handleSlaSubscribe(client: AuthenticatedSocket, payload: { entityIds: string[] }): void {
    // Client wants to subscribe to SLA updates for specific entities
    client.join(payload.entityIds.map(id => `sla:${id}`));
    console.log(`Client ${client.id} subscribed to SLA updates for ${payload.entityIds.length} entities`);
  }

  @SubscribeMessage('sla:unsubscribe')
  handleSlaUnsubscribe(client: AuthenticatedSocket, payload: { entityIds: string[] }): void {
    payload.entityIds.forEach(id => client.leave(`sla:${id}`));
    console.log(`Client ${client.id} unsubscribed from SLA updates`);
  }

  @SubscribeMessage('message')
  handleMessage(_client: Socket, _payload: unknown): string {
    return 'Message received';
  }
}
