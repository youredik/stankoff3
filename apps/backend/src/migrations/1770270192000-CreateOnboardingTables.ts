import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOnboardingTables1770270192000 implements MigrationInterface {
  name = 'CreateOnboardingTables1770270192000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Таблица туров онбординга
    await queryRunner.query(`
      CREATE TABLE "onboarding_tours" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "code" varchar(100) NOT NULL,
        "audience" varchar(50) NOT NULL DEFAULT 'all',
        "targetRoles" text,
        "targetDepartments" text,
        "order" int NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "isRequired" boolean NOT NULL DEFAULT false,
        "autoStart" boolean NOT NULL DEFAULT false,
        "icon" varchar(50),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_onboarding_tours_code" UNIQUE ("code"),
        CONSTRAINT "PK_onboarding_tours" PRIMARY KEY ("id")
      )
    `);

    // Таблица шагов онбординга
    await queryRunner.query(`
      CREATE TABLE "onboarding_steps" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tour_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "content" text NOT NULL,
        "type" varchar(50) NOT NULL DEFAULT 'tooltip',
        "targetSelector" varchar(500),
        "route" varchar(255),
        "tooltipPosition" varchar(20) NOT NULL DEFAULT 'auto',
        "videoUrl" varchar(500),
        "quiz_id" uuid,
        "requiredAction" jsonb,
        "order" int NOT NULL DEFAULT 0,
        "skippable" boolean NOT NULL DEFAULT true,
        "delay" int NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_onboarding_steps" PRIMARY KEY ("id"),
        CONSTRAINT "FK_onboarding_steps_tour" FOREIGN KEY ("tour_id")
          REFERENCES "onboarding_tours"("id") ON DELETE CASCADE
      )
    `);

    // Таблица прогресса пользователя
    await queryRunner.query(`
      CREATE TABLE "onboarding_progress" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "tour_id" uuid NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'not_started',
        "current_step_id" uuid,
        "completed_steps" text NOT NULL DEFAULT '',
        "skipped_steps" text NOT NULL DEFAULT '',
        "completion_percentage" int NOT NULL DEFAULT 0,
        "quiz_results" jsonb,
        "started_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_onboarding_progress_user_tour" UNIQUE ("user_id", "tour_id"),
        CONSTRAINT "PK_onboarding_progress" PRIMARY KEY ("id"),
        CONSTRAINT "FK_onboarding_progress_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_onboarding_progress_tour" FOREIGN KEY ("tour_id")
          REFERENCES "onboarding_tours"("id") ON DELETE CASCADE
      )
    `);

    // Индексы для прогресса
    await queryRunner.query(`
      CREATE INDEX "IDX_onboarding_progress_user_status" ON "onboarding_progress" ("user_id", "status")
    `);

    // Таблица квизов
    await queryRunner.query(`
      CREATE TABLE "onboarding_quizzes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "code" varchar(100) NOT NULL,
        "questions" jsonb NOT NULL,
        "passing_score" int NOT NULL DEFAULT 70,
        "time_limit" int,
        "max_attempts" int,
        "shuffle_questions" boolean NOT NULL DEFAULT false,
        "shuffle_options" boolean NOT NULL DEFAULT false,
        "show_explanations" boolean NOT NULL DEFAULT true,
        "show_results" boolean NOT NULL DEFAULT true,
        "isActive" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_onboarding_quizzes_code" UNIQUE ("code"),
        CONSTRAINT "PK_onboarding_quizzes" PRIMARY KEY ("id")
      )
    `);

    // Добавляем FK для шагов на квизы
    await queryRunner.query(`
      ALTER TABLE "onboarding_steps"
      ADD CONSTRAINT "FK_onboarding_steps_quiz"
      FOREIGN KEY ("quiz_id") REFERENCES "onboarding_quizzes"("id") ON DELETE SET NULL
    `);

    // Индексы для производительности
    await queryRunner.query(`
      CREATE INDEX "IDX_onboarding_tours_active_order" ON "onboarding_tours" ("isActive", "order")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_onboarding_steps_tour_order" ON "onboarding_steps" ("tour_id", "order")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Удаляем индексы
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_onboarding_steps_tour_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_onboarding_tours_active_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_onboarding_progress_user_status"`);

    // Удаляем FK
    await queryRunner.query(`
      ALTER TABLE "onboarding_steps" DROP CONSTRAINT IF EXISTS "FK_onboarding_steps_quiz"
    `);

    // Удаляем таблицы в обратном порядке
    await queryRunner.query(`DROP TABLE IF EXISTS "onboarding_quizzes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "onboarding_progress"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "onboarding_steps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "onboarding_tours"`);
  }
}
