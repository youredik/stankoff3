import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import { WorkspaceEntity } from '../entity.entity';
import { User } from '../../user/user.entity';
import { Comment } from '../comment.entity';

// Types for recommendations
export interface AssigneeRecommendation {
  userId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  score: number;
  reasons: string[];
}

export interface PriorityRecommendation {
  suggestedPriority: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  reasons: string[];
}

export interface ResponseTimeEstimate {
  estimatedMinutes: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  basedOnSamples: number;
  factors: string[];
}

export interface SimilarEntity {
  entityId: string;
  customId: string;
  title: string;
  status: string;
  similarity: number;
  matchingTerms: string[];
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
  ) {}

  /**
   * Recommend assignees for an entity based on workload, expertise, and history
   */
  async recommendAssignees(
    workspaceId: string,
    entityTitle: string,
    entityDescription?: string,
    limit: number = 5,
  ): Promise<AssigneeRecommendation[]> {
    // Get all users who have been assigned entities in this workspace
    const recentEntities = await this.entityRepository.find({
      where: { workspaceId },
      relations: ['assignee'],
      order: { createdAt: 'DESC' },
      take: 500,
    });

    // Build user statistics
    const userStats = new Map<
      string,
      {
        user: User;
        totalAssigned: number;
        activeCount: number;
        completedCount: number;
        avgResolutionTime: number;
        keywords: Map<string, number>;
      }
    >();

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const entity of recentEntities) {
      if (!entity.assignee) continue;

      const userId = entity.assignee.id;
      let stats = userStats.get(userId);

      if (!stats) {
        stats = {
          user: entity.assignee,
          totalAssigned: 0,
          activeCount: 0,
          completedCount: 0,
          avgResolutionTime: 0,
          keywords: new Map(),
        };
        userStats.set(userId, stats);
      }

      stats.totalAssigned++;

      // Count active vs completed
      if (entity.status === 'done' || entity.status === 'closed') {
        stats.completedCount++;
        // Calculate resolution time if available
        if (entity.resolvedAt && entity.createdAt) {
          const resolutionTime =
            entity.resolvedAt.getTime() - entity.createdAt.getTime();
          stats.avgResolutionTime =
            (stats.avgResolutionTime * (stats.completedCount - 1) +
              resolutionTime) /
            stats.completedCount;
        }
      } else {
        stats.activeCount++;
      }

      // Extract keywords from title
      const words = this.extractKeywords(entity.title);
      for (const word of words) {
        const count = stats.keywords.get(word) || 0;
        stats.keywords.set(word, count + 1);
      }
    }

    // Calculate scores for each user
    const inputKeywords = this.extractKeywords(
      `${entityTitle} ${entityDescription || ''}`,
    );
    const recommendations: AssigneeRecommendation[] = [];

    for (const [userId, stats] of userStats) {
      const reasons: string[] = [];
      let score = 50; // Base score

      // Factor 1: Workload (fewer active = higher score)
      const workloadScore = Math.max(0, 20 - stats.activeCount * 2);
      score += workloadScore;
      if (stats.activeCount < 3) {
        reasons.push('Низкая загрузка');
      }

      // Factor 2: Experience (more completed = higher score, up to a point)
      const experienceScore = Math.min(20, stats.completedCount * 2);
      score += experienceScore;
      if (stats.completedCount >= 10) {
        reasons.push('Большой опыт решения заявок');
      }

      // Factor 3: Resolution speed (faster = higher score)
      if (stats.completedCount > 0 && stats.avgResolutionTime > 0) {
        const avgHours = stats.avgResolutionTime / (1000 * 60 * 60);
        if (avgHours < 4) {
          score += 15;
          reasons.push('Быстрое время решения');
        } else if (avgHours < 24) {
          score += 10;
        }
      }

      // Factor 4: Keyword matching (expertise)
      let keywordMatches = 0;
      for (const keyword of inputKeywords) {
        if (stats.keywords.has(keyword)) {
          keywordMatches++;
        }
      }
      if (keywordMatches > 0 && inputKeywords.length > 0) {
        const keywordScore = (keywordMatches / inputKeywords.length) * 20;
        score += keywordScore;
        if (keywordMatches >= 2) {
          reasons.push('Соответствие ключевым словам');
        }
      }

      // Normalize score to 0-100
      score = Math.min(100, Math.max(0, score));

      recommendations.push({
        userId,
        user: {
          id: stats.user.id,
          firstName: stats.user.firstName,
          lastName: stats.user.lastName,
          email: stats.user.email,
        },
        score: Math.round(score),
        reasons: reasons.length > 0 ? reasons : ['Доступен для назначения'],
      });
    }

    // Sort by score and return top N
    return recommendations.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Recommend priority based on content analysis
   */
  async recommendPriority(
    workspaceId: string,
    entityTitle: string,
    entityDescription?: string,
  ): Promise<PriorityRecommendation> {
    const content = `${entityTitle} ${entityDescription || ''}`.toLowerCase();
    const reasons: string[] = [];
    let priorityScore = 0;

    // High priority keywords
    const criticalKeywords = [
      'срочно',
      'urgent',
      'критично',
      'critical',
      'авария',
      'не работает',
      'сломано',
      'broken',
      'down',
      'emergency',
      'асап',
      'asap',
    ];
    const highKeywords = [
      'важно',
      'important',
      'приоритет',
      'priority',
      'быстро',
      'быстрее',
      'оперативно',
      'блокирует',
      'blocking',
      'regression',
    ];
    const mediumKeywords = [
      'проблема',
      'issue',
      'ошибка',
      'error',
      'bug',
      'баг',
      'не могу',
      'cannot',
      'help',
      'помощь',
    ];

    // Check for critical keywords
    for (const keyword of criticalKeywords) {
      if (content.includes(keyword)) {
        priorityScore += 40;
        reasons.push(`Обнаружено критическое слово: "${keyword}"`);
        break;
      }
    }

    // Check for high keywords
    for (const keyword of highKeywords) {
      if (content.includes(keyword)) {
        priorityScore += 25;
        reasons.push(`Обнаружено важное слово: "${keyword}"`);
        break;
      }
    }

    // Check for medium keywords
    for (const keyword of mediumKeywords) {
      if (content.includes(keyword)) {
        priorityScore += 10;
        reasons.push(`Обнаружено проблемное слово: "${keyword}"`);
        break;
      }
    }

    // Analyze based on similar past entities
    const similarEntities = await this.entityRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const inputKeywords = this.extractKeywords(content);
    let matchingHighPriority = 0;
    let matchingTotal = 0;

    for (const entity of similarEntities) {
      const entityKeywords = this.extractKeywords(entity.title);
      const overlap = inputKeywords.filter((k) =>
        entityKeywords.includes(k),
      ).length;

      if (overlap >= 2) {
        matchingTotal++;
        // Check if entity was high priority (we use custom field or status progression speed)
        if (entity.resolvedAt && entity.createdAt) {
          const resolutionHours =
            (entity.resolvedAt.getTime() - entity.createdAt.getTime()) /
            (1000 * 60 * 60);
          if (resolutionHours < 4) {
            matchingHighPriority++;
          }
        }
      }
    }

    if (matchingTotal > 3 && matchingHighPriority / matchingTotal > 0.5) {
      priorityScore += 15;
      reasons.push('Похожие заявки решались быстро');
    }

    // Determine priority level
    let suggestedPriority: 'low' | 'medium' | 'high' | 'critical';
    let confidence: number;

    if (priorityScore >= 50) {
      suggestedPriority = 'critical';
      confidence = Math.min(0.9, 0.6 + priorityScore / 200);
    } else if (priorityScore >= 30) {
      suggestedPriority = 'high';
      confidence = Math.min(0.85, 0.5 + priorityScore / 150);
    } else if (priorityScore >= 10) {
      suggestedPriority = 'medium';
      confidence = Math.min(0.7, 0.4 + priorityScore / 100);
    } else {
      suggestedPriority = 'low';
      confidence = 0.5;
      reasons.push('Стандартная заявка');
    }

    return {
      suggestedPriority,
      confidence: Math.round(confidence * 100) / 100,
      reasons: reasons.length > 0 ? reasons : ['Автоматическая оценка'],
    };
  }

  /**
   * Estimate response time based on historical data
   */
  async estimateResponseTime(
    workspaceId: string,
    entityTitle?: string,
    assigneeId?: string,
  ): Promise<ResponseTimeEstimate> {
    const whereConditions: Record<string, unknown> = {
      workspaceId,
      firstResponseAt: MoreThan(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // Last 30 days
    };

    if (assigneeId) {
      whereConditions.assigneeId = assigneeId;
    }

    const recentEntities = await this.entityRepository.find({
      where: whereConditions,
      order: { createdAt: 'DESC' },
      take: 100,
    });

    // Calculate response times
    const responseTimes: number[] = [];
    for (const entity of recentEntities) {
      if (entity.firstResponseAt && entity.createdAt) {
        const responseTime =
          (entity.firstResponseAt.getTime() - entity.createdAt.getTime()) / 60000; // minutes
        if (responseTime > 0 && responseTime < 60 * 24 * 7) {
          // Filter outliers (> 1 week)
          responseTimes.push(responseTime);
        }
      }
    }

    const factors: string[] = [];

    if (responseTimes.length === 0) {
      return {
        estimatedMinutes: 60, // Default 1 hour
        confidenceLevel: 'low',
        basedOnSamples: 0,
        factors: ['Недостаточно данных, используется значение по умолчанию'],
      };
    }

    // Calculate statistics
    const sorted = responseTimes.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean =
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const stdDev = Math.sqrt(
      responseTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) /
        responseTimes.length,
    );

    // Use median as estimate (more robust to outliers)
    let estimatedMinutes = median;

    // Adjust based on day of week
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      estimatedMinutes *= 1.5; // Weekend adjustment
      factors.push('Выходной день (+50% к времени)');
    }

    // Adjust based on time of day
    const hour = new Date().getHours();
    if (hour < 9 || hour >= 18) {
      estimatedMinutes *= 1.3; // Outside business hours
      factors.push('Нерабочее время (+30% к времени)');
    }

    // Determine confidence
    let confidenceLevel: 'low' | 'medium' | 'high';
    if (responseTimes.length >= 20 && stdDev / mean < 0.5) {
      confidenceLevel = 'high';
      factors.push('Стабильные исторические данные');
    } else if (responseTimes.length >= 10) {
      confidenceLevel = 'medium';
    } else {
      confidenceLevel = 'low';
      factors.push('Мало исторических данных');
    }

    if (assigneeId) {
      factors.push('Учтены данные конкретного исполнителя');
    }

    return {
      estimatedMinutes: Math.round(estimatedMinutes),
      confidenceLevel,
      basedOnSamples: responseTimes.length,
      factors: factors.length > 0 ? factors : ['На основе исторических данных'],
    };
  }

  /**
   * Find similar entities based on title/description
   */
  async findSimilarEntities(
    workspaceId: string,
    entityTitle: string,
    entityDescription?: string,
    excludeEntityId?: string,
    limit: number = 5,
  ): Promise<SimilarEntity[]> {
    const inputKeywords = this.extractKeywords(
      `${entityTitle} ${entityDescription || ''}`,
    );

    if (inputKeywords.length === 0) {
      return [];
    }

    // Get recent entities
    const entities = await this.entityRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const similarities: SimilarEntity[] = [];

    for (const entity of entities) {
      if (excludeEntityId && entity.id === excludeEntityId) continue;

      const entityKeywords = this.extractKeywords(entity.title);
      const matchingTerms = inputKeywords.filter((k) =>
        entityKeywords.includes(k),
      );

      if (matchingTerms.length === 0) continue;

      // Calculate Jaccard similarity
      const union = new Set([...inputKeywords, ...entityKeywords]);
      const intersection = matchingTerms.length;
      const similarity = intersection / union.size;

      if (similarity >= 0.1) {
        // Minimum threshold
        similarities.push({
          entityId: entity.id,
          customId: entity.customId,
          title: entity.title,
          status: entity.status,
          similarity: Math.round(similarity * 100) / 100,
          matchingTerms,
        });
      }
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Common Russian and English stop words
    const stopWords = new Set([
      'и',
      'в',
      'на',
      'с',
      'по',
      'для',
      'не',
      'что',
      'это',
      'как',
      'от',
      'а',
      'к',
      'о',
      'из',
      'у',
      'за',
      'но',
      'так',
      'все',
      'при',
      'да',
      'же',
      'до',
      'то',
      'ли',
      'бы',
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'and',
      'or',
      'but',
      'if',
      'then',
      'else',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'every',
      'both',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'nor',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'up',
      'about',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'under',
      'again',
      'further',
      'then',
      'once',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\wа-яё\s]/gi, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 3 && !stopWords.has(word));
  }
}
