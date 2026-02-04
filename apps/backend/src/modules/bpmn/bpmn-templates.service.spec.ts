import { Test, TestingModule } from '@nestjs/testing';
import { BpmnTemplatesService } from './bpmn-templates.service';

describe('BpmnTemplatesService', () => {
  let service: BpmnTemplatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BpmnTemplatesService],
    }).compile();

    service = module.get<BpmnTemplatesService>(BpmnTemplatesService);
  });

  describe('getTemplatesList', () => {
    it('должен вернуть список шаблонов без XML', () => {
      const templates = service.getTemplatesList();

      expect(Array.isArray(templates)).toBe(true);
      // Проверяем, что XML не включён в ответ
      templates.forEach((template) => {
        expect(template).toHaveProperty('id');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('category');
        expect(template).not.toHaveProperty('bpmnXml');
      });
    });

    it('должен вернуть шаблон simple-approval', () => {
      const templates = service.getTemplatesList();
      const simpleApproval = templates.find((t) => t.id === 'simple-approval');

      expect(simpleApproval).toBeDefined();
      expect(simpleApproval?.name).toBe('Простое согласование');
      expect(simpleApproval?.category).toBe('approval');
    });

    it('должен вернуть шаблон support-ticket', () => {
      const templates = service.getTemplatesList();
      const supportTicket = templates.find((t) => t.id === 'support-ticket');

      expect(supportTicket).toBeDefined();
      expect(supportTicket?.name).toBe('Обработка заявки техподдержки');
      expect(supportTicket?.category).toBe('support');
    });
  });

  describe('getTemplate', () => {
    it('должен вернуть шаблон с XML по ID', () => {
      const template = service.getTemplate('simple-approval');

      expect(template).not.toBeNull();
      expect(template?.id).toBe('simple-approval');
      expect(template?.bpmnXml).toBeDefined();
      expect(template?.bpmnXml).toContain('<?xml');
      expect(template?.bpmnXml).toContain('bpmn:definitions');
    });

    it('должен вернуть null для несуществующего шаблона', () => {
      const template = service.getTemplate('non-existent');

      expect(template).toBeNull();
    });
  });

  describe('getTemplatesByCategory', () => {
    it('должен вернуть шаблоны категории approval', () => {
      const templates = service.getTemplatesByCategory('approval');

      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      templates.forEach((t) => {
        expect(t.category).toBe('approval');
        expect(t).not.toHaveProperty('bpmnXml');
      });
    });

    it('должен вернуть шаблоны категории support', () => {
      const templates = service.getTemplatesByCategory('support');

      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      templates.forEach((t) => {
        expect(t.category).toBe('support');
      });
    });

    it('должен вернуть пустой массив для несуществующей категории', () => {
      const templates = service.getTemplatesByCategory('non-existent');

      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBe(0);
    });
  });

  describe('getCategories', () => {
    it('должен вернуть список категорий с метаданными', () => {
      const categories = service.getCategories();

      expect(Array.isArray(categories)).toBe(true);

      // Проверяем структуру
      const approvalCategory = categories.find(c => c.category === 'approval');
      expect(approvalCategory).toBeDefined();
      expect(approvalCategory?.label).toBe('Согласование');
      expect(approvalCategory?.count).toBeGreaterThan(0);

      const supportCategory = categories.find(c => c.category === 'support');
      expect(supportCategory).toBeDefined();
      expect(supportCategory?.label).toBe('Техподдержка');
    });

    it('должен вернуть уникальные категории', () => {
      const categories = service.getCategories();
      const uniqueCategories = [...new Set(categories.map(c => c.category))];

      expect(categories.length).toBe(uniqueCategories.length);
    });
  });

  describe('searchTemplates', () => {
    it('должен найти шаблоны по названию', () => {
      const results = service.searchTemplates('согласование');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(t => t.name.toLowerCase().includes('согласование'))).toBe(true);
    });

    it('должен найти шаблоны по тегам', () => {
      const results = service.searchTemplates('SLA');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('должен вернуть пустой массив если ничего не найдено', () => {
      const results = service.searchTemplates('несуществующий запрос xyz123');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });
});
