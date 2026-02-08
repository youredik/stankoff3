import { Test, TestingModule } from '@nestjs/testing';
import { LegacyUrlService } from './legacy-url.service';

describe('LegacyUrlService', () => {
  let service: LegacyUrlService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LegacyUrlService],
    }).compile();

    service = module.get<LegacyUrlService>(LegacyUrlService);
  });

  describe('URL генерация', () => {
    it('должен генерировать URL заявки', () => {
      expect(service.getRequestUrl(123)).toBe('https://www.stankoff.ru/crm/request/123');
    });

    it('должен генерировать URL сделки', () => {
      expect(service.getDealUrl(456)).toBe('https://www.stankoff.ru/crm/deal/456');
    });

    it('должен генерировать URL клиента', () => {
      expect(service.getCustomerUrl(789)).toBe('https://www.stankoff.ru/crm/customer/789');
    });

    it('должен генерировать URL контрагента', () => {
      expect(service.getCounterpartyUrl(100)).toBe('https://www.stankoff.ru/crm/counterparty/100');
    });

    it('должен генерировать URL товара', () => {
      expect(service.getProductUrl(200)).toBe('https://www.stankoff.ru/catalog/product/200');
    });

    it('должен генерировать URL категории', () => {
      expect(service.getCategoryUrl(50)).toBe('https://www.stankoff.ru/catalog/category/50');
    });

    it('должен генерировать URL менеджера', () => {
      expect(service.getManagerUrl(10)).toBe('https://www.stankoff.ru/crm/manager/10');
    });

    it('должен генерировать URL отдела', () => {
      expect(service.getDepartmentUrl(5)).toBe('https://www.stankoff.ru/crm/department/5');
    });
  });

  describe('getRequestRelatedUrls', () => {
    it('должен возвращать только URL заявки если нет связанных сущностей', () => {
      const urls = service.getRequestRelatedUrls({ requestId: 123 });

      expect(urls.request).toBe('https://www.stankoff.ru/crm/request/123');
      expect(Object.keys(urls)).toHaveLength(1);
    });

    it('должен возвращать все связанные URL', () => {
      const urls = service.getRequestRelatedUrls({
        requestId: 123,
        customerId: 456,
        managerId: 10,
        dealId: 789,
        productId: 200,
        counterpartyId: 100,
      });

      expect(urls.request).toBe('https://www.stankoff.ru/crm/request/123');
      expect(urls.customer).toBe('https://www.stankoff.ru/crm/customer/456');
      expect(urls.manager).toBe('https://www.stankoff.ru/crm/manager/10');
      expect(urls.deal).toBe('https://www.stankoff.ru/crm/deal/789');
      expect(urls.product).toBe('https://www.stankoff.ru/catalog/product/200');
      expect(urls.counterparty).toBe('https://www.stankoff.ru/crm/counterparty/100');
    });

    it('должен игнорировать null значения', () => {
      const urls = service.getRequestRelatedUrls({
        requestId: 123,
        customerId: null,
        managerId: undefined,
      });

      expect(urls.request).toBeDefined();
      expect(urls.customer).toBeUndefined();
      expect(urls.manager).toBeUndefined();
    });
  });

  describe('formatLinksForAI', () => {
    it('должен форматировать ссылки в markdown', () => {
      const urls = {
        request: 'https://www.stankoff.ru/crm/request/123',
        customer: 'https://www.stankoff.ru/crm/customer/456',
      };

      const formatted = service.formatLinksForAI(urls);

      expect(formatted).toContain('[Заявка в CRM](https://www.stankoff.ru/crm/request/123)');
      expect(formatted).toContain('[Карточка клиента](https://www.stankoff.ru/crm/customer/456)');
    });
  });

  describe('createAIContext', () => {
    it('должен создать контекст со ссылками для legacy_request', () => {
      const sources = [
        {
          sourceType: 'legacy_request',
          sourceId: '123',
          metadata: {
            subject: 'Проблема с оборудованием',
            customerId: 456,
          },
        },
      ];

      const context = service.createAIContext(sources);

      expect(context.links).toHaveLength(2); // request + customer
      expect(context.links[0].label).toBe('Проблема с оборудованием');
      expect(context.links[0].url).toContain('/crm/request/123');
      expect(context.links[1].url).toContain('/crm/customer/456');
      expect(context.markdown).toContain('**Связанные материалы:**');
    });

    it('должен вернуть пустой контекст для не-legacy источников', () => {
      const sources = [
        {
          sourceType: 'entity',
          sourceId: 'uuid-123',
          metadata: {},
        },
      ];

      const context = service.createAIContext(sources);

      expect(context.links).toHaveLength(0);
      expect(context.markdown).toBe('');
    });

    it('должен избегать дубликатов URL', () => {
      const sources = [
        {
          sourceType: 'legacy_request',
          sourceId: '123',
          metadata: { subject: 'Заявка 1' },
        },
        {
          sourceType: 'legacy_request',
          sourceId: '123', // тот же ID
          metadata: { subject: 'Заявка 1 (дубль)' },
        },
      ];

      const context = service.createAIContext(sources);

      // Должна быть только одна ссылка на заявку 123
      const requestLinks = context.links.filter(l => l.url.includes('/request/123'));
      expect(requestLinks).toHaveLength(1);
    });

    it('должен использовать legacyUrl из metadata если доступен', () => {
      const sources = [
        {
          sourceType: 'legacy_request',
          sourceId: '123',
          metadata: {
            subject: 'Заявка',
            legacyUrl: 'https://www.stankoff.ru/crm/request/123',
          },
        },
      ];

      const context = service.createAIContext(sources);

      expect(context.links.some(l => l.url === 'https://www.stankoff.ru/crm/request/123')).toBe(true);
    });
  });
});
