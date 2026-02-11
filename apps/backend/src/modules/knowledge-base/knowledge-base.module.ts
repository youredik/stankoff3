import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeArticleService } from './services/knowledge-article.service';
import { DocumentParserService } from './services/document-parser.service';
import { KnowledgeArticle } from './entities/knowledge-article.entity';
import { S3Module } from '../s3/s3.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KnowledgeArticle]),
    S3Module,
    AiModule,
  ],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeArticleService, DocumentParserService],
  exports: [KnowledgeArticleService],
})
export class KnowledgeBaseModule {}
