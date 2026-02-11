import { MigrationInterface, QueryRunner } from 'typeorm';
import { KNOWLEDGE_BASE_ARTICLES } from '../seed/data/knowledge-base-articles';

/**
 * Наполнение Knowledge Base FAQ статьями для всех отделов.
 * Это data-only миграция — схема не меняется.
 * Идемпотентна: пропускает вставку если FAQ статьи уже существуют.
 */
export class SeedKnowledgeBaseArticles1772300000000
  implements MigrationInterface
{
  /** workspaceKey из seed-данных → prefix в таблице workspaces */
  private readonly keyToPrefix: Record<string, string> = {
    zk: 'ZK',
    kp: 'KP',
    sz: 'SZ',
    rek: 'REK',
    mk: 'MK',
    kn: 'KN',
    sk: 'SK',
    dv: 'DV',
    fd: 'FD',
    sr: 'SR',
    dg: 'DG',
    ved: 'VED',
    hr: 'HR',
    tn: 'TN',
    it: 'DEV',
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Идемпотентность: пропускаем если FAQ статьи уже есть
    const [{ count }] = await queryRunner.query(
      `SELECT COUNT(*)::int as count FROM knowledge_articles WHERE type = 'faq'`,
    );
    if (count > 0) return;

    // Маппинг workspace prefix → id
    const workspaceRows: Array<{ id: string; prefix: string }> =
      await queryRunner.query(`SELECT id, prefix FROM workspaces`);
    const prefixToWsId = new Map<string, string>();
    for (const row of workspaceRows) {
      prefixToWsId.set(row.prefix, row.id);
    }

    // Маппинг email → user id
    const userRows: Array<{ id: string; email: string }> =
      await queryRunner.query(`SELECT id, email FROM users`);
    const emailToUserId = new Map<string, string>();
    for (const row of userRows) {
      emailToUserId.set(row.email, row.id);
    }

    // Вставка статей
    for (const article of KNOWLEDGE_BASE_ARTICLES) {
      const wsPrefix = article.workspaceKey
        ? this.keyToPrefix[article.workspaceKey]
        : null;
      const workspaceId = wsPrefix
        ? (prefixToWsId.get(wsPrefix) ?? null)
        : null;
      const authorId = emailToUserId.get(article.authorEmail) ?? null;

      await queryRunner.query(
        `INSERT INTO knowledge_articles
           (title, content, type, category, tags, status, workspace_id, author_id)
         VALUES ($1, $2, 'faq', $3, $4, 'published', $5, $6)`,
        [
          article.title,
          article.content,
          article.category,
          article.tags,
          workspaceId,
          authorId,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM knowledge_articles WHERE type = 'faq'`,
    );
  }
}
