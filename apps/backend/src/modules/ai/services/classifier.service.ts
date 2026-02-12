import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { AiClassification } from '../entities/ai-classification.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  CLASSIFICATION_USER_PROMPT,
} from '../prompts/classification.prompt';
import { ClassifyRequestDto, ClassifyResponseDto } from '../dto/ai.dto';
import { extractJson } from '../utils/extract-json';
import { ClassificationSchema, ClassificationOutput } from '../utils/ai-schemas';

type ClassificationResult = ClassificationOutput;

@Injectable()
export class ClassifierService {
  private readonly logger = new Logger(ClassifierService.name);

  constructor(
    private readonly providerRegistry: AiProviderRegistry,
    @InjectRepository(AiClassification)
    private readonly classificationRepo: Repository<AiClassification>,
    @InjectRepository(AiUsageLog)
    private readonly usageLogRepo: Repository<AiUsageLog>,
  ) {}

  /**
   * Проверяет доступность AI сервиса
   */
  isAvailable(): boolean {
    return this.providerRegistry.isCompletionAvailable();
  }

  /**
   * Классифицирует заявку по title и description
   */
  async classify(
    dto: ClassifyRequestDto,
    userId?: string,
  ): Promise<ClassifyResponseDto & { provider: string; model: string }> {
    if (!this.isAvailable()) {
      throw new Error('AI сервис не настроен');
    }

    const startTime = Date.now();

    try {
      const userPrompt = CLASSIFICATION_USER_PROMPT.replace('{title}', dto.title)
        .replace('{description}', dto.description)
        .replace('{equipment}', dto.equipment ? `Оборудование: ${dto.equipment}` : '');

      const result = await this.providerRegistry.complete({
        messages: [
          { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 500,
        jsonMode: true,
      });

      const latencyMs = Date.now() - startTime;

      // Логируем использование
      await this.logUsage({
        provider: result.provider,
        model: result.model,
        operation: 'classify',
        userId,
        workspaceId: dto.workspaceId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs,
        success: true,
      });

      // Парсим JSON ответ
      const parsed = this.parseClassificationResponse(result.content);

      return {
        category: parsed.category,
        priority: parsed.priority,
        skills: parsed.skills,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        provider: result.provider,
        model: result.model,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.logger.error(`Ошибка классификации: ${error}`);

      // Логируем ошибку
      await this.logUsage({
        provider: 'unknown',
        model: 'unknown',
        operation: 'classify',
        userId,
        workspaceId: dto.workspaceId,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error,
      });

      throw e;
    }
  }

  /**
   * Классифицирует entity и сохраняет результат
   * Если свежая классификация уже есть (< 30 мин) — возвращает её без LLM-вызова
   */
  async classifyAndSave(
    entityId: string,
    dto: ClassifyRequestDto,
    userId?: string,
  ): Promise<AiClassification> {
    // Проверяем, есть ли свежая классификация
    const existing = await this.classificationRepo.findOne({
      where: { entityId },
    });

    if (existing) {
      const ageMs = Date.now() - new Date(existing.createdAt).getTime();
      const REUSE_TTL_MS = 30 * 60 * 1000; // 30 минут

      if (ageMs < REUSE_TTL_MS) {
        this.logger.debug(
          `Используем существующую классификацию для ${entityId} (возраст: ${Math.round(ageMs / 1000)}с)`,
        );
        return existing;
      }
    }

    const result = await this.classify(dto, userId);

    // Upsert классификации
    let classification = existing;

    if (classification) {
      classification.category = result.category as AiClassification['category'];
      classification.priority = result.priority as AiClassification['priority'];
      classification.skills = result.skills;
      classification.confidence = result.confidence;
      classification.reasoning = result.reasoning;
      classification.provider = result.provider as AiClassification['provider'];
      classification.model = result.model;
    } else {
      classification = this.classificationRepo.create({
        entityId,
        category: result.category as AiClassification['category'],
        priority: result.priority as AiClassification['priority'],
        skills: result.skills,
        confidence: result.confidence,
        reasoning: result.reasoning,
        provider: result.provider as AiClassification['provider'],
        model: result.model,
      });
    }

    return this.classificationRepo.save(classification);
  }

  /**
   * Получает сохранённую классификацию для entity
   */
  async getClassification(entityId: string): Promise<AiClassification | null> {
    return this.classificationRepo.findOne({
      where: { entityId },
    });
  }

  /**
   * Применяет классификацию к entity (отмечает как applied)
   */
  async applyClassification(
    entityId: string,
    userId: string,
  ): Promise<AiClassification | null> {
    const classification = await this.classificationRepo.findOne({
      where: { entityId },
    });

    if (!classification) {
      return null;
    }

    classification.applied = true;
    classification.appliedAt = new Date();
    classification.appliedById = userId;

    return this.classificationRepo.save(classification);
  }

  /**
   * Парсит JSON ответ от LLM через zod-схему с fallback defaults
   */
  private parseClassificationResponse(content: string): ClassificationResult {
    try {
      const parsed = JSON.parse(extractJson(content));
      return ClassificationSchema.parse(parsed);
    } catch {
      this.logger.warn(`Не удалось распарсить JSON классификации: ${content}`);
      // .catch() defaults из zod-схемы
      const safe = ClassificationSchema.safeParse({});
      if (safe.success) return safe.data;
      return {
        category: 'other',
        priority: 'medium',
        skills: [],
        confidence: 0.5,
        reasoning: '',
      };
    }
  }

  /**
   * Логирует использование AI
   */
  private async logUsage(data: {
    provider: string;
    model: string;
    operation: string;
    userId?: string;
    workspaceId?: string;
    entityId?: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    success: boolean;
    error?: string;
  }): Promise<void> {
    try {
      const log = this.usageLogRepo.create({
        provider: data.provider as AiUsageLog['provider'],
        model: data.model,
        operation: data.operation as AiUsageLog['operation'],
        userId: data.userId,
        workspaceId: data.workspaceId,
        entityId: data.entityId,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        latencyMs: data.latencyMs,
        success: data.success,
        error: data.error,
      });

      await this.usageLogRepo.save(log);
    } catch (e) {
      this.logger.error(`Ошибка записи лога: ${e}`);
    }
  }
}
