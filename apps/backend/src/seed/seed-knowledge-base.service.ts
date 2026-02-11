import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../modules/user/user.entity';
import { Workspace } from '../modules/workspace/workspace.entity';
import { KnowledgeArticle } from '../modules/knowledge-base/entities/knowledge-article.entity';
import { SeedWorkspaces } from './seed-structure.service';
import { KNOWLEDGE_BASE_ARTICLES } from './data/knowledge-base-articles';

@Injectable()
export class SeedKnowledgeBaseService {
  private readonly logger = new Logger(SeedKnowledgeBaseService.name);

  constructor(
    @InjectRepository(KnowledgeArticle)
    private readonly articleRepo: Repository<KnowledgeArticle>,
  ) {}

  /**
   * Создать FAQ статьи базы знаний для всех отделов.
   */
  async createAll(ws: SeedWorkspaces, itWs: Workspace, users: User[]): Promise<void> {
    const userByEmail = new Map<string, User>();
    for (const u of users) {
      userByEmail.set(u.email, u);
    }

    // Маппинг workspaceKey → Workspace
    const workspaceByKey = new Map<string, Workspace>();
    for (const [key, workspace] of Object.entries(ws)) {
      workspaceByKey.set(key, workspace as Workspace);
    }
    workspaceByKey.set('it', itWs);

    const articles: Array<Partial<KnowledgeArticle>> = KNOWLEDGE_BASE_ARTICLES.map((article) => {
      const workspace = article.workspaceKey ? workspaceByKey.get(article.workspaceKey) : null;
      const author = userByEmail.get(article.authorEmail);

      return {
        title: article.title,
        content: article.content,
        type: 'faq' as const,
        category: article.category,
        tags: article.tags,
        status: 'published' as const,
        workspaceId: workspace?.id ?? null,
        authorId: author?.id ?? null,
      };
    });

    await this.articleRepo.save(articles);

    this.logger.log(`Создано ${articles.length} статей базы знаний`);
  }
}
