import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Materialized Views for fast analytics.
 *
 * Creates mv_workspace_stats for aggregated workspace statistics.
 * Should be refreshed periodically via cron (every 5 minutes).
 */
export class AddMaterializedViews1770126900000 implements MigrationInterface {
  name = 'AddMaterializedViews1770126900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // Materialized View: Статистика по workspace
    // ============================================

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW mv_workspace_stats AS
      SELECT
        "workspaceId",
        status,
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE "assigneeId" IS NULL) as unassigned_count,
        COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL) as resolved_count,
        AVG("commentCount") as avg_comments,
        AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))) as avg_resolution_seconds,
        AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt"))) as avg_first_response_seconds,
        MIN("createdAt") as oldest_created_at,
        MAX("createdAt") as newest_created_at,
        MAX("lastActivityAt") as last_activity_at
      FROM entities
      GROUP BY "workspaceId", status
    `);

    // Уникальный индекс для CONCURRENTLY refresh
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_mv_workspace_stats_pk"
      ON mv_workspace_stats ("workspaceId", status)
    `);

    // ============================================
    // Materialized View: Статистика по исполнителям
    // ============================================

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW mv_assignee_stats AS
      SELECT
        "workspaceId",
        "assigneeId",
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE status NOT IN ('done', 'closed', 'resolved')) as open_count,
        COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL) as resolved_count,
        AVG("commentCount") as avg_comments,
        AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))) as avg_resolution_seconds
      FROM entities
      WHERE "assigneeId" IS NOT NULL
      GROUP BY "workspaceId", "assigneeId"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_mv_assignee_stats_pk"
      ON mv_assignee_stats ("workspaceId", "assigneeId")
    `);

    // ============================================
    // Materialized View: Активность по дням
    // ============================================

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW mv_daily_activity AS
      SELECT
        "workspaceId",
        DATE_TRUNC('day', "createdAt") as activity_date,
        COUNT(*) as entities_created,
        SUM("commentCount") as comments_total,
        COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL
          AND DATE_TRUNC('day', "resolvedAt") = DATE_TRUNC('day', "createdAt")) as same_day_resolved
      FROM entities
      GROUP BY "workspaceId", DATE_TRUNC('day', "createdAt")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_mv_daily_activity_pk"
      ON mv_daily_activity ("workspaceId", activity_date)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS mv_daily_activity`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS mv_assignee_stats`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS mv_workspace_stats`);
  }
}
