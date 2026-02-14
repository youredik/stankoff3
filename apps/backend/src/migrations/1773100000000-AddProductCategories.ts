import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductCategories1773100000000 implements MigrationInterface {
  name = 'AddProductCategories1773100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "slug" varchar(255),
        "parentId" uuid,
        "legacyId" int,
        "sortOrder" int NOT NULL DEFAULT 0,
        "productCount" int NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "workspaceId" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_categories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_categories_parent" FOREIGN KEY ("parentId") REFERENCES "product_categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_product_categories_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_categories_workspace" ON "product_categories" ("workspaceId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_categories_parent" ON "product_categories" ("parentId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_categories_legacy" ON "product_categories" ("legacyId") WHERE "legacyId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_categories"`);
  }
}
