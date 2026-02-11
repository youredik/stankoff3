import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnalyticsIndexes1770126681086 implements MigrationInterface {
    name = 'AddAnalyticsIndexes1770126681086'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // B-tree индексы для entities
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_entities_workspace_status" ON "entities" ("workspaceId", "status")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_entities_workspace_created" ON "entities" ("workspaceId", "createdAt" DESC)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_entities_workspace_assignee" ON "entities" ("workspaceId", "assigneeId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_entities_assignee" ON "entities" ("assigneeId") WHERE "assigneeId" IS NOT NULL`);

        // B-tree индексы для comments
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_comments_entity_created" ON "comments" ("entityId", "createdAt")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_comments_author" ON "comments" ("authorId")`);

        // GIN индексы для JSONB полей (поиск по динамическим данным)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_entities_data_gin" ON "entities" USING GIN (data jsonb_path_ops)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_entities_linked_gin" ON "entities" USING GIN ("linkedEntityIds")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_comments_mentions_gin" ON "comments" USING GIN ("mentionedUserIds")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_audit_details_gin" ON "audit_logs" USING GIN (details jsonb_path_ops)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop GIN индексы
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_audit_details_gin"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_comments_mentions_gin"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_entities_linked_gin"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_entities_data_gin"`);

        // Drop B-tree индексы
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_comments_author"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_comments_entity_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_entities_assignee"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_entities_workspace_assignee"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_entities_workspace_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_entities_workspace_status"`);
    }

}
