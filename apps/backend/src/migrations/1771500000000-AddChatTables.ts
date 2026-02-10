import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatTables1771500000000 implements MigrationInterface {
  name = 'AddChatTables1771500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Conversations table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversations" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" VARCHAR(20) NOT NULL,
        "name" VARCHAR(255),
        "entityId" UUID,
        "workspaceId" UUID,
        "createdById" UUID NOT NULL,
        "lastMessageAt" TIMESTAMPTZ,
        "lastMessagePreview" TEXT,
        "lastMessageAuthorId" UUID,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_conversations_entity" FOREIGN KEY ("entityId") REFERENCES "workspace_entities"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_conversations_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_conversations_created_by" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_conversations_last_author" FOREIGN KEY ("lastMessageAuthorId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_conversations_created_by" ON "conversations"("createdById")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_conversations_last_message" ON "conversations"("lastMessageAt" DESC NULLS LAST)
    `);
    // One chat per entity
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_conversations_entity_unique"
      ON "conversations"("entityId") WHERE "entityId" IS NOT NULL
    `);

    // 2. Conversation participants table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversation_participants" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId" UUID NOT NULL,
        "userId" UUID NOT NULL,
        "role" VARCHAR(20) NOT NULL DEFAULT 'member',
        "lastReadAt" TIMESTAMPTZ,
        "lastReadMessageId" UUID,
        "mutedUntil" TIMESTAMPTZ,
        "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "leftAt" TIMESTAMPTZ,
        CONSTRAINT "fk_conv_participants_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_conv_participants_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_conversation_participant" UNIQUE ("conversationId", "userId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_conv_participants_user" ON "conversation_participants"("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_conv_participants_conversation" ON "conversation_participants"("conversationId")
    `);
    // Active participants (not left)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_conv_participants_active"
      ON "conversation_participants"("userId", "conversationId")
      WHERE "leftAt" IS NULL
    `);

    // 3. Messages table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId" UUID NOT NULL,
        "authorId" UUID NOT NULL,
        "content" TEXT,
        "type" VARCHAR(20) NOT NULL DEFAULT 'text',
        "replyToId" UUID,
        "attachments" JSONB NOT NULL DEFAULT '[]',
        "voiceKey" VARCHAR(500),
        "voiceDuration" INT,
        "voiceWaveform" JSONB,
        "mentionedUserIds" JSONB NOT NULL DEFAULT '[]',
        "isEdited" BOOLEAN NOT NULL DEFAULT false,
        "isDeleted" BOOLEAN NOT NULL DEFAULT false,
        "searchVector" tsvector,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_messages_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_messages_author" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_messages_reply_to" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_messages_conversation_created"
      ON "messages"("conversationId", "createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_messages_author" ON "messages"("authorId")
    `);
    // Full-text search index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_messages_search_vector"
      ON "messages" USING GIN ("searchVector")
    `);
    // Non-deleted messages only
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_messages_not_deleted"
      ON "messages"("conversationId", "createdAt" DESC)
      WHERE "isDeleted" = false
    `);

    // 4. Full-text search trigger for messages
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $$
      BEGIN
        NEW."searchVector" := to_tsvector('russian', COALESCE(NEW.content, ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS messages_search_vector_trigger ON "messages"
    `);
    await queryRunner.query(`
      CREATE TRIGGER messages_search_vector_trigger
      BEFORE INSERT OR UPDATE OF content ON "messages"
      FOR EACH ROW EXECUTE FUNCTION messages_search_vector_update()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS messages_search_vector_trigger ON "messages"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS messages_search_vector_update()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations"`);
  }
}
