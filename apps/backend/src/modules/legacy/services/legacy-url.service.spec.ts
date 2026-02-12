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
    it('должен генерировать URL заявки по hash', () => {
      expect(service.getRequestUrl('abc123def456ghi789jkl012mno345')).toBe(
        'https://www.stankoff.ru/request/view/abc123def456ghi789jkl012mno345',
      );
    });

    it('должен возвращать fallback URL заявки при отсутствии hash', () => {
      expect(service.getRequestUrl(null)).toBe('https://www.stankoff.ru/request/list');
      expect(service.getRequestUrl(undefined)).toBe('https://www.stankoff.ru/request/list');
      expect(service.getRequestUrl('')).toBe('https://www.stankoff.ru/request/list');
    });

    it('должен генерировать URL сделки', () => {
      expect(service.getDealUrl(456)).toBe('https://www.stankoff.ru/deal/view/456');
    });

    it('должен генерировать URL клиента', () => {
      expect(service.getCustomerUrl(789)).toBe('https://www.stankoff.ru/client/view/789');
    });

    it('должен генерировать URL контрагента', () => {
      expect(service.getCounterpartyUrl(100)).toBe('https://www.stankoff.ru/commerce/counterparty/view/100');
    });

    it('должен генерировать URL товара по URI', () => {
      expect(service.getProductUrl('stanok-cnc-500')).toBe('https://www.stankoff.ru/blog/product/stanok-cnc-500');
    });

    it('должен возвращать fallback URL товара при отсутствии URI', () => {
      expect(service.getProductUrl(null)).toBe('https://www.stankoff.ru/blog');
      expect(service.getProductUrl(undefined)).toBe('https://www.stankoff.ru/blog');
    });

    it('должен генерировать URL категории по URI', () => {
      expect(service.getCategoryUrl('tokarnye-stanki')).toBe('https://www.stankoff.ru/blog/tokarnye-stanki');
    });

    it('должен возвращать fallback URL категории при отсутствии URI', () => {
      expect(service.getCategoryUrl(null)).toBe('https://www.stankoff.ru/blog');
    });

    it('должен генерировать URL менеджера', () => {
      expect(service.getManagerUrl(10)).toBe('https://www.stankoff.ru/admin/settings/employees/10');
    });
  });

  describe('getRequestRelatedUrls', () => {
    it('должен возвращать только URL заявки если нет связанных сущностей', () => {
      const urls = service.getRequestRelatedUrls({ requestHash: 'testhash123' });

      expect(urls.request).toBe('https://www.stankoff.ru/request/view/testhash123');
      expect(Object.keys(urls)).toHaveLength(1);
    });

    it('должен возвращать fallback при отсутствии hash', () => {
      const urls = service.getRequestRelatedUrls({ requestId: 123 });

      expect(urls.request).toBe('https://www.stankoff.ru/request/list');
    });

    it('должен возвращать все связанные URL', () => {
      const urls = service.getRequestRelatedUrls({
        requestHash: 'testhash123',
        requestId: 123,
        customerId: 456,
        managerId: 10,
        dealId: 789,
        counterpartyId: 100,
      });

      expect(urls.request).toBe('https://www.stankoff.ru/request/view/testhash123');
      expect(urls.customer).toBe('https://www.stankoff.ru/client/view/456');
      expect(urls.manager).toBe('https://www.stankoff.ru/admin/settings/employees/10');
      expect(urls.deal).toBe('https://www.stankoff.ru/deal/view/789');
      expect(urls.counterparty).toBe('https://www.stankoff.ru/commerce/counterparty/view/100');
    });

    it('должен игнорировать null значения', () => {
      const urls = service.getRequestRelatedUrls({
        requestHash: 'testhash123',
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
        request: 'https://www.stankoff.ru/request/view/abc123',
        customer: 'https://www.stankoff.ru/client/view/456',
      };

      const formatted = service.formatLinksForAI(urls);

      expect(formatted).toContain('[Заявка в CRM](https://www.stankoff.ru/request/view/abc123)');
      expect(formatted).toContain('[Карточка клиента](https://www.stankoff.ru/client/view/456)');
    });
  });

  describe('createAIContext', () => {
    it('должен создать контекст со ссылками для legacy_request с hash', () => {
      const sources = [
        {
          sourceType: 'legacy_request',
          sourceId: '123',
          metadata: {
            subject: 'Проблема с оборудованием',
            requestHash: 'abc123def456ghi789jkl012mno345',
            customerId: 456,
          },
        },
      ];

      const context = service.createAIContext(sources);

      expect(context.links).toHaveLength(2); // request + customer
      expect(context.links[0].label).toBe('Проблема с оборудованием');
      expect(context.links[0].url).toBe('https://www.stankoff.ru/request/view/abc123def456ghi789jkl012mno345');
      expect(context.links[1].url).toBe('https://www.stankoff.ru/client/view/456');
      expect(context.markdown).toContain('**Связанные материалы:**');
    });

    it('должен использовать fallback при отсутствии hash', () => {
      const sources = [
        {
          sourceType: 'legacy_request',
          sourceId: '123',
          metadata: {
            subject: 'Заявка без hash',
          },
        },
      ];

      const context = service.createAIContext(sources);

      expect(context.links[0].url).toBe('https://www.stankoff.ru/request/list');
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
          metadata: { subject: 'Заявка 1', requestHash: 'hash1_test_abc_def_ghi_jkl_mn' },
        },
        {
          sourceType: 'legacy_request',
          sourceId: '123', // тот же ID
          metadata: { subject: 'Заявка 1 (дубль)', requestHash: 'hash1_test_abc_def_ghi_jkl_mn' },
        },
      ];

      const context = service.createAIContext(sources);

      const requestLinks = context.links.filter(l => l.url.includes('/request/view/'));
      expect(requestLinks).toHaveLength(1);
    });
  });
});
