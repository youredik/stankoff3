import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export type TemplateCategory = 'approval' | 'support' | 'hr' | 'finance' | 'operations' | 'it' | 'other';
export type TemplateDifficulty = 'simple' | 'medium' | 'advanced';

export interface BpmnTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  difficulty: TemplateDifficulty;
  estimatedDuration: string;
  bpmnXml: string;
}

export interface TemplateMetadata {
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  difficulty: TemplateDifficulty;
  estimatedDuration: string;
}

@Injectable()
export class BpmnTemplatesService {
  private readonly logger = new Logger(BpmnTemplatesService.name);
  private readonly templatesDir = path.join(__dirname, 'templates');
  private templates: BpmnTemplate[] = [];

  constructor() {
    this.loadTemplates();
  }

  private loadTemplates() {
    // Define template metadata
    const templateMeta: Record<string, TemplateMetadata> = {
      'simple-approval': {
        name: 'Простое согласование',
        description:
          'Базовый процесс согласования с одобрением или отклонением заявки',
        category: 'approval',
        tags: ['согласование', 'базовый', 'быстрый старт'],
        difficulty: 'simple',
        estimatedDuration: '15-30 мин',
      },
      'support-ticket': {
        name: 'Обработка заявки техподдержки',
        description:
          'Полный цикл обработки заявки: приём, классификация, назначение, выполнение, закрытие',
        category: 'support',
        tags: ['техподдержка', 'тикет', 'SLA'],
        difficulty: 'medium',
        estimatedDuration: '1-4 ч',
      },
      'multi-level-approval': {
        name: 'Многоуровневое согласование',
        description:
          'Процесс с несколькими уровнями согласования и эскалацией на руководство. Boundary timer 24ч на каждом уровне — автоматическое напоминание согласующему.',
        category: 'approval',
        tags: ['согласование', 'эскалация', 'иерархия', 'boundary timer'],
        difficulty: 'advanced',
        estimatedDuration: '1-3 дня',
      },
      'vacation-request': {
        name: 'Заявка на отпуск',
        description:
          'Процесс подачи и согласования заявки на отпуск с уведомлениями',
        category: 'hr',
        tags: ['HR', 'отпуск', 'согласование'],
        difficulty: 'simple',
        estimatedDuration: '1-2 дня',
      },
      'expense-approval': {
        name: 'Согласование расходов',
        description:
          'Процесс согласования расходов с проверкой бюджета и лимитов',
        category: 'finance',
        tags: ['финансы', 'расходы', 'бюджет'],
        difficulty: 'medium',
        estimatedDuration: '1-3 дня',
      },
      'onboarding': {
        name: 'Онбординг сотрудника',
        description:
          'Комплексный процесс приёма нового сотрудника: документы, доступы, обучение',
        category: 'hr',
        tags: ['HR', 'онбординг', 'чеклист'],
        difficulty: 'advanced',
        estimatedDuration: '1-2 недели',
      },
      'change-request': {
        name: 'Запрос на изменение',
        description:
          'IT процесс управления изменениями (Change Management)',
        category: 'it',
        tags: ['IT', 'ITIL', 'change management'],
        difficulty: 'medium',
        estimatedDuration: '1-5 дней',
      },
      'incident-management': {
        name: 'Управление инцидентами',
        description:
          'ITIL-совместимый процесс обработки инцидентов с эскалацией',
        category: 'it',
        tags: ['IT', 'ITIL', 'инцидент', 'SLA'],
        difficulty: 'advanced',
        estimatedDuration: '15 мин - 8 ч',
      },
      'purchase-order': {
        name: 'Заказ на закупку',
        description:
          'Процесс создания и согласования заказа на закупку с проверкой бюджета',
        category: 'finance',
        tags: ['закупки', 'финансы', 'согласование'],
        difficulty: 'medium',
        estimatedDuration: '1-5 дней',
      },
      'document-review': {
        name: 'Рецензирование документа',
        description:
          'Параллельное рецензирование документа несколькими участниками',
        category: 'operations',
        tags: ['документы', 'рецензирование', 'параллельный'],
        difficulty: 'medium',
        estimatedDuration: '1-3 дня',
      },
      'service-support-v2': {
        name: 'Техподдержка (полный цикл)',
        description:
          'ITIL-совместимый процесс: AI-классификация, маршрутизация L1/L2, эскалация, ожидание клиента, автозакрытие, переквалификация в рекламацию. Boundary timer 4ч на основной работе — автоуведомление руководителя.',
        category: 'support',
        tags: ['техподдержка', 'ITIL', 'SLA', 'AI', 'эскалация', 'L1', 'L2', 'boundary timer'],
        difficulty: 'advanced',
        estimatedDuration: '15 мин - 72 ч',
      },
      'claims-management': {
        name: 'Управление рекламациями (ISO 10002)',
        description:
          'Полный цикл рекламации: регистрация, расследование, RCA (анализ корневых причин), решение, корректирующие действия, уведомление клиента. Boundary timer 5 дней на расследование — эскалация при задержке.',
        category: 'support',
        tags: ['рекламации', 'ISO 10002', 'RCA', 'качество', 'корректирующие действия', 'boundary timer'],
        difficulty: 'advanced',
        estimatedDuration: '1 - 14 дней',
      },
      'sla-escalation': {
        name: 'Автоэскалация по SLA',
        description:
          'Автоматическая эскалация при нарушении SLA: предупреждение (80%), нарушение (100%), критическое (150%) с уведомлением руководства',
        category: 'support',
        tags: ['SLA', 'эскалация', 'уведомления', 'руководство'],
        difficulty: 'simple',
        estimatedDuration: '1-5 мин',
      },
      'smart-routing': {
        name: 'Умная маршрутизация',
        description:
          'AI классификация, проверка дубликатов, автоматический подбор исполнителя. Высокий приоритет — ручная проверка назначения.',
        category: 'support',
        tags: ['AI', 'маршрутизация', 'классификация', 'дубликаты', 'автоназначение'],
        difficulty: 'medium',
        estimatedDuration: '1-5 мин',
      },
    };

    try {
      if (!fs.existsSync(this.templatesDir)) {
        this.logger.warn(`Templates directory not found: ${this.templatesDir}`);
        return;
      }

      const files = fs.readdirSync(this.templatesDir);

      for (const file of files) {
        if (!file.endsWith('.bpmn')) continue;

        const id = file.replace('.bpmn', '');
        const filePath = path.join(this.templatesDir, file);

        try {
          const bpmnXml = fs.readFileSync(filePath, 'utf-8');
          const meta = templateMeta[id] || {
            name: id,
            description: '',
            category: 'other' as TemplateCategory,
            tags: [],
            difficulty: 'simple' as TemplateDifficulty,
            estimatedDuration: 'неизвестно',
          };

          this.templates.push({
            id,
            name: meta.name,
            description: meta.description,
            category: meta.category,
            tags: meta.tags,
            difficulty: meta.difficulty,
            estimatedDuration: meta.estimatedDuration,
            bpmnXml,
          });

          this.logger.log(`Loaded BPMN template: ${id}`);
        } catch (error) {
          this.logger.error(`Failed to load template ${file}: ${error.message}`);
        }
      }

      this.logger.log(`Loaded ${this.templates.length} BPMN templates`);
    } catch (error) {
      this.logger.error(`Failed to load templates: ${error.message}`);
    }
  }

  /**
   * Get all available templates (without XML content for list view)
   */
  getTemplatesList(): Omit<BpmnTemplate, 'bpmnXml'>[] {
    return this.templates.map(({ id, name, description, category, tags, difficulty, estimatedDuration }) => ({
      id,
      name,
      description,
      category,
      tags,
      difficulty,
      estimatedDuration,
    }));
  }

  /**
   * Get a specific template by ID
   */
  getTemplate(id: string): BpmnTemplate | null {
    return this.templates.find((t) => t.id === id) || null;
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): Omit<BpmnTemplate, 'bpmnXml'>[] {
    return this.templates
      .filter((t) => t.category === category)
      .map(({ id, name, description, category, tags, difficulty, estimatedDuration }) => ({
        id,
        name,
        description,
        category,
        tags,
        difficulty,
        estimatedDuration,
      }));
  }

  /**
   * Search templates by name, description, or tags
   */
  searchTemplates(query: string): Omit<BpmnTemplate, 'bpmnXml'>[] {
    const lowerQuery = query.toLowerCase();
    return this.templates
      .filter(
        (t) =>
          t.name.toLowerCase().includes(lowerQuery) ||
          t.description.toLowerCase().includes(lowerQuery) ||
          t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)),
      )
      .map(({ id, name, description, category, tags, difficulty, estimatedDuration }) => ({
        id,
        name,
        description,
        category,
        tags,
        difficulty,
        estimatedDuration,
      }));
  }

  /**
   * Get all available categories with counts
   */
  getCategories(): { category: string; count: number; label: string }[] {
    const categoryLabels: Record<TemplateCategory, string> = {
      approval: 'Согласование',
      support: 'Техподдержка',
      hr: 'HR',
      finance: 'Финансы',
      operations: 'Операции',
      it: 'IT',
      other: 'Прочее',
    };

    const counts = new Map<string, number>();
    for (const template of this.templates) {
      const count = counts.get(template.category) || 0;
      counts.set(template.category, count + 1);
    }

    return Array.from(counts.entries()).map(([category, count]) => ({
      category,
      count,
      label: categoryLabels[category as TemplateCategory] || category,
    }));
  }

  /**
   * Get built-in templates metadata (including those not yet loaded from files)
   * This allows frontend to show templates that could be available
   */
  getAvailableTemplatesMeta(): Omit<BpmnTemplate, 'bpmnXml'>[] {
    // Return templates that have metadata defined (even if file not present)
    const allMeta: TemplateMetadata[] = [
      {
        name: 'Простое согласование',
        description: 'Базовый процесс согласования с одобрением или отклонением заявки',
        category: 'approval',
        tags: ['согласование', 'базовый', 'быстрый старт'],
        difficulty: 'simple',
        estimatedDuration: '15-30 мин',
      },
      {
        name: 'Обработка заявки техподдержки',
        description: 'Полный цикл обработки заявки: приём, классификация, назначение, выполнение, закрытие',
        category: 'support',
        tags: ['техподдержка', 'тикет', 'SLA'],
        difficulty: 'medium',
        estimatedDuration: '1-4 ч',
      },
      {
        name: 'Многоуровневое согласование',
        description: 'Процесс с несколькими уровнями согласования и эскалацией на руководство',
        category: 'approval',
        tags: ['согласование', 'эскалация', 'иерархия'],
        difficulty: 'advanced',
        estimatedDuration: '1-3 дня',
      },
      {
        name: 'Заявка на отпуск',
        description: 'Процесс подачи и согласования заявки на отпуск с уведомлениями',
        category: 'hr',
        tags: ['HR', 'отпуск', 'согласование'],
        difficulty: 'simple',
        estimatedDuration: '1-2 дня',
      },
      {
        name: 'Согласование расходов',
        description: 'Процесс согласования расходов с проверкой бюджета и лимитов',
        category: 'finance',
        tags: ['финансы', 'расходы', 'бюджет'],
        difficulty: 'medium',
        estimatedDuration: '1-3 дня',
      },
    ];

    return allMeta.map((meta, index) => ({
      id: `template-${index}`,
      ...meta,
    }));
  }
}
