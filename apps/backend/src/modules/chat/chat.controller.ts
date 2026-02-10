import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/user.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { AddParticipantsDto } from './dto/add-participants.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ─── Conversations ──────────────────────────────────────

  @Get('conversations')
  getConversations(
    @CurrentUser() user: User,
    @Query('search') search?: string,
  ) {
    return this.chatService.getUserConversations(user.id, search);
  }

  @Post('conversations')
  createConversation(
    @CurrentUser() user: User,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createConversation(user.id, dto);
  }

  @Get('conversations/for-entity/:entityId')
  getEntityConversation(
    @CurrentUser() user: User,
    @Param('entityId') entityId: string,
  ) {
    return this.chatService.getEntityConversation(entityId, user.id);
  }

  @Get('unread-counts')
  getUnreadCounts(@CurrentUser() user: User) {
    return this.chatService.getUnreadCounts(user.id);
  }

  @Get('search')
  searchMessages(
    @CurrentUser() user: User,
    @Query('q') query: string,
  ) {
    return this.chatService.searchMessages(user.id, query);
  }

  @Get('conversations/:id')
  getConversation(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.chatService.getConversation(id, user.id);
  }

  // ─── Messages ──────────────────────────────────────────

  @Get('conversations/:id/messages')
  getMessages(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.chatService.getMessages(id, user.id, query);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(id, user.id, dto);
  }

  @Patch('conversations/:id/messages/:msgId')
  editMessage(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('msgId') msgId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.chatService.editMessage(id, msgId, user.id, dto);
  }

  @Delete('conversations/:id/messages/:msgId')
  deleteMessage(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('msgId') msgId: string,
  ) {
    return this.chatService.deleteMessage(id, msgId, user.id);
  }

  // ─── Read status ──────────────────────────────────────

  @Post('conversations/:id/read')
  markAsRead(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.chatService.markAsRead(id, user.id, dto);
  }

  // ─── Participants ──────────────────────────────────────

  @Post('conversations/:id/participants')
  addParticipants(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AddParticipantsDto,
  ) {
    return this.chatService.addParticipants(id, user.id, dto.userIds);
  }

  @Delete('conversations/:id/participants/:userId')
  removeParticipant(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.chatService.removeParticipant(id, user.id, targetUserId);
  }
}
