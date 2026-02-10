import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message } from './entities/message.entity';
import { MessageReaction } from './entities/message-reaction.entity';
import { PinnedMessage } from './entities/pinned-message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationParticipant, Message, MessageReaction, PinnedMessage]),
    WebsocketModule,
  ],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
