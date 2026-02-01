import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { EventsGateway } from '../websocket/events.gateway';

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    private eventsGateway: EventsGateway,
  ) {}

  async findByEntity(entityId: string): Promise<Comment[]> {
    return this.commentRepository.find({
      where: { entityId },
      relations: ['author'],
      order: { createdAt: 'ASC' },
    });
  }

  async create(
    entityId: string,
    dto: CreateCommentDto,
  ): Promise<Comment> {
    const comment = this.commentRepository.create({
      entityId,
      authorId: dto.authorId,
      content: dto.content,
      attachments: dto.attachments || [],
    });
    const saved = await this.commentRepository.save(comment);
    const withAuthor = await this.commentRepository.findOne({
      where: { id: saved.id },
      relations: ['author'],
    });
    this.eventsGateway.emitCommentCreated(withAuthor);
    return withAuthor!;
  }

  async update(id: string, content: string): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id },
      relations: ['author'],
    });
    if (!comment) {
      throw new NotFoundException(`Comment ${id} not found`);
    }
    comment.content = content;
    return this.commentRepository.save(comment);
  }

  async remove(id: string): Promise<void> {
    const comment = await this.commentRepository.findOne({ where: { id } });
    if (!comment) {
      throw new NotFoundException(`Comment ${id} not found`);
    }
    await this.commentRepository.remove(comment);
  }
}
