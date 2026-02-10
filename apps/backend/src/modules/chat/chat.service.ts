import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Conversation, ConversationType } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message } from './entities/message.entity';
import { MessageReaction } from './entities/message-reaction.entity';
import { PinnedMessage } from './entities/pinned-message.entity';
import { EventsGateway } from '../websocket/events.gateway';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
    @InjectRepository(MessageReaction)
    private reactionRepo: Repository<MessageReaction>,
    @InjectRepository(PinnedMessage)
    private pinnedRepo: Repository<PinnedMessage>,
    private eventsGateway: EventsGateway,
  ) {}

  // ─── Conversations ──────────────────────────────────────────

  async getUserConversations(userId: string, search?: string) {
    const qb = this.conversationRepo
      .createQueryBuilder('c')
      .innerJoin('c.participants', 'cp', 'cp.userId = :userId AND cp.leftAt IS NULL', { userId })
      .leftJoinAndSelect('c.lastMessageAuthor', 'lma')
      .leftJoinAndSelect('c.participants', 'allp', 'allp.leftAt IS NULL')
      .leftJoinAndSelect('allp.user', 'pu')
      .orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('c.createdAt', 'DESC');

    if (search) {
      qb.andWhere('(c.name ILIKE :search OR c.lastMessagePreview ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const conversations = await qb.getMany();

    // Compute unread counts
    const unreadCounts = await this.getUnreadCountsMap(userId);

    return conversations.map((conv) => ({
      ...conv,
      unreadCount: unreadCounts[conv.id] || 0,
    }));
  }

  async createConversation(userId: string, dto: CreateConversationDto) {
    // Direct chat deduplication
    if (dto.type === 'direct') {
      if (dto.participantIds.length !== 1) {
        throw new BadRequestException('Direct chat requires exactly one other participant');
      }
      const existing = await this.findDirectChat(userId, dto.participantIds[0]);
      if (existing) return existing;
    }

    // Entity chat deduplication
    if (dto.type === 'entity' && dto.entityId) {
      const existing = await this.conversationRepo.findOne({
        where: { entityId: dto.entityId },
        relations: ['participants', 'participants.user'],
      });
      if (existing) {
        // Add user as participant if not already
        await this.ensureParticipant(existing.id, userId);
        return existing;
      }
    }

    const conversation = this.conversationRepo.create({
      type: dto.type,
      name: dto.name || null,
      entityId: dto.entityId || null,
      createdById: userId,
    });

    const saved = await this.conversationRepo.save(conversation);

    // Add creator as owner
    await this.participantRepo.save(
      this.participantRepo.create({
        conversationId: saved.id,
        userId,
        role: 'owner',
      }),
    );

    // Add other participants
    for (const participantId of dto.participantIds) {
      if (participantId !== userId) {
        await this.participantRepo.save(
          this.participantRepo.create({
            conversationId: saved.id,
            userId: participantId,
            role: 'member',
          }),
        );
      }
    }

    const full = await this.getConversationWithParticipants(saved.id);

    // Notify all participants
    const participantIds = [userId, ...dto.participantIds];
    for (const pid of new Set(participantIds)) {
      this.eventsGateway.emitToUser(pid, 'chat:conversation:created', full);
    }

    return full;
  }

  async getConversation(conversationId: string, userId: string) {
    await this.assertParticipant(conversationId, userId);
    return this.getConversationWithParticipants(conversationId);
  }

  async getOrCreateDirectChat(userId: string, otherUserId: string) {
    const existing = await this.findDirectChat(userId, otherUserId);
    if (existing) return existing;

    return this.createConversation(userId, {
      type: 'direct',
      participantIds: [otherUserId],
    });
  }

  async getOrCreateEntityChat(userId: string, entityId: string) {
    const existing = await this.conversationRepo.findOne({
      where: { entityId },
      relations: ['participants', 'participants.user', 'lastMessageAuthor'],
    });

    if (existing) {
      await this.ensureParticipant(existing.id, userId);
      return this.getConversationWithParticipants(existing.id);
    }

    return this.createConversation(userId, {
      type: 'entity',
      entityId,
      participantIds: [],
    });
  }

  // ─── Messages ──────────────────────────────────────────────

  async getMessages(conversationId: string, userId: string, query: MessagesQueryDto) {
    await this.assertParticipant(conversationId, userId);

    const limit = query.limit || 50;

    const qb = this.messageRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.author', 'a')
      .leftJoinAndSelect('m.replyTo', 'rt')
      .leftJoinAndSelect('rt.author', 'rta')
      .where('m.conversationId = :conversationId', { conversationId })
      .andWhere('m.isDeleted = false')
      .orderBy('m.createdAt', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const cursorMessage = await this.messageRepo.findOne({ where: { id: query.cursor } });
      if (cursorMessage) {
        qb.andWhere('m.createdAt < :cursorDate', { cursorDate: cursorMessage.createdAt });
      }
    }

    const messages = await qb.getMany();
    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return {
      messages: messages.reverse(),
      hasMore,
      nextCursor: hasMore ? messages[0]?.id : null,
    };
  }

  async sendMessage(conversationId: string, userId: string, dto: SendMessageDto) {
    await this.assertParticipant(conversationId, userId);

    const message = this.messageRepo.create({
      conversationId,
      authorId: userId,
      content: dto.content || null,
      type: dto.type || 'text',
      replyToId: dto.replyToId || null,
      attachments: dto.attachments || [],
      voiceKey: dto.voiceKey || null,
      voiceDuration: dto.voiceDuration ?? null,
      voiceWaveform: dto.voiceWaveform || null,
      mentionedUserIds: dto.mentionedUserIds || [],
    });

    const saved = await this.messageRepo.save(message);

    // Update conversation preview
    const preview = dto.type === 'voice'
      ? 'Голосовое сообщение'
      : (dto.content || '').replace(/<[^>]*>/g, '').substring(0, 100);

    await this.conversationRepo.update(conversationId, {
      lastMessageAt: saved.createdAt,
      lastMessagePreview: preview,
      lastMessageAuthorId: userId,
    });

    // Load full message with relations
    const full = await this.messageRepo.findOne({
      where: { id: saved.id },
      relations: ['author', 'replyTo', 'replyTo.author'],
    });

    // Emit to all participants via room
    this.emitToConversation(conversationId, 'chat:message', {
      conversationId,
      message: full,
    });

    // Also emit conversation update for list reordering
    this.emitToConversation(conversationId, 'chat:conversation:updated', {
      conversationId,
      lastMessageAt: saved.createdAt,
      lastMessagePreview: preview,
      lastMessageAuthorId: userId,
    });

    return full;
  }

  async editMessage(conversationId: string, messageId: string, userId: string, dto: EditMessageDto) {
    const message = await this.messageRepo.findOne({
      where: { id: messageId, conversationId },
    });

    if (!message) throw new NotFoundException('Сообщение не найдено');
    if (message.authorId !== userId) throw new ForbiddenException('Можно редактировать только свои сообщения');
    if (message.isDeleted) throw new BadRequestException('Сообщение удалено');

    message.content = dto.content;
    message.isEdited = true;
    const updated = await this.messageRepo.save(message);

    const full = await this.messageRepo.findOne({
      where: { id: updated.id },
      relations: ['author', 'replyTo', 'replyTo.author'],
    });

    this.emitToConversation(conversationId, 'chat:message:edited', {
      conversationId,
      message: full,
    });

    return full;
  }

  async deleteMessage(conversationId: string, messageId: string, userId: string) {
    const message = await this.messageRepo.findOne({
      where: { id: messageId, conversationId },
    });

    if (!message) throw new NotFoundException('Сообщение не найдено');
    if (message.authorId !== userId) throw new ForbiddenException('Можно удалять только свои сообщения');

    message.isDeleted = true;
    await this.messageRepo.save(message);

    this.emitToConversation(conversationId, 'chat:message:deleted', {
      conversationId,
      messageId,
    });

    return { success: true };
  }

  // ─── Read status ──────────────────────────────────────────

  async markAsRead(conversationId: string, userId: string, dto: MarkReadDto) {
    const participant = await this.assertParticipant(conversationId, userId);

    participant.lastReadMessageId = dto.lastReadMessageId;
    participant.lastReadAt = new Date();
    await this.participantRepo.save(participant);

    this.emitToConversation(conversationId, 'chat:read', {
      conversationId,
      userId,
      lastReadMessageId: dto.lastReadMessageId,
    });

    return { success: true };
  }

  async getUnreadCounts(userId: string): Promise<Record<string, number>> {
    return this.getUnreadCountsMap(userId);
  }

  // ─── Participants ──────────────────────────────────────────

  async addParticipants(conversationId: string, userId: string, userIds: string[]) {
    await this.assertParticipant(conversationId, userId);

    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Чат не найден');
    if (conversation.type === 'direct') {
      throw new BadRequestException('Нельзя добавить участников в личный чат');
    }

    const added: string[] = [];
    for (const uid of userIds) {
      const existing = await this.participantRepo.findOne({
        where: { conversationId, userId: uid },
      });
      if (existing && !existing.leftAt) continue;

      if (existing) {
        existing.leftAt = null;
        existing.role = 'member';
        await this.participantRepo.save(existing);
      } else {
        await this.participantRepo.save(
          this.participantRepo.create({
            conversationId,
            userId: uid,
            role: 'member',
          }),
        );
      }
      added.push(uid);
    }

    // System message about added users
    if (added.length > 0) {
      await this.sendSystemMessage(conversationId, userId, 'participants_added', { userIds: added });
    }

    return this.getConversationWithParticipants(conversationId);
  }

  async removeParticipant(conversationId: string, userId: string, targetUserId: string) {
    await this.assertParticipant(conversationId, userId);

    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Чат не найден');
    if (conversation.type === 'direct') {
      throw new BadRequestException('Нельзя удалить участника из личного чата');
    }

    const target = await this.participantRepo.findOne({
      where: { conversationId, userId: targetUserId, leftAt: IsNull() },
    });
    if (!target) throw new NotFoundException('Участник не найден');

    target.leftAt = new Date();
    await this.participantRepo.save(target);

    await this.sendSystemMessage(conversationId, userId, 'participant_removed', {
      userId: targetUserId,
    });

    return { success: true };
  }

  // ─── Search ──────────────────────────────────────────────

  async searchMessages(userId: string, query: string) {
    const participantConvIds = await this.participantRepo
      .createQueryBuilder('cp')
      .select('cp.conversationId')
      .where('cp.userId = :userId AND cp.leftAt IS NULL', { userId })
      .getRawMany()
      .then((rows) => rows.map((r) => r.cp_conversationId));

    if (participantConvIds.length === 0) return [];

    const results = await this.messageRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.author', 'a')
      .leftJoinAndSelect('m.conversation', 'c')
      .where('m.conversationId IN (:...convIds)', { convIds: participantConvIds })
      .andWhere('m.isDeleted = false')
      .andWhere(`m."searchVector" @@ plainto_tsquery('russian', :query)`, { query })
      .orderBy(`ts_rank(m."searchVector", plainto_tsquery('russian', :query))`, 'DESC')
      .take(50)
      .getMany();

    return results;
  }

  // ─── Entity chat ──────────────────────────────────────────

  async getEntityConversation(entityId: string, userId: string) {
    const conversation = await this.conversationRepo.findOne({
      where: { entityId },
      relations: ['participants', 'participants.user', 'lastMessageAuthor'],
    });

    if (!conversation) return null;

    await this.ensureParticipant(conversation.id, userId);
    return this.getConversationWithParticipants(conversation.id);
  }

  // ─── Reactions ──────────────────────────────────────────────

  async toggleReaction(conversationId: string, messageId: string, userId: string, emoji: string) {
    await this.assertParticipant(conversationId, userId);

    const message = await this.messageRepo.findOne({
      where: { id: messageId, conversationId },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');

    const existing = await this.reactionRepo.findOne({
      where: { messageId, userId, emoji },
    });

    if (existing) {
      await this.reactionRepo.remove(existing);
    } else {
      await this.reactionRepo.save(
        this.reactionRepo.create({ messageId, userId, emoji }),
      );
    }

    const reactions = await this.getAggregatedReactions(messageId);

    this.emitToConversation(conversationId, 'chat:reaction', {
      conversationId,
      messageId,
      reactions,
    });

    return reactions;
  }

  private async getAggregatedReactions(messageId: string) {
    const raw = await this.reactionRepo.find({
      where: { messageId },
      order: { createdAt: 'ASC' },
    });

    const map: Record<string, string[]> = {};
    for (const r of raw) {
      if (!map[r.emoji]) map[r.emoji] = [];
      map[r.emoji].push(r.userId);
    }

    return Object.entries(map).map(([emoji, userIds]) => ({
      emoji,
      userIds,
      count: userIds.length,
    }));
  }

  // ─── Pinned messages ──────────────────────────────────────

  async getPinnedMessages(conversationId: string, userId: string) {
    await this.assertParticipant(conversationId, userId);

    const pinned = await this.pinnedRepo.find({
      where: { conversationId },
      relations: ['message', 'message.author'],
      order: { pinnedAt: 'ASC' },
    });

    return pinned.map((p) => ({
      ...p.message,
      isPinned: true,
    }));
  }

  async pinMessage(conversationId: string, messageId: string, userId: string) {
    await this.assertParticipant(conversationId, userId);

    const message = await this.messageRepo.findOne({
      where: { id: messageId, conversationId },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');

    const existing = await this.pinnedRepo.findOne({
      where: { conversationId, messageId },
    });
    if (existing) throw new BadRequestException('Сообщение уже закреплено');

    await this.pinnedRepo.save(
      this.pinnedRepo.create({ conversationId, messageId, pinnedById: userId }),
    );

    const full = await this.messageRepo.findOne({
      where: { id: messageId },
      relations: ['author'],
    });

    this.emitToConversation(conversationId, 'chat:message:pinned', {
      conversationId,
      message: { ...full, isPinned: true },
    });

    return { success: true };
  }

  async unpinMessage(conversationId: string, messageId: string, userId: string) {
    await this.assertParticipant(conversationId, userId);

    const pin = await this.pinnedRepo.findOne({
      where: { conversationId, messageId },
    });
    if (!pin) throw new NotFoundException('Сообщение не закреплено');

    await this.pinnedRepo.remove(pin);

    this.emitToConversation(conversationId, 'chat:message:unpinned', {
      conversationId,
      messageId,
    });

    return { success: true };
  }

  // ─── Helpers ──────────────────────────────────────────────

  private async findDirectChat(userId1: string, userId2: string): Promise<Conversation | null> {
    // Find a direct chat where both users are active participants
    const result = await this.conversationRepo
      .createQueryBuilder('c')
      .innerJoin('c.participants', 'p1', 'p1.userId = :u1 AND p1.leftAt IS NULL', { u1: userId1 })
      .innerJoin('c.participants', 'p2', 'p2.userId = :u2 AND p2.leftAt IS NULL', { u2: userId2 })
      .leftJoinAndSelect('c.participants', 'allp', 'allp.leftAt IS NULL')
      .leftJoinAndSelect('allp.user', 'pu')
      .leftJoinAndSelect('c.lastMessageAuthor', 'lma')
      .where('c.type = :type', { type: 'direct' })
      .getOne();

    return result;
  }

  private async assertParticipant(conversationId: string, userId: string): Promise<ConversationParticipant> {
    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId, leftAt: IsNull() },
    });
    if (!participant) throw new ForbiddenException('Вы не участник этого чата');
    return participant;
  }

  private async ensureParticipant(conversationId: string, userId: string) {
    const existing = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });
    if (existing && !existing.leftAt) return;

    if (existing) {
      existing.leftAt = null;
      await this.participantRepo.save(existing);
    } else {
      await this.participantRepo.save(
        this.participantRepo.create({
          conversationId,
          userId,
          role: 'member',
        }),
      );
    }
  }

  private async getConversationWithParticipants(conversationId: string) {
    return this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: ['participants', 'participants.user', 'lastMessageAuthor'],
    });
  }

  private async getUnreadCountsMap(userId: string): Promise<Record<string, number>> {
    const result = await this.participantRepo
      .createQueryBuilder('cp')
      .select('cp.conversationId', 'conversationId')
      .addSelect(
        `(SELECT COUNT(*) FROM messages m
          WHERE m."conversationId" = cp."conversationId"
          AND m."isDeleted" = false
          AND m."authorId" != :userId
          AND (cp."lastReadAt" IS NULL OR m."createdAt" > cp."lastReadAt"))`,
        'count',
      )
      .where('cp.userId = :userId AND cp.leftAt IS NULL', { userId })
      .setParameter('userId', userId)
      .getRawMany();

    const map: Record<string, number> = {};
    for (const row of result) {
      const count = parseInt(row.count, 10);
      if (count > 0) map[row.conversationId] = count;
    }
    return map;
  }

  private async sendSystemMessage(
    conversationId: string,
    actorId: string,
    action: string,
    data: Record<string, any>,
  ) {
    const message = this.messageRepo.create({
      conversationId,
      authorId: actorId,
      type: 'system',
      content: JSON.stringify({ action, ...data }),
    });
    const saved = await this.messageRepo.save(message);

    const full = await this.messageRepo.findOne({
      where: { id: saved.id },
      relations: ['author'],
    });

    this.emitToConversation(conversationId, 'chat:message', {
      conversationId,
      message: full,
    });
  }

  private async emitToConversation(conversationId: string, event: string, data: any) {
    // Get all active participants and emit to each
    const participants = await this.participantRepo.find({
      where: { conversationId, leftAt: IsNull() },
    });

    for (const p of participants) {
      this.eventsGateway.emitToUser(p.userId, event, data);
    }
  }
}
