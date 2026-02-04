import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('BPMN E2E Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    // Give time for all connections to close
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  describe('BPMN Health (Public)', () => {
    describe('GET /api/bpmn/health', () => {
      it('должен вернуть статус подключения Zeebe', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/bpmn/health')
          .expect(200);

        expect(response.body).toHaveProperty('connected');
        expect(typeof response.body.connected).toBe('boolean');
      });
    });
  });

  describe('BPMN Templates (требуют авторизацию)', () => {
    describe('GET /api/bpmn/templates', () => {
      it('должен вернуть 401 без авторизации', async () => {
        await request(app.getHttpServer())
          .get('/api/bpmn/templates')
          .expect(401);
      });
    });

    describe('GET /api/bpmn/templates/categories', () => {
      it('должен вернуть 401 без авторизации', async () => {
        await request(app.getHttpServer())
          .get('/api/bpmn/templates/categories')
          .expect(401);
      });
    });

    describe('GET /api/bpmn/templates/:id', () => {
      it('должен вернуть 401 без авторизации', async () => {
        await request(app.getHttpServer())
          .get('/api/bpmn/templates/service-request-basic')
          .expect(401);
      });
    });
  });

  describe('BPMN Protected Endpoints', () => {
    const testWorkspaceId = '00000000-0000-0000-0000-000000000001';
    const testDefinitionId = '00000000-0000-0000-0000-000000000002';
    const testEntityId = '00000000-0000-0000-0000-000000000003';

    describe('Process Definitions', () => {
      it('GET /api/bpmn/definitions/:workspaceId - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .get(`/api/bpmn/definitions/${testWorkspaceId}`)
          .expect(401);
      });

      it('GET /api/bpmn/definition/:id - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .get(`/api/bpmn/definition/${testDefinitionId}`)
          .expect(401);
      });

      it('POST /api/bpmn/definitions/:workspaceId - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .post(`/api/bpmn/definitions/${testWorkspaceId}`)
          .send({
            name: 'Test Process',
            processId: 'test-process',
            bpmnXml: '<bpmn></bpmn>',
          })
          .expect(401);
      });

      it('POST /api/bpmn/definition/:id/deploy - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .post(`/api/bpmn/definition/${testDefinitionId}/deploy`)
          .expect(401);
      });

      it('DELETE /api/bpmn/definition/:id - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .delete(`/api/bpmn/definition/${testDefinitionId}`)
          .expect(401);
      });
    });

    describe('Process Instances', () => {
      it('GET /api/bpmn/instances/workspace/:workspaceId - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .get(`/api/bpmn/instances/workspace/${testWorkspaceId}`)
          .expect(401);
      });

      it('GET /api/bpmn/instances/entity/:entityId - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .get(`/api/bpmn/instances/entity/${testEntityId}`)
          .expect(401);
      });

      it('POST /api/bpmn/instances/start - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .post('/api/bpmn/instances/start')
          .send({
            processDefinitionId: testDefinitionId,
            entityId: testEntityId,
            variables: {},
          })
          .expect(401);
      });

      it('POST /api/bpmn/instances/:key/cancel - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .post('/api/bpmn/instances/123456789/cancel')
          .expect(401);
      });
    });

    describe('Statistics', () => {
      it('GET /api/bpmn/statistics/definition/:id - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .get(`/api/bpmn/statistics/definition/${testDefinitionId}`)
          .expect(401);
      });

      it('GET /api/bpmn/statistics/workspace/:workspaceId - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .get(`/api/bpmn/statistics/workspace/${testWorkspaceId}`)
          .expect(401);
      });
    });

    describe('Messaging', () => {
      it('POST /api/bpmn/message/:messageName - должен вернуть 401', async () => {
        await request(app.getHttpServer())
          .post('/api/bpmn/message/test-message')
          .send({ correlationKey: 'test-key' })
          .expect(401);
      });
    });
  });
});
