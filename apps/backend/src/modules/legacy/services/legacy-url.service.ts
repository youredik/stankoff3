import { Injectable } from '@nestjs/common';

/**
 * Сервис для генерации ссылок на Legacy CRM систему
 * Базовый URL: https://www.stankoff.ru
 */
@Injectable()
export class LegacyUrlService {
  private readonly baseUrl = 'https://www.stankoff.ru';

  /**
   * URL заявки (обращения в техподдержку)
   */
  getRequestUrl(requestId: number): string {
    return `${this.baseUrl}/crm/request/${requestId}`;
  }

  /**
   * URL сделки
   */
  getDealUrl(dealId: number): string {
    return `${this.baseUrl}/crm/deal/${dealId}`;
  }

  /**
   * URL клиента (контакта)
   */
  getCustomerUrl(customerId: number): string {
    return `${this.baseUrl}/crm/customer/${customerId}`;
  }

  /**
   * URL контрагента (компании)
   */
  getCounterpartyUrl(counterpartyId: number): string {
    return `${this.baseUrl}/crm/counterparty/${counterpartyId}`;
  }

  /**
   * URL товара в каталоге
   */
  getProductUrl(productId: number): string {
    return `${this.baseUrl}/catalog/product/${productId}`;
  }

  /**
   * URL категории товаров
   */
  getCategoryUrl(categoryId: number): string {
    return `${this.baseUrl}/catalog/category/${categoryId}`;
  }

  /**
   * URL менеджера (сотрудника)
   */
  getManagerUrl(managerId: number): string {
    return `${this.baseUrl}/crm/manager/${managerId}`;
  }

  /**
   * URL отдела
   */
  getDepartmentUrl(departmentId: number): string {
    return `${this.baseUrl}/crm/department/${departmentId}`;
  }

  /**
   * Генерация ссылок для всех связанных сущностей заявки
   * Возвращает объект со всеми релевантными ссылками
   */
  getRequestRelatedUrls(data: {
    requestId: number;
    customerId?: number | null;
    managerId?: number | null;
    dealId?: number | null;
    productId?: number | null;
    counterpartyId?: number | null;
  }): Record<string, string> {
    const urls: Record<string, string> = {
      request: this.getRequestUrl(data.requestId),
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

    if (data.productId) {
      urls.product = this.getProductUrl(data.productId);
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
          const url = this.getRequestUrl(requestId);
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

          // Если есть legacyUrl в metadata, используем его
          if (source.metadata?.legacyUrl && typeof source.metadata.legacyUrl === 'string') {
            const legacyUrl = source.metadata.legacyUrl;
            if (!seenUrls.has(legacyUrl)) {
              seenUrls.add(legacyUrl);
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
