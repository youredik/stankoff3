import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { EventsGateway } from '../websocket/events.gateway';
import { S3Service } from '../s3/s3.service';

// Response attachment type with signed URLs
export interface AttachmentWithUrls {
  id: string;
  name: string;
  size: number;
  url: string;
  mimeType: string;
  thumbnailUrl?: string;
  key: string; // S3 key for download endpoint
}

// Comment response type with signed URLs
export interface CommentWithUrls extends Omit<Comment, 'attachments'> {
  attachments: AttachmentWithUrls[];
}

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    private eventsGateway: EventsGateway,
    private s3Service: S3Service,
  ) {}

  async findOne(id: string): Promise<Comment | null> {
    return this.commentRepository.findOne({
      where: { id },
      relations: ['author'],
    });
  }

  async findByEntity(entityId: string): Promise<CommentWithUrls[]> {
    const comments = await this.commentRepository.find({
      where: { entityId },
      relations: ['author'],
      order: { createdAt: 'ASC' },
    });

    // Collect all S3 keys for batch signed URL generation
    const allKeys: string[] = [];
    for (const comment of comments) {
      for (const att of comment.attachments || []) {
        allKeys.push(att.key);
        if (att.thumbnailKey) {
          allKeys.push(att.thumbnailKey);
        }
      }
    }

    // Generate signed URLs in batch
    const signedUrls = allKeys.length > 0
      ? await this.s3Service.getSignedUrlsBatch(allKeys)
      : new Map<string, string>();

    // Map comments with signed URLs
    return comments.map((comment) => ({
      ...comment,
      attachments: (comment.attachments || []).map((att) => ({
        id: att.id,
        name: att.name,
        size: att.size,
        mimeType: att.mimeType,
        key: att.key,
        url: signedUrls.get(att.key) || '',
        thumbnailUrl: att.thumbnailKey ? signedUrls.get(att.thumbnailKey) : undefined,
      })),
    }));
  }

  async create(
    entityId: string,
    dto: CreateCommentDto,
  ): Promise<CommentWithUrls> {
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

    // Generate signed URLs for attachments
    const allKeys: string[] = [];
    for (const att of withAuthor!.attachments || []) {
      allKeys.push(att.key);
      if (att.thumbnailKey) {
        allKeys.push(att.thumbnailKey);
      }
    }

    const signedUrls = allKeys.length > 0
      ? await this.s3Service.getSignedUrlsBatch(allKeys)
      : new Map<string, string>();

    const result: CommentWithUrls = {
      ...withAuthor!,
      attachments: (withAuthor!.attachments || []).map((att) => ({
        id: att.id,
        name: att.name,
        size: att.size,
        mimeType: att.mimeType,
        key: att.key,
        url: signedUrls.get(att.key) || '',
        thumbnailUrl: att.thumbnailKey ? signedUrls.get(att.thumbnailKey) : undefined,
      })),
    };

    this.eventsGateway.emitCommentCreated(result);
    return result;
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
