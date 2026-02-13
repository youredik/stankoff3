import { MigrationInterface, QueryRunner } from "typeorm";

export class AddConversationIcon1770949463980 implements MigrationInterface {
    name = 'AddConversationIcon1770949463980'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop old constraints (IF EXISTS for idempotency)
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "workspace_members" DROP CONSTRAINT IF EXISTS "workspace_members_role_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "section_members" DROP CONSTRAINT IF EXISTS "section_members_role_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "FK_invitations_accepted_by"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "FK_invitations_invited_by"`);
        await queryRunner.query(`ALTER TABLE "knowledge_articles" DROP CONSTRAINT IF EXISTS "fk_kb_articles_author"`);
        await queryRunner.query(`ALTER TABLE "knowledge_articles" DROP CONSTRAINT IF EXISTS "fk_kb_articles_workspace"`);
        await queryRunner.query(`ALTER TABLE "system_sync_log" DROP CONSTRAINT IF EXISTS "FK_system_sync_entity"`);
        await queryRunner.query(`ALTER TABLE "ai_feedback" DROP CONSTRAINT IF EXISTS "FK_ai_feedback_user"`);

        // Drop old indexes (IF EXISTS for idempotency)
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_roles_scope"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_roles_slug"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_users_role_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_workspace_members_role_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_section_members_role_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_workspaces_system_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_messages_search_vector"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_invitations_token_hash"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_invitations_email"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_invitations_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_invitations_invited_by"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_invitations_expires_at"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_kb_articles_workspace"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_kb_articles_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_kb_articles_category"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_kb_articles_author"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_kb_articles_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_kb_articles_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_kb_articles_tags"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_knowledge_chunks_embedding"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_knowledge_chunks_search_vector"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_ai_feedback_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_ai_feedback_entity_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_ai_feedback_user_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_ai_feedback_created_at"`);

        // Drop old check constraint
        await queryRunner.query(`ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "CHK_roles_scope"`);

        // Create ai_notifications table (IF NOT EXISTS — may already exist from AddAiNotifications migration)
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "ai_notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying(50) NOT NULL, "title" character varying(500) NOT NULL, "message" text NOT NULL, "workspace_id" uuid, "entity_id" uuid, "metadata" jsonb NOT NULL DEFAULT '{}', "confidence" numeric(3,2) NOT NULL DEFAULT '0', "target_user_id" uuid, "read" boolean NOT NULL DEFAULT false, "dismissed" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_68a963cbe197551f3a0f92221e5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_11ea2f985a75f570696423752e" ON "ai_notifications" ("type")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_1039c9f0c6632fe349a3099145" ON "ai_notifications" ("workspace_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_2f31eea685620fc836dff286df" ON "ai_notifications" ("target_user_id")`);

        // Drop knowledge_chunks.search_vector (idempotent)
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "knowledge_chunks" DROP COLUMN "search_vector"; EXCEPTION WHEN undefined_column THEN NULL; END $$`);

        // Add conversations.icon (idempotent)
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "conversations" ADD COLUMN "icon" character varying(10); EXCEPTION WHEN duplicate_column THEN NULL; END $$`);

        // Change roles.created_at from TIMESTAMPTZ to TIMESTAMP (idempotent)
        await queryRunner.query(`DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'roles' AND column_name = 'created_at' AND data_type = 'timestamp with time zone'
          ) THEN
            ALTER TABLE "roles" DROP COLUMN "created_at";
            ALTER TABLE "roles" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now();
          END IF;
        END $$`);

        // Change roles.updated_at from TIMESTAMPTZ to TIMESTAMP (idempotent)
        await queryRunner.query(`DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'roles' AND column_name = 'updated_at' AND data_type = 'timestamp with time zone'
          ) THEN
            ALTER TABLE "roles" DROP COLUMN "updated_at";
            ALTER TABLE "roles" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now();
          END IF;
        END $$`);

        // Drop systemType default (safe to re-run)
        await queryRunner.query(`ALTER TABLE "workspaces" ALTER COLUMN "systemType" DROP DEFAULT`);

        // Add unique constraint on invitations.token_hash (idempotent)
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "invitations" ADD CONSTRAINT "UQ_872ac94a64b3d44fc4b554780cd" UNIQUE ("token_hash"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

        // Rename invitation_status_enum to invitations_status_enum (idempotent)
        await queryRunner.query(`DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status_enum')
            AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status_enum_old') THEN
            ALTER TYPE "public"."invitation_status_enum" RENAME TO "invitation_status_enum_old";
          END IF;
        END $$`);
        await queryRunner.query(`DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitations_status_enum') THEN
            CREATE TYPE "public"."invitations_status_enum" AS ENUM('pending', 'accepted', 'expired', 'revoked');
          END IF;
        END $$`);
        await queryRunner.query(`DO $$
        BEGIN
          ALTER TABLE "invitations" ALTER COLUMN "status" DROP DEFAULT;
          ALTER TABLE "invitations" ALTER COLUMN "status" TYPE "public"."invitations_status_enum" USING "status"::"text"::"public"."invitations_status_enum";
          ALTER TABLE "invitations" ALTER COLUMN "status" SET DEFAULT 'pending';
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."invitation_status_enum_old"`);

        // Change invitations.created_at from TIMESTAMPTZ to TIMESTAMP (idempotent)
        await queryRunner.query(`DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'invitations' AND column_name = 'created_at' AND data_type = 'timestamp with time zone'
          ) THEN
            ALTER TABLE "invitations" DROP COLUMN "created_at";
            ALTER TABLE "invitations" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now();
          END IF;
        END $$`);

        // Change invitations.updated_at from TIMESTAMPTZ to TIMESTAMP (idempotent)
        await queryRunner.query(`DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'invitations' AND column_name = 'updated_at' AND data_type = 'timestamp with time zone'
          ) THEN
            ALTER TABLE "invitations" DROP COLUMN "updated_at";
            ALTER TABLE "invitations" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now();
          END IF;
        END $$`);

        // Set knowledge_articles.tags NOT NULL (safe to re-run)
        await queryRunner.query(`ALTER TABLE "knowledge_articles" ALTER COLUMN "tags" SET NOT NULL`);

        // Create new indexes (IF NOT EXISTS)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_881f72bac969d9a00a1a29e107" ON "roles" ("slug")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_c39d7a156a2d1e73c8be1945e9" ON "roles" ("scope")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_97ab59cb592c7cec109741b592" ON "invitations" ("email")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_56ce8d405de7cdcedd31d900ba" ON "invitations" ("status")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_314613421ca25bbe84f3e38da2" ON "knowledge_articles" ("type")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bf244ce33f9c6aaa4ca8c8ee2c" ON "knowledge_articles" ("workspace_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_d33f82f5eb5f3cdf709ce6aeb4" ON "knowledge_articles" ("category")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_0c68413909674172fed0f01eb6" ON "knowledge_articles" ("status")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_4099548d209f5ebbad2164ac56" ON "knowledge_articles" ("author_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_6abb5ee083fe38d89e4238c96d" ON "ai_feedback" ("type")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_92a8c13d7a61a556d91355fb09" ON "ai_feedback" ("entity_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_92a7f08baacc8317fcebb7d8ec" ON "ai_feedback" ("user_id")`);

        // Add new foreign keys (idempotent)
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "workspace_members" ADD CONSTRAINT "FK_cd3916b233236ce65c819f8c3f0" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "section_members" ADD CONSTRAINT "FK_6429444328658449e03f6263bbf" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "invitations" ADD CONSTRAINT "FK_d4de0403dd012cf87b430af70ef" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "invitations" ADD CONSTRAINT "FK_669fdec7c1734fcfb4043042899" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "knowledge_articles" ADD CONSTRAINT "FK_bf244ce33f9c6aaa4ca8c8ee2c7" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "knowledge_articles" ADD CONSTRAINT "FK_4099548d209f5ebbad2164ac562" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "ai_notifications" ADD CONSTRAINT "FK_2f31eea685620fc836dff286df4" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "ai_feedback" ADD CONSTRAINT "FK_92a7f08baacc8317fcebb7d8ec8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_feedback" DROP CONSTRAINT IF EXISTS "FK_92a7f08baacc8317fcebb7d8ec8"`);
        await queryRunner.query(`ALTER TABLE "ai_notifications" DROP CONSTRAINT IF EXISTS "FK_2f31eea685620fc836dff286df4"`);
        await queryRunner.query(`ALTER TABLE "knowledge_articles" DROP CONSTRAINT IF EXISTS "FK_4099548d209f5ebbad2164ac562"`);
        await queryRunner.query(`ALTER TABLE "knowledge_articles" DROP CONSTRAINT IF EXISTS "FK_bf244ce33f9c6aaa4ca8c8ee2c7"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "FK_669fdec7c1734fcfb4043042899"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "FK_d4de0403dd012cf87b430af70ef"`);
        await queryRunner.query(`ALTER TABLE "section_members" DROP CONSTRAINT IF EXISTS "FK_6429444328658449e03f6263bbf"`);
        await queryRunner.query(`ALTER TABLE "workspace_members" DROP CONSTRAINT IF EXISTS "FK_cd3916b233236ce65c819f8c3f0"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_a2cecd1a3531c0b041e29ba46e1"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_92a7f08baacc8317fcebb7d8ec"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_92a8c13d7a61a556d91355fb09"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_6abb5ee083fe38d89e4238c96d"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_4099548d209f5ebbad2164ac56"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_0c68413909674172fed0f01eb6"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_d33f82f5eb5f3cdf709ce6aeb4"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_bf244ce33f9c6aaa4ca8c8ee2c"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_314613421ca25bbe84f3e38da2"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_56ce8d405de7cdcedd31d900ba"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_97ab59cb592c7cec109741b592"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_c39d7a156a2d1e73c8be1945e9"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_881f72bac969d9a00a1a29e107"`);
        await queryRunner.query(`ALTER TABLE "knowledge_articles" ALTER COLUMN "tags" DROP NOT NULL`);
        await queryRunner.query(`DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'invitations' AND column_name = 'updated_at' AND data_type = 'timestamp without time zone'
          ) THEN
            ALTER TABLE "invitations" DROP COLUMN "updated_at";
            ALTER TABLE "invitations" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
          END IF;
        END $$`);
        await queryRunner.query(`DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'invitations' AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
          ) THEN
            ALTER TABLE "invitations" DROP COLUMN "created_at";
            ALTER TABLE "invitations" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
          END IF;
        END $$`);
        await queryRunner.query(`DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitations_status_enum') THEN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status_enum_old') THEN
              CREATE TYPE "public"."invitation_status_enum_old" AS ENUM('pending', 'accepted', 'expired', 'revoked');
            END IF;
            ALTER TABLE "invitations" ALTER COLUMN "status" DROP DEFAULT;
            ALTER TABLE "invitations" ALTER COLUMN "status" TYPE "public"."invitation_status_enum_old" USING "status"::"text"::"public"."invitation_status_enum_old";
            ALTER TABLE "invitations" ALTER COLUMN "status" SET DEFAULT 'pending';
            DROP TYPE "public"."invitations_status_enum";
            ALTER TYPE "public"."invitation_status_enum_old" RENAME TO "invitation_status_enum";
          END IF;
        END $$`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "UQ_872ac94a64b3d44fc4b554780cd"`);
        await queryRunner.query(`ALTER TABLE "workspaces" ALTER COLUMN "systemType" SET DEFAULT NULL`);
        await queryRunner.query(`DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'roles' AND column_name = 'updated_at' AND data_type = 'timestamp without time zone'
          ) THEN
            ALTER TABLE "roles" DROP COLUMN "updated_at";
            ALTER TABLE "roles" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
          END IF;
        END $$`);
        await queryRunner.query(`DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'roles' AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
          ) THEN
            ALTER TABLE "roles" DROP COLUMN "created_at";
            ALTER TABLE "roles" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
          END IF;
        END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "conversations" DROP COLUMN "icon"; EXCEPTION WHEN undefined_column THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "knowledge_chunks" ADD "search_vector" tsvector; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_2f31eea685620fc836dff286df"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_1039c9f0c6632fe349a3099145"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_11ea2f985a75f570696423752e"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_notifications"`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "roles" ADD CONSTRAINT "CHK_roles_scope" CHECK (((scope)::text = ANY ((ARRAY['global'::character varying, 'section'::character varying, 'workspace'::character varying])::text[]))); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_feedback_created_at" ON "ai_feedback" ("created_at")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_feedback_user_id" ON "ai_feedback" ("user_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_feedback_entity_id" ON "ai_feedback" ("entity_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_feedback_type" ON "ai_feedback" ("type")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_search_vector" ON "knowledge_chunks" ("search_vector")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_embedding" ON "knowledge_chunks" ("embedding")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_tags" ON "knowledge_articles" ("tags")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_created" ON "knowledge_articles" ("created_at")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_status" ON "knowledge_articles" ("status")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_author" ON "knowledge_articles" ("author_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_category" ON "knowledge_articles" ("category")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_type" ON "knowledge_articles" ("type")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_workspace" ON "knowledge_articles" ("workspace_id")`);
        await queryRunner.query(`DO $$
        BEGIN
          CREATE INDEX "idx_invitations_expires_at" ON "invitations" ("expires_at") WHERE (status = 'pending'::invitation_status_enum);
        EXCEPTION WHEN duplicate_table THEN NULL;
        END $$`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_invitations_invited_by" ON "invitations" ("invited_by_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_invitations_status" ON "invitations" ("status")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_invitations_email" ON "invitations" ("email")`);
        await queryRunner.query(`DO $$
        BEGIN
          CREATE UNIQUE INDEX "idx_invitations_token_hash" ON "invitations" ("token_hash");
        EXCEPTION WHEN duplicate_table THEN NULL;
        END $$`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_messages_search_vector" ON "messages" ("searchVector")`);
        await queryRunner.query(`DO $$
        BEGIN
          CREATE UNIQUE INDEX "idx_workspaces_system_type" ON "workspaces" ("systemType") WHERE ("systemType" IS NOT NULL);
        EXCEPTION WHEN duplicate_table THEN NULL;
        END $$`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_section_members_role_id" ON "section_members" ("role_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_workspace_members_role_id" ON "workspace_members" ("role_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_users_role_id" ON "users" ("role_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_roles_slug" ON "roles" ("slug")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_roles_scope" ON "roles" ("scope")`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "ai_feedback" ADD CONSTRAINT "FK_ai_feedback_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "system_sync_log" ADD CONSTRAINT "FK_system_sync_entity" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "knowledge_articles" ADD CONSTRAINT "fk_kb_articles_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "knowledge_articles" ADD CONSTRAINT "fk_kb_articles_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "invitations" ADD CONSTRAINT "FK_invitations_invited_by" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "invitations" ADD CONSTRAINT "FK_invitations_accepted_by" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "section_members" ADD CONSTRAINT "section_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
        await queryRunner.query(`DO $$ BEGIN ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    }

}
