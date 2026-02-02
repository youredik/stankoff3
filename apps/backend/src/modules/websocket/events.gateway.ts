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

  @SubscribeMessage('message')
  handleMessage(client: Socket, payload: any): string {
    return 'Message received';
  }
}
