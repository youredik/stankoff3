import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AiController } from './ai.controller';
import { OpenAiProvider } from './providers/openai.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { GroqProvider } from './providers/groq.provider';
import { AiProviderRegistry } from './providers/ai-provider.registry';
import { ClassifierService } from './services/classifier.service';
import { KnowledgeBaseService } from './services/knowledge-base.service';
import { RagIndexerService } from './services/rag-indexer.service';
import { AiAssistantService } from './services/ai-assistant.service';
import { AiUsageService } from './services/ai-usage.service';
import { AiNotificationService } from './services/ai-notification.service';
import { KnowledgeGraphService } from './services/knowledge-graph.service';
import { KnowledgeChunk } from './entities/knowledge-chunk.entity';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { AiClassification } from './entities/ai-classification.entity';
import { AiNotification } from './entities/ai-notification.entity';
import { WorkspaceEntity } from '../entity/entity.entity';
import { Comment } from '../entity/comment.entity';
import { LegacyModule } from '../legacy/legacy.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([KnowledgeChunk, AiUsageLog, AiClassification, AiNotification, WorkspaceEntity, Comment]),
    forwardRef(() => LegacyModule),
  ],
  controllers: [AiController],
  providers: [
    // Провайдеры (в порядке приоритета)
    OllamaProvider,
    GroqProvider,
    OpenAiProvider,
    // Реестр провайдеров
    AiProviderRegistry,
    // Сервисы
    ClassifierService,
    KnowledgeBaseService,
    RagIndexerService,
    AiAssistantService,
    AiUsageService,
    AiNotificationService,
    KnowledgeGraphService,
  ],
  exports: [
    // Реестр - основной способ доступа к AI
    AiProviderRegistry,
    // Отдельные провайдеры для специфических случаев
    OllamaProvider,
    GroqProvider,
    OpenAiProvider,
    // Сервисы
    ClassifierService,
    KnowledgeBaseService,
    RagIndexerService,
    AiAssistantService,
    AiUsageService,
    AiNotificationService,
    KnowledgeGraphService,
  ],
})
export class AiModule {}
