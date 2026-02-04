import { Test, TestingModule } from '@nestjs/testing';
import { RestConnector } from './rest.connector';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('RestConnector', () => {
  let connector: RestConnector;

  beforeEach(async () => {
    mockFetch.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RestConnector],
    }).compile();

    connector = module.get<RestConnector>(RestConnector);
  });

  describe('metadata', () => {
    it('should have correct type', () => {
      expect(connector.type).toBe('connector:rest');
    });

    it('should have correct name', () => {
      expect(connector.name).toBe('REST API / Webhook');
    });

    it('should have input schema with required fields', () => {
      expect(connector.inputSchema.required).toContain('url');
    });
  });

  describe('execute', () => {
    const baseContext = {
      processInstanceKey: 'test-123',
      workspaceId: 'ws-1',
      entityId: 'entity-1',
      variables: {},
    };

    it('should make GET request successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ data: 'test' }),
      });

      const result = await connector.execute(
        {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
        baseContext,
      );

      expect(result.success).toBe(true);
      expect(result.data?.statusCode).toBe(200);
      expect(result.data?.body).toEqual({ data: 'test' });
    });

    it('should make POST request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ id: 1 }),
      });

      await connector.execute(
        {
          url: 'https://api.example.com/items',
          method: 'POST',
          body: { name: 'Test' },
        },
        baseContext,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        }),
      );
    });

    it('should interpolate variables in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      await connector.execute(
        {
          url: 'https://api.example.com/entities/{entityId}',
        },
        {
          ...baseContext,
          variables: { entityId: 'entity-123' },
        },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('entities/entity-123'),
        expect.any(Object),
      );
    });

    it('should add query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      await connector.execute(
        {
          url: 'https://api.example.com/search',
          queryParams: { q: 'test', page: '1' },
        },
        baseContext,
      );

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('q=test');
      expect(calledUrl).toContain('page=1');
    });

    it('should apply Basic authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      await connector.execute(
        {
          url: 'https://api.example.com/data',
          auth: {
            type: 'basic',
            username: 'user',
            password: 'pass',
          },
        },
        baseContext,
      );

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toMatch(/^Basic /);
    });

    it('should apply Bearer token authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      await connector.execute(
        {
          url: 'https://api.example.com/data',
          auth: {
            type: 'bearer',
            token: 'my-token',
          },
        },
        baseContext,
      );

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('should apply API key authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      await connector.execute(
        {
          url: 'https://api.example.com/data',
          auth: {
            type: 'api-key',
            apiKey: 'secret-key',
            apiKeyHeader: 'X-Custom-Key',
          },
        },
        baseContext,
      );

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['X-Custom-Key']).toBe('secret-key');
    });

    it('should map response fields', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            result: {
              id: 123,
              nested: { value: 'test' },
            },
          }),
      });

      const result = await connector.execute(
        {
          url: 'https://api.example.com/data',
          responseMapping: {
            extractedId: '$.result.id',
            extractedValue: '$.result.nested.value',
          },
        },
        baseContext,
      );

      expect(result.data?.mappedValues).toEqual({
        extractedId: 123,
        extractedValue: 'test',
      });
    });

    it('should return error for non-success status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ error: 'Resource not found' }),
      });

      const result = await connector.execute(
        {
          url: 'https://api.example.com/missing',
        },
        baseContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });

    it('should allow custom success status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      const result = await connector.execute(
        {
          url: 'https://api.example.com/data',
          successStatusCodes: [200, 404], // 404 is OK for this request
        },
        baseContext,
      );

      expect(result.success).toBe(true);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await connector.execute(
        {
          url: 'https://api.example.com/data',
        },
        baseContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('should handle timeout', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await connector.execute(
        {
          url: 'https://api.example.com/slow',
          timeout: 100,
        },
        baseContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should interpolate variables in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      await connector.execute(
        {
          url: 'https://api.example.com/webhook',
          method: 'POST',
          body: {
            entityId: '{entityId}',
            status: '{status}',
          },
        },
        {
          ...baseContext,
          variables: { entityId: 'entity-123', status: 'active' },
        },
      );

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.entityId).toBe('entity-123');
      expect(sentBody.status).toBe('active');
    });
  });

  describe('validate', () => {
    it('should validate valid base URL', async () => {
      const result = await connector.validate({
        baseUrl: 'https://api.example.com',
      });

      expect(result.valid).toBe(true);
    });

    it('should return error for invalid URL', async () => {
      const result = await connector.validate({
        baseUrl: 'not-a-valid-url',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });
});
