import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvitationsTable1772100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Создаём enum type
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "invitation_status_enum" AS ENUM ('pending', 'accepted', 'expired', 'revoked');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. Создаём таблицу
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invitations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL,
        "token_hash" varchar(64) NOT NULL,
        "status" "invitation_status_enum" NOT NULL DEFAULT 'pending',
        "first_name" varchar(255),
        "last_name" varchar(255),
        "department" varchar(255),
        "global_role_slug" varchar(100) NOT NULL DEFAULT 'employee',
        "memberships" jsonb NOT NULL DEFAULT '[]',
        "invited_by_id" uuid NOT NULL,
        "accepted_by_id" uuid,
        "expires_at" timestamptz NOT NULL,
        "accepted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invitations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invitations_invited_by" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_invitations_accepted_by" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id")
      )
    `);

    // 3. Индексы
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_invitations_token_hash" ON "invitations" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invitations_email" ON "invitations" ("email")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invitations_status" ON "invitations" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invitations_invited_by" ON "invitations" ("invited_by_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invitations_expires_at" ON "invitations" ("expires_at") WHERE "status" = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invitations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "invitation_status_enum"`);
  }
}
