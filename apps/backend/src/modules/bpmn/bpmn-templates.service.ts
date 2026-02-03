import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface BpmnTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  bpmnXml: string;
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
    const templateMeta: Record<
      string,
      { name: string; description: string; category: string }
    > = {
      'simple-approval': {
        name: 'Простое согласование',
        description:
          'Базовый процесс согласования с одобрением или отклонением заявки',
        category: 'approval',
      },
      'support-ticket': {
        name: 'Обработка заявки техподдержки',
        description:
          'Полный цикл обработки заявки: приём, классификация, назначение, выполнение, закрытие',
        category: 'support',
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
            category: 'other',
          };

          this.templates.push({
            id,
            name: meta.name,
            description: meta.description,
            category: meta.category,
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
    return this.templates.map(({ id, name, description, category }) => ({
      id,
      name,
      description,
      category,
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
      .map(({ id, name, description, category }) => ({
        id,
        name,
        description,
        category,
      }));
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    return [...new Set(this.templates.map((t) => t.category))];
  }
}
