import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeArticle } from '../entities/knowledge-article.entity';
import { CreateFaqDto, UpdateArticleDto, ArticleFilterDto } from '../dto/knowledge-base.dto';
import { S3Service } from '../../s3/s3.service';
import { DocumentParserService } from './document-parser.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { UserRole } from '../../user/user.entity';
import type { ChunkSourceType } from '../../ai/entities/knowledge-chunk.entity';

@Injectable()
export class KnowledgeArticleService {
  private readonly logger = new Logger(KnowledgeArticleService.name);

  private readonly CHUNK_SIZE = 512;
  private readonly CHUNK_OVERLAP = 50;
  private readonly CHARS_PER_TOKEN = 4;

  constructor(
    @InjectRepository(KnowledgeArticle)
    private readonly articleRepo: Repository<KnowledgeArticle>,
    private readonly s3Service: S3Service,
    private readonly parserService: DocumentParserService,
    private readonly knowledgeBase: KnowledgeBaseService,
  ) {}

  async findAll(filters: ArticleFilterDto, userId: string, userRole: UserRole) {
    const { type, category, workspaceId, search, page = 1, perPage = 20 } = filters;

    const qb = this.articleRepo
      .createQueryBuilder('article')
      .leftJoinAndSelect('article.author', 'author')
      .leftJoinAndSelect('article.workspace', 'workspace');

    if (type) {
      qb.andWhere('article.type = :type', { type });
    }
    if (category) {
      qb.andWhere('article.category = :category', { category });
    }
    if (workspaceId) {
      qb.andWhere('article.workspace_id = :workspaceId', { workspaceId });
    }
    if (search) {
      qb.andWhere(
        '(article.title ILIKE :search OR :searchExact = ANY(article.tags))',
        { search: `%${search}%`, searchExact: search },
      );
    }

    // Все видят опубликованные + свои черновики
    if (userRole !== UserRole.ADMIN) {
      qb.andWhere(
        '(article.status = :published OR article.author_id = :userId)',
        { published: 'published', userId },
      );
    }

    const total = await qb.getCount();
    const items = await qb
      .orderBy('article.created_at', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getMany();

    return {
      items,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async findOne(id: string, userId: string, userRole: UserRole): Promise<KnowledgeArticle> {
    const article = await this.articleRepo.findOne({
      where: { id },
      relations: ['author', 'workspace'],
    });

    if (!article) {
      throw new NotFoundException('Статья не найдена');
    }

    if (article.status === 'draft' && article.authorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Нет доступа к этой статье');
    }

    return article;
  }

  async createFaq(dto: CreateFaqDto, authorId: string): Promise<KnowledgeArticle> {
    const article = this.articleRepo.create({
      ...dto,
      type: 'faq' as const,
      authorId,
    });

    const saved = await this.articleRepo.save(article);

    // Асинхронно индексируем
    this.indexArticleAsync(saved.id, dto.title, dto.content, 'faq');

    return saved;
  }

  async uploadDocument(
    file: Express.Multer.File,
    metadata: {
      title: string;
      workspaceId?: string;
      category?: string;
      tags?: string[];
    },
    authorId: string,
  ): Promise<KnowledgeArticle> {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }

    // Загружаем в S3
    const { key } = await this.s3Service.uploadFileWithThumbnail(file, 'knowledge-base');

    const article = this.articleRepo.create({
      title: metadata.title,
      type: 'document' as const,
      workspaceId: metadata.workspaceId || null,
      category: metadata.category || null,
      tags: metadata.tags || [],
      fileKey: key,
      fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      fileSize: file.size,
      fileMimeType: file.mimetype,
      authorId,
      status: 'published' as const,
    });

    const saved = await this.articleRepo.save(article);

    // Асинхронно парсим и индексируем
    this.parseAndIndexAsync(saved.id, saved.title, file.buffer, file.mimetype);

    return saved;
  }

  async update(
    id: string,
    dto: UpdateArticleDto,
    userId: string,
    userRole: UserRole,
  ): Promise<KnowledgeArticle> {
    const article = await this.findOne(id, userId, userRole);

    if (article.authorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Нет прав на редактирование этой статьи');
    }

    Object.assign(article, dto);
    const saved = await this.articleRepo.save(article);

    // Переиндексируем FAQ при изменении контента
    if (dto.content && article.type === 'faq') {
      this.indexArticleAsync(saved.id, saved.title, dto.content, 'faq');
    }

    return saved;
  }

  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const article = await this.findOne(id, userId, userRole);

    if (article.authorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Нет прав на удаление этой статьи');
    }

    // Удаляем чанки из базы знаний
    try {
      await this.knowledgeBase.removeChunksBySource(
        article.type as ChunkSourceType,
        article.id,
      );
    } catch (error) {
      this.logger.warn(`Не удалось удалить чанки для статьи ${id}: ${error.message}`);
    }

    await this.articleRepo.remove(article);
  }

  async getCategories(workspaceId?: string): Promise<string[]> {
    const qb = this.articleRepo
      .createQueryBuilder('article')
      .select('DISTINCT article.category', 'category')
      .where('article.category IS NOT NULL')
      .andWhere('article.status = :status', { status: 'published' });

    if (workspaceId) {
      qb.andWhere('article.workspace_id = :workspaceId', { workspaceId });
    }

    const results = await qb.getRawMany();
    return results.map((r) => r.category).filter(Boolean).sort();
  }

  async getStats(workspaceId?: string) {
    const qb = this.articleRepo.createQueryBuilder('article');

    if (workspaceId) {
      qb.where('article.workspace_id = :workspaceId', { workspaceId });
    }

    const [totalDocuments, totalFaq] = await Promise.all([
      qb.clone().andWhere('article.type = :type', { type: 'document' }).getCount(),
      qb.clone().andWhere('article.type = :type', { type: 'faq' }).getCount(),
    ]);

    const kbStats = await this.knowledgeBase.getStats(workspaceId);
    const documentChunks = kbStats.bySourceType?.['document'] || 0;
    const faqChunks = kbStats.bySourceType?.['faq'] || 0;

    return {
      totalDocuments,
      totalFaq,
      totalArticles: totalDocuments + totalFaq,
      documentChunks,
      faqChunks,
      totalChunks: documentChunks + faqChunks,
    };
  }

  // --- Приватные методы ---

  private parseAndIndexAsync(articleId: string, title: string, buffer: Buffer, mimeType: string) {
    setImmediate(async () => {
      try {
        const text = await this.parserService.parseDocument(buffer, mimeType);
        await this.indexArticle(articleId, title, text, 'document');
        this.logger.log(`Документ ${articleId} проиндексирован`);
      } catch (error) {
        this.logger.error(`Ошибка парсинга документа ${articleId}: ${error.message}`);
      }
    });
  }

  private indexArticleAsync(
    articleId: string,
    title: string,
    content: string,
    sourceType: ChunkSourceType,
  ) {
    setImmediate(async () => {
      try {
        await this.indexArticle(articleId, title, content, sourceType);
      } catch (error) {
        this.logger.error(`Ошибка индексации статьи ${articleId}: ${error.message}`);
      }
    });
  }

  private async indexArticle(
    articleId: string,
    title: string,
    content: string,
    sourceType: ChunkSourceType,
  ) {
    if (!this.knowledgeBase.isAvailable()) {
      this.logger.warn(`AI сервис недоступен, пропускаем индексацию статьи ${articleId}`);
      return;
    }

    // Удаляем старые чанки
    await this.knowledgeBase.removeChunksBySource(sourceType, articleId);

    const textToIndex = title ? `${title}\n\n${content}` : content;
    const chunks = this.splitIntoChunks(textToIndex);

    for (let i = 0; i < chunks.length; i++) {
      try {
        await this.knowledgeBase.addChunk({
          content: chunks[i],
          sourceType,
          sourceId: articleId,
          metadata: {
            articleId,
            title,
            chunkIndex: i,
            totalChunks: chunks.length,
          },
        });
      } catch (error) {
        this.logger.warn(
          `Не удалось создать чанк ${i} для статьи ${articleId}: ${error.message}`,
        );
      }
    }

    this.logger.log(`Статья ${articleId} проиндексирована: ${chunks.length} чанков`);
  }

  private splitIntoChunks(text: string): string[] {
    const chunkSizeChars = this.CHUNK_SIZE * this.CHARS_PER_TOKEN;
    const overlapChars = this.CHUNK_OVERLAP * this.CHARS_PER_TOKEN;

    if (text.length <= chunkSizeChars) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSizeChars;

      if (end < text.length) {
        const searchStart = Math.max(end - 200, start);
        const searchText = text.slice(searchStart, end);

        const lastSentenceEnd = Math.max(
          searchText.lastIndexOf('. '),
          searchText.lastIndexOf('! '),
          searchText.lastIndexOf('? '),
          searchText.lastIndexOf('.\n'),
          searchText.lastIndexOf('!\n'),
          searchText.lastIndexOf('?\n'),
        );

        if (lastSentenceEnd > 0) {
          end = searchStart + lastSentenceEnd + 1;
        }
      }

      chunks.push(text.slice(start, end).trim());

      const nextStart = end - overlapChars;
      start = nextStart <= start ? end : nextStart;
    }

    return chunks.filter((chunk) => chunk.length > 50);
  }
}
