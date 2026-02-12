import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
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

    // Загрузить документ BUSINESS_PROCESSES.md как серию FAQ-статей
    await this.seedBusinessProcessesDoc(users);
  }

  /**
   * Разбивает docs/BUSINESS_PROCESSES.md на секции и загружает каждую как FAQ-статью.
   */
  private async seedBusinessProcessesDoc(users: User[]): Promise<void> {
    const docPath = join(__dirname, '..', '..', '..', '..', 'docs', 'BUSINESS_PROCESSES.md');
    let fullText: string;
    try {
      fullText = readFileSync(docPath, 'utf-8');
    } catch {
      this.logger.warn('docs/BUSINESS_PROCESSES.md не найден, пропуск');
      return;
    }

    const admin = users.find((u) => u.email === 'youredik@gmail.com');
    const authorId = admin?.id ?? null;

    // Разбить по ## секциям верхнего уровня
    const parts = fullText.split(/\n(?=## \d+\.)/);

    const bpArticles: Array<Partial<KnowledgeArticle>> = [];

    // Вступление (оглавление + обзор)
    bpArticles.push({
      title: 'Бизнес-процессы: Обзор системы Stankoff Portal',
      content: parts[0],
      type: 'faq',
      category: 'Бизнес-процессы',
      tags: ['обзор', 'архитектура', 'оглавление'],
      status: 'published',
      workspaceId: null,
      authorId,
    });

    for (const part of parts.slice(1)) {
      const match = part.match(/^## \d+\.\s*(.+)/);
      if (!match) continue;
      const rawTitle = match[1].trim();

      const tags = ['бизнес-процессы'];
      if (/организац/i.test(rawTitle)) tags.push('организация', 'секции', 'workspace');
      else if (/архитектур/i.test(rawTitle)) tags.push('BPMN', 'архитектура', 'Zeebe');
      else if (/каталог/i.test(rawTitle)) tags.push('BPMN', 'каталог', 'workflow');
      else if (/матриц/i.test(rawTitle)) tags.push('workspace', 'процессы');
      else if (/worker/i.test(rawTitle)) tags.push('workers', 'автоматизация');
      else if (/ai/i.test(rawTitle)) tags.push('AI', 'классификация', 'RAG');
      else if (/sla/i.test(rawTitle)) tags.push('SLA', 'эскалация');
      else if (/dmn/i.test(rawTitle)) tags.push('DMN', 'решения', 'правила');
      else if (/rbac|доступ/i.test(rawTitle)) tags.push('RBAC', 'роли', 'доступ');
      else if (/жизнен/i.test(rawTitle)) tags.push('entity', 'статусы');
      else if (/перемен/i.test(rawTitle)) tags.push('BPMN', 'переменные');
      else if (/глоссар/i.test(rawTitle)) tags.push('глоссарий', 'термины');

      bpArticles.push({
        title: `Бизнес-процессы: ${rawTitle}`,
        content: part.trim(),
        type: 'faq',
        category: 'Бизнес-процессы',
        tags,
        status: 'published',
        workspaceId: null,
        authorId,
      });
    }

    if (bpArticles.length > 0) {
      await this.articleRepo.save(bpArticles);
      this.logger.log(`Создано ${bpArticles.length} статей из BUSINESS_PROCESSES.md`);
    }
  }
}
