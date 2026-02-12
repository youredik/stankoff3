import { Injectable } from '@nestjs/common';

/**
 * Сервис для генерации ссылок на Legacy CRM систему (stankoff.ru)
 *
 * URL-паттерны взяты из .htaccess и router.php legacy проекта.
 */
@Injectable()
export class LegacyUrlService {
  private readonly baseUrl = 'https://www.stankoff.ru';

  /**
   * URL заявки (обращения в техподдержку)
   * Legacy: /request/view/{hash} — используется 30-символьный hash, НЕ числовой ID
   */
  getRequestUrl(hash?: string | null, requestId?: number): string {
    if (hash) {
      return `${this.baseUrl}/request/view/${hash}`;
    }
    return `${this.baseUrl}/request/list`;
  }

  /**
   * URL сделки
   * Legacy: /deal/view/{id}
   */
  getDealUrl(dealId: number): string {
    return `${this.baseUrl}/deal/view/${dealId}`;
  }

  /**
   * URL клиента (контакта)
   * Legacy: /client/view/{id}
   */
  getCustomerUrl(customerId: number): string {
    return `${this.baseUrl}/client/view/${customerId}`;
  }

  /**
   * URL контрагента (компании)
   * Legacy: /commerce/counterparty/view/{id}
   */
  getCounterpartyUrl(counterpartyId: number): string {
    return `${this.baseUrl}/commerce/counterparty/view/${counterpartyId}`;
  }

  /**
   * URL товара
   * Legacy: /blog/product/{uri} — используется URI slug, не числовой ID
   */
  getProductUrl(uri?: string | null): string {
    if (uri) {
      return `${this.baseUrl}/blog/product/${uri}`;
    }
    return `${this.baseUrl}/blog`;
  }

  /**
   * URL категории товаров
   * Legacy: /blog/{uri} — используется URI slug, не числовой ID
   */
  getCategoryUrl(uri?: string | null): string {
    if (uri) {
      return `${this.baseUrl}/blog/${uri}`;
    }
    return `${this.baseUrl}/blog`;
  }

  /**
   * URL менеджера (сотрудника)
   * Legacy: /admin/settings/employees/{id}
   */
  getManagerUrl(managerId: number): string {
    return `${this.baseUrl}/admin/settings/employees/${managerId}`;
  }

  /**
   * Генерация ссылок для всех связанных сущностей заявки
   * Возвращает объект со всеми релевантными ссылками
   */
  getRequestRelatedUrls(data: {
    requestHash?: string | null;
    requestId?: number;
    customerId?: number | null;
    managerId?: number | null;
    dealId?: number | null;
    counterpartyId?: number | null;
  }): Record<string, string> {
    const urls: Record<string, string> = {
      request: this.getRequestUrl(data.requestHash, data.requestId),
    };

    if (data.customerId) {
      urls.customer = this.getCustomerUrl(data.customerId);
    }

    if (data.managerId) {
      urls.manager = this.getManagerUrl(data.managerId);
    }

    if (data.dealId) {
      urls.deal = this.getDealUrl(data.dealId);
    }

    if (data.counterpartyId) {
      urls.counterparty = this.getCounterpartyUrl(data.counterpartyId);
    }

    return urls;
  }

  /**
   * Форматирует ссылки в markdown для включения в AI ответы
   */
  formatLinksForAI(urls: Record<string, string>): string {
    const labels: Record<string, string> = {
      request: 'Заявка в CRM',
      customer: 'Карточка клиента',
      manager: 'Менеджер',
      deal: 'Сделка',
      product: 'Товар',
      counterparty: 'Контрагент',
    };

    return Object.entries(urls)
      .map(([key, url]) => `- [${labels[key] || key}](${url})`)
      .join('\n');
  }

  /**
   * Создаёт контекст со ссылками для AI ответа
   */
  createAIContext(sources: Array<{
    sourceType: string;
    sourceId: string;
    metadata?: Record<string, unknown>;
  }>): {
    links: Array<{ label: string; url: string; sourceType: string }>;
    markdown: string;
  } {
    const links: Array<{ label: string; url: string; sourceType: string }> = [];
    const seenUrls = new Set<string>();

    for (const source of sources) {
      if (source.sourceType === 'legacy_request') {
        const requestId = parseInt(source.sourceId, 10);
        if (!isNaN(requestId)) {
          const requestHash = source.metadata?.requestHash as string | undefined;
          const url = this.getRequestUrl(requestHash, requestId);
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            const subject = source.metadata?.subject as string || `Заявка #${requestId}`;
            links.push({
              label: subject,
              url,
              sourceType: 'legacy_request',
            });
          }

          // Добавляем связанные ссылки
          if (source.metadata?.customerId) {
            const customerUrl = this.getCustomerUrl(source.metadata.customerId as number);
            if (!seenUrls.has(customerUrl)) {
              seenUrls.add(customerUrl);
              links.push({
                label: 'Клиент',
                url: customerUrl,
                sourceType: 'customer',
              });
            }
          }
        }
      }
    }

    const markdown = links.length > 0
      ? '**Связанные материалы:**\n' + links.map(l => `- [${l.label}](${l.url})`).join('\n')
      : '';

    return { links, markdown };
  }
}
