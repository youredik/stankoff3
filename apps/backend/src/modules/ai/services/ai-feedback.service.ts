import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { AiFeedback, FeedbackType, FeedbackRating } from '../entities/ai-feedback.entity';

@Injectable()
export class AiFeedbackService {
  private readonly logger = new Logger(AiFeedbackService.name);

  constructor(
    @InjectRepository(AiFeedback)
    private readonly feedbackRepo: Repository<AiFeedback>,
  ) {}

  /**
   * Создать или обновить feedback (upsert по user + type + entityId)
   */
  async submitFeedback(params: {
    type: FeedbackType;
    entityId?: string;
    userId: string;
    rating: FeedbackRating;
    metadata?: Record<string, unknown>;
  }): Promise<AiFeedback> {
    const existing = await this.feedbackRepo.findOne({
      where: {
        type: params.type,
        entityId: params.entityId || undefined,
        userId: params.userId,
      },
    });

    if (existing) {
      existing.rating = params.rating;
      existing.metadata = { ...existing.metadata, ...params.metadata };
      return this.feedbackRepo.save(existing);
    }

    return this.feedbackRepo.save(
      this.feedbackRepo.create({
        type: params.type,
        entityId: params.entityId,
        userId: params.userId,
        rating: params.rating,
        metadata: params.metadata || {},
      }),
    );
  }

  /**
   * Получить статистику feedback
   */
  async getFeedbackStats(options?: {
    type?: FeedbackType;
    days?: number;
    entityId?: string;
  }): Promise<{
    totalPositive: number;
    totalNegative: number;
    byType: Record<string, { positive: number; negative: number }>;
    satisfactionRate: number;
  }> {
    const qb = this.feedbackRepo.createQueryBuilder('f');

    if (options?.type) {
      qb.andWhere('f.type = :type', { type: options.type });
    }
    if (options?.days) {
      const since = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
      qb.andWhere('f.created_at > :since', { since });
    }
    if (options?.entityId) {
      qb.andWhere('f.entity_id = :entityId', { entityId: options.entityId });
    }

    const feedbacks = await qb.getMany();

    const totalPositive = feedbacks.filter(f => f.rating === 'positive').length;
    const totalNegative = feedbacks.filter(f => f.rating === 'negative').length;
    const total = totalPositive + totalNegative;

    // Группировка по типу
    const byType: Record<string, { positive: number; negative: number }> = {};
    for (const f of feedbacks) {
      if (!byType[f.type]) byType[f.type] = { positive: 0, negative: 0 };
      byType[f.type][f.rating]++;
    }

    return {
      totalPositive,
      totalNegative,
      byType,
      satisfactionRate: total > 0 ? Math.round((totalPositive / total) * 100) : 0,
    };
  }

  /**
   * Получить feedback пользователя для конкретной entity
   */
  async getUserFeedbackForEntity(
    entityId: string,
    userId: string,
    type?: FeedbackType,
  ): Promise<AiFeedback[]> {
    const where: Record<string, unknown> = { entityId, userId };
    if (type) where.type = type;
    return this.feedbackRepo.find({ where });
  }
}
