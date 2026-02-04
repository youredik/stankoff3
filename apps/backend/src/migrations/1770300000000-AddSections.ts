import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSections1770300000000 implements MigrationInterface {
  name = 'AddSections1770300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create sections table
    await queryRunner.query(`
      CREATE TABLE "sections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "icon" varchar(10) NOT NULL DEFAULT '📁',
        "order" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sections" PRIMARY KEY ("id")
      )
    `);

    // Create section_role enum
    await queryRunner.query(`
      CREATE TYPE "section_role_enum" AS ENUM ('viewer', 'admin')
    `);

    // Create section_members table
    await queryRunner.query(`
      CREATE TABLE "section_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "sectionId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "role" "section_role_enum" NOT NULL DEFAULT 'viewer',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_section_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_section_members_section_user" UNIQUE ("sectionId", "userId"),
        CONSTRAINT "FK_section_members_section" FOREIGN KEY ("sectionId")
          REFERENCES "sections"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_section_members_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Add section fields to workspaces table
    await queryRunner.query(`
      ALTER TABLE "workspaces"
      ADD COLUMN "sectionId" uuid,
      ADD COLUMN "showInMenu" boolean NOT NULL DEFAULT true,
      ADD COLUMN "orderInSection" integer NOT NULL DEFAULT 0
    `);

    // Add foreign key constraint for workspaces.sectionId
    await queryRunner.query(`
      ALTER TABLE "workspaces"
      ADD CONSTRAINT "FK_workspaces_section" FOREIGN KEY ("sectionId")
        REFERENCES "sections"("id") ON DELETE SET NULL
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "idx_sections_order" ON "sections" ("order")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_section_members_section" ON "section_members" ("sectionId")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_section_members_user" ON "section_members" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_workspaces_section" ON "workspaces" ("sectionId")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_workspaces_show_in_menu" ON "workspaces" ("showInMenu")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_workspaces_show_in_menu"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_workspaces_section"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_section_members_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_section_members_section"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sections_order"`);

    // Drop foreign key from workspaces
    await queryRunner.query(`
      ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "FK_workspaces_section"
    `);

    // Remove columns from workspaces
    await queryRunner.query(`
      ALTER TABLE "workspaces"
      DROP COLUMN IF EXISTS "orderInSection",
      DROP COLUMN IF EXISTS "showInMenu",
      DROP COLUMN IF EXISTS "sectionId"
    `);

    // Drop section_members table
    await queryRunner.query(`DROP TABLE IF EXISTS "section_members"`);

    // Drop section_role enum
    await queryRunner.query(`DROP TYPE IF EXISTS "section_role_enum"`);

    // Drop sections table
    await queryRunner.query(`DROP TABLE IF EXISTS "sections"`);
  }
}
