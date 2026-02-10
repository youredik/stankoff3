import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add message_reactions and pinned_messages tables for chat.
 */
export class AddMessageReactionsAndPins1771600000000 implements MigrationInterface {
  name = 'AddMessageReactionsAndPins1771600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Message reactions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "message_reactions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "messageId" UUID NOT NULL,
        "userId" UUID NOT NULL,
        "emoji" VARCHAR(32) NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_message_reactions_message" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_message_reactions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_message_reaction" UNIQUE ("messageId", "userId", "emoji")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_message_reactions_message" ON "message_reactions"("messageId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_message_reactions_user" ON "message_reactions"("userId")
    `);

    // 2. Pinned messages table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pinned_messages" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId" UUID NOT NULL,
        "messageId" UUID NOT NULL,
        "pinnedById" UUID NOT NULL,
        "pinnedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_pinned_messages_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pinned_messages_message" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pinned_messages_pinned_by" FOREIGN KEY ("pinnedById") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_pinned_message" UNIQUE ("conversationId", "messageId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pinned_messages_conversation" ON "pinned_messages"("conversationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pinned_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "message_reactions"`);
  }
}
