import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Миграция 1: Создание таблицы roles + системные роли + добавление role_id в существующие таблицы.
 *
 * БЕЗОПАСНАЯ миграция — старые колонки role (enum) НЕ удаляются.
 * Данные мигрируются: enum → role FK.
 */
export class AddRbacRolesTable1772000000000 implements MigrationInterface {
  name = 'AddRbacRolesTable1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Создаём таблицу roles ──────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "name" VARCHAR(100) NOT NULL,
        "slug" VARCHAR(100) NOT NULL,
        "description" TEXT,
        "scope" VARCHAR(20) NOT NULL,
        "permissions" TEXT[] NOT NULL DEFAULT '{}',
        "is_system" BOOLEAN NOT NULL DEFAULT false,
        "is_default" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roles_slug" UNIQUE ("slug"),
        CONSTRAINT "CHK_roles_scope" CHECK ("scope" IN ('global', 'section', 'workspace'))
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_roles_scope" ON "roles" ("scope")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_roles_slug" ON "roles" ("slug")`);

    // ── 2. Вставляем системные роли с фиксированными UUID ────
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "slug", "name", "description", "scope", "permissions", "is_system", "is_default")
      VALUES
        -- Global
        ('00000000-0000-4000-a000-000000000001', 'super_admin', 'Суперадминистратор', 'Полный доступ ко всем функциям портала', 'global', '{*}', true, false),
        ('00000000-0000-4000-a000-000000000002', 'department_head', 'Руководитель отдела', 'Руководитель отдела с доступом к глобальной аналитике', 'global', '{global:analytics:read}', true, false),
        ('00000000-0000-4000-a000-000000000003', 'employee', 'Сотрудник', 'Базовая роль сотрудника. Доступ определяется ролями в рабочих пространствах', 'global', '{}', true, true),
        -- Section
        ('00000000-0000-4000-a000-000000000011', 'section_admin', 'Администратор раздела', 'Полный доступ к разделу: редактирование, управление участниками', 'section', '{section:*}', true, false),
        ('00000000-0000-4000-a000-000000000012', 'section_viewer', 'Наблюдатель раздела', 'Просмотр раздела и списка рабочих пространств', 'section', '{section:read}', true, true),
        -- Workspace
        ('00000000-0000-4000-a000-000000000021', 'ws_admin', 'Администратор', 'Полный доступ к рабочему пространству: настройки, участники, все данные', 'workspace', '{workspace:*}', true, false),
        ('00000000-0000-4000-a000-000000000022', 'ws_editor', 'Редактор', 'Работа с заявками, комментариями и задачами', 'workspace', '{"workspace:entity:*","workspace:entity.field.*:*","workspace:comment:*","workspace:bpmn.task:*","workspace:analytics:read"}', true, true),
        ('00000000-0000-4000-a000-000000000023', 'ws_viewer', 'Наблюдатель', 'Только просмотр заявок, комментариев и аналитики', 'workspace', '{"workspace:entity:read","workspace:entity.field.*:read","workspace:comment:read","workspace:analytics:read"}', true, false)
      ON CONFLICT ("slug") DO UPDATE SET
        "permissions" = EXCLUDED."permissions",
        "name" = EXCLUDED."name",
        "description" = EXCLUDED."description",
        "is_system" = EXCLUDED."is_system",
        "is_default" = EXCLUDED."is_default"
    `);

    // ── 3. Добавляем role_id (nullable) в существующие таблицы ─
    // users
    const usersHasRoleId = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'role_id'
    `);
    if (usersHasRoleId.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "users" ADD COLUMN "role_id" UUID REFERENCES "roles"("id")
      `);
      await queryRunner.query(`CREATE INDEX "idx_users_role_id" ON "users" ("role_id")`);
    }

    // workspace_members
    const wmHasRoleId = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'workspace_members' AND column_name = 'role_id'
    `);
    if (wmHasRoleId.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "workspace_members" ADD COLUMN "role_id" UUID REFERENCES "roles"("id")
      `);
      await queryRunner.query(`CREATE INDEX "idx_workspace_members_role_id" ON "workspace_members" ("role_id")`);
    }

    // section_members
    const smHasRoleId = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'section_members' AND column_name = 'role_id'
    `);
    if (smHasRoleId.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "section_members" ADD COLUMN "role_id" UUID REFERENCES "roles"("id")
      `);
      await queryRunner.query(`CREATE INDEX "idx_section_members_role_id" ON "section_members" ("role_id")`);
    }

    // ── 4. Мигрируем данные: старый enum → role_id ────────────
    // users: admin → super_admin, manager → department_head, employee → employee
    await queryRunner.query(`
      UPDATE "users" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'super_admin')
      WHERE "role" = 'admin' AND "role_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "users" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'department_head')
      WHERE "role" = 'manager' AND "role_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "users" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'employee')
      WHERE "role" = 'employee' AND "role_id" IS NULL
    `);
    // Fallback: любые оставшиеся → employee
    await queryRunner.query(`
      UPDATE "users" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'employee')
      WHERE "role_id" IS NULL
    `);

    // workspace_members: admin → ws_admin, editor → ws_editor, viewer → ws_viewer
    await queryRunner.query(`
      UPDATE "workspace_members" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'ws_admin')
      WHERE "role" = 'admin' AND "role_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "workspace_members" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'ws_editor')
      WHERE "role" = 'editor' AND "role_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "workspace_members" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'ws_viewer')
      WHERE "role" = 'viewer' AND "role_id" IS NULL
    `);
    // Fallback
    await queryRunner.query(`
      UPDATE "workspace_members" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'ws_editor')
      WHERE "role_id" IS NULL
    `);

    // section_members: admin → section_admin, viewer → section_viewer
    await queryRunner.query(`
      UPDATE "section_members" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'section_admin')
      WHERE "role" = 'admin' AND "role_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "section_members" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'section_viewer')
      WHERE "role" = 'viewer' AND "role_id" IS NULL
    `);
    // Fallback
    await queryRunner.query(`
      UPDATE "section_members" SET "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'section_viewer')
      WHERE "role_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Удаляем role_id колонки
    await queryRunner.query(`ALTER TABLE "section_members" DROP COLUMN IF EXISTS "role_id"`);
    await queryRunner.query(`ALTER TABLE "workspace_members" DROP COLUMN IF EXISTS "role_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role_id"`);

    // Удаляем индексы
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_section_members_role_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_workspace_members_role_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_role_id"`);

    // Удаляем таблицу
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
  }
}
