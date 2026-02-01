import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
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

  @SubscribeMessage('message')
  handleMessage(client: Socket, payload: any): string {
    return 'Message received';
  }
}
