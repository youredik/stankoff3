import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AiController } from './ai.controller';
import { OpenAiProvider } from './providers/openai.provider';
import { YandexCloudProvider } from './providers/yandex-cloud.provider';
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
import { AiFeedback } from './entities/ai-feedback.entity';
import { AiFeedbackService } from './services/ai-feedback.service';
import { ChatAgentService } from './services/chat-agent.service';
import { WorkspaceEntity } from '../entity/entity.entity';
import { Comment } from '../entity/comment.entity';
import { User } from '../user/user.entity';
import { LegacyModule } from '../legacy/legacy.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([KnowledgeChunk, AiUsageLog, AiClassification, AiNotification, AiFeedback, WorkspaceEntity, Comment, User]),
    forwardRef(() => LegacyModule),
    forwardRef(() => ChatModule),
  ],
  controllers: [AiController],
  providers: [
    // Провайдеры (в порядке приоритета)
    YandexCloudProvider,
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
    AiFeedbackService,
    ChatAgentService,
  ],
  exports: [
    // Реестр - основной способ доступа к AI
    AiProviderRegistry,
    // Отдельные провайдеры для специфических случаев
    YandexCloudProvider,
    OpenAiProvider,
    // Сервисы
    ClassifierService,
    KnowledgeBaseService,
    RagIndexerService,
    AiAssistantService,
    AiUsageService,
    AiNotificationService,
    KnowledgeGraphService,
    AiFeedbackService,
    ChatAgentService,
  ],
})
export class AiModule {}
