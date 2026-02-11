import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Полная очистка ВСЕХ данных в БД.
 * Удаляет абсолютно всё — включая пользователей.
 * Порядок DELETE соблюдает FK-зависимости.
 */
@Injectable()
export class SeedCleanupService {
  private readonly logger = new Logger(SeedCleanupService.name);

  constructor(private readonly dataSource: DataSource) {}

  async cleanupAll(): Promise<void> {
    this.logger.log('Очистка: удаляем ВСЕ данные...');

    // 1. BPMN — user tasks (FK → process_instances)
    await this.safeDelete('user_task_comments');
    await this.safeDelete('user_tasks');

    // 2. BPMN — entity links, activity logs, instances (FK → process_definitions, entities)
    await this.safeDelete('entity_links');
    await this.safeDelete('process_activity_logs');
    await this.safeDelete('process_instances');

    // 3. BPMN — triggers, forms, definitions
    await this.safeDelete('trigger_executions');
    await this.safeDelete('process_triggers');
    await this.safeDelete('form_definitions');
    await this.safeDelete('process_definition_versions');
    await this.safeDelete('process_definitions');

    // 4. SLA
    await this.safeDelete('sla_events');
    await this.safeDelete('sla_instances');
    await this.safeDelete('sla_definitions');

    // 5. DMN
    await this.safeDelete('decision_evaluations');
    await this.safeDelete('decision_tables');

    // 5.1 Knowledge Base
    await this.safeDelete('knowledge_articles');

    // 6. Automation, User Groups
    await this.safeDelete('automation_rules');
    await this.safeDelete('user_group_members');
    await this.safeDelete('user_groups');

    // 7. Comments + Entities
    await this.safeDelete('comments');
    await this.safeDelete('entities');

    // 8. Workspace members + Workspaces
    await this.safeDelete('workspace_members');
    await this.safeDelete('workspaces');

    // 9. Section members + Sections
    await this.safeDelete('section_members');
    await this.safeDelete('sections');

    // 10. Пользователи — ВСЕ без исключений
    await this.safeDelete('users');

    this.logger.log('Очистка: завершена — все данные удалены');
  }

  /**
   * Безопасное удаление всех записей из таблицы.
   * Если таблица не существует — просто пропускаем (table may not exist yet).
   */
  private async safeDelete(table: string): Promise<void> {
    try {
      const result = await this.dataSource.query(`DELETE FROM "${table}"`);
      const count = Array.isArray(result) ? result[1] : result?.rowCount ?? '?';
      if (count && count !== 0 && count !== '?') {
        this.logger.debug(`  ${table}: удалено ${count} записей`);
      }
    } catch {
      // Таблица может не существовать (ещё не создана миграцией)
      this.logger.debug(`  ${table}: таблица не найдена, пропускаем`);
    }
  }
}
