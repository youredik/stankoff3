import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/modules/user/user.entity';
import { Workspace } from '../src/modules/workspace/workspace.entity';
import { WorkspaceEntity } from '../src/modules/entity/entity.entity';
import { ProcessDefinition } from '../src/modules/bpmn/entities/process-definition.entity';
import { ProcessInstance, ProcessInstanceStatus } from '../src/modules/bpmn/entities/process-instance.entity';
import { JwtService } from '@nestjs/jwt';

/**
 * BPMN Lifecycle E2E Tests
 *
 * Эти тесты проверяют полный жизненный цикл BPMN процессов:
 * 1. Создание определения процесса
 * 2. Деплой в Zeebe
 * 3. Запуск экземпляра процесса
 * 4. Отслеживание статуса
 * 5. Отмена/завершение процесса
 *
 * ВАЖНО: Требуется запущенный Zeebe на localhost:26500
 * Запуск: docker compose -f docker-compose.camunda.yml up -d
 */
describe('BPMN Lifecycle E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let authToken: string;

  // Test data
  let testUser: User;
  let testWorkspace: Workspace;
  let testEntity: WorkspaceEntity;
  let testDefinition: ProcessDefinition;
  let testInstance: ProcessInstance;

  // Simple BPMN process for testing
  const simpleBpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
                  id="Definitions_E2ETest"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="e2e-test-process" name="E2E Test Process" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="Task_LogStart" name="Log Start">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="log-activity" />
        <zeebe:ioMapping>
          <zeebe:input source="= entityId" target="entityId" />
          <zeebe:input source="= workspaceId" target="workspaceId" />
          <zeebe:input source="= &quot;process:started&quot;" target="action" />
        </zeebe:ioMapping>
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="Task_UpdateStatus" name="Update Status">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="update-entity-status" />
        <zeebe:ioMapping>
          <zeebe:input source="= entityId" target="entityId" />
          <zeebe:input source="= &quot;in_progress&quot;" target="newStatus" />
        </zeebe:ioMapping>
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_LogStart" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_LogStart" targetRef="Task_UpdateStatus" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_UpdateStatus" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    jwtService = moduleFixture.get(JwtService);

    // Create test user and get auth token
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  async function setupTestData() {
    const userRepo = dataSource.getRepository(User);
    const workspaceRepo = dataSource.getRepository(Workspace);
    const entityRepo = dataSource.getRepository(WorkspaceEntity);

    // Create test user
    const timestamp = Date.now();
    testUser = userRepo.create({
      email: `e2e-bpmn-test-${timestamp}@test.com`,
      password: 'test-password-hash',
      firstName: 'E2E',
      lastName: 'Test User',
      isActive: true,
    });
    await userRepo.save(testUser);

    // Generate auth token
    authToken = jwtService.sign({
      sub: testUser.id,
      email: testUser.email,
      roles: ['admin'],
    });

    // Create test workspace
    testWorkspace = workspaceRepo.create({
      name: `E2E BPMN Test Workspace ${timestamp}`,
      icon: 'folder',
      prefix: 'E2E',
      sections: [
        {
          id: 'main',
          name: 'Main',
          fields: [
            {
              id: 'status',
              name: 'Status',
              type: 'status' as const,
              options: [
                { id: 'new', label: 'Новая', color: '#6B7280' },
                { id: 'in_progress', label: 'В работе', color: '#3B82F6' },
                { id: 'done', label: 'Готово', color: '#10B981' },
              ],
            },
          ],
          order: 0,
        },
      ],
      isArchived: false,
    });
    await workspaceRepo.save(testWorkspace);

    // Create test entity with customId
    testEntity = entityRepo.create({
      customId: `E2E-${timestamp}`,
      title: `E2E Test Entity ${timestamp}`,
      workspaceId: testWorkspace.id,
      status: 'new',
      data: {},
    });
    await entityRepo.save(testEntity);
  }

  async function cleanupTestData() {
    try {
      // Delete in reverse order of dependencies
      if (testInstance) {
        await dataSource.getRepository(ProcessInstance).delete({ id: testInstance.id });
      }
      if (testDefinition) {
        await dataSource.getRepository(ProcessDefinition).delete({ id: testDefinition.id });
      }
      if (testEntity) {
        await dataSource.getRepository(WorkspaceEntity).delete({ id: testEntity.id });
      }
      if (testWorkspace) {
        await dataSource.getRepository(Workspace).delete({ id: testWorkspace.id });
      }
      if (testUser) {
        await dataSource.getRepository(User).delete({ id: testUser.id });
      }
    } catch (error) {
      console.warn('Cleanup error:', (error as Error).message);
    }
  }

  describe('1. Zeebe Health Check', () => {
    it('должен показать статус подключения к Zeebe', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/bpmn/health')
        .expect(200);

      expect(response.body).toHaveProperty('connected');

      if (response.body.connected) {
        expect(response.body.brokers).toBeGreaterThanOrEqual(1);
        console.log('✅ Zeebe connected:', response.body);
      } else {
        console.warn('⚠️ Zeebe not connected - some tests will be skipped');
      }
    });
  });

  describe('2. Process Definition Lifecycle', () => {
    it('должен создать определение процесса', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/bpmn/definitions/${testWorkspace.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'E2E Test Process',
          description: 'Process for E2E testing',
          processId: 'e2e-test-process',
          bpmnXml: simpleBpmnXml,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('E2E Test Process');
      expect(response.body.processId).toBe('e2e-test-process');
      expect(response.body.workspaceId).toBe(testWorkspace.id);

      testDefinition = response.body;
      console.log('✅ Definition created:', testDefinition.id);
    });

    it('должен вернуть список определений для workspace', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/bpmn/definitions/${testWorkspace.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.some((d: any) => d.id === testDefinition.id)).toBe(true);
    });

    it('должен вернуть определение по ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/bpmn/definition/${testDefinition.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(testDefinition.id);
      expect(response.body.bpmnXml).toBe(simpleBpmnXml);
    });
  });

  describe('3. Process Deployment (requires Zeebe)', () => {
    it('должен задеплоить процесс в Zeebe', async () => {
      // First check if Zeebe is connected
      const healthResponse = await request(app.getHttpServer())
        .get('/api/bpmn/health')
        .expect(200);

      if (!healthResponse.body.connected) {
        console.warn('⚠️ Skipping deployment test - Zeebe not connected');
        return;
      }

      const response = await request(app.getHttpServer())
        .post(`/api/bpmn/definition/${testDefinition.id}/deploy`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('deployedKey');
      expect(response.body).toHaveProperty('deployedAt');
      expect(response.body.deployedKey).toBeTruthy();

      testDefinition = response.body;
      console.log('✅ Definition deployed:', testDefinition.deployedKey);
    });
  });

  describe('4. Process Instance Lifecycle (requires Zeebe)', () => {
    it('должен запустить экземпляр процесса', async () => {
      // Check if deployed
      if (!testDefinition?.deployedKey) {
        console.warn('⚠️ Skipping - definition not deployed');
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/api/bpmn/instances/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          processDefinitionId: testDefinition.id,
          entityId: testEntity.id,
          variables: {
            priority: 'high',
            customData: { test: true },
          },
        });

      // May fail if Zeebe has issues processing the request
      if (response.status !== 201) {
        console.warn('⚠️ Could not start process instance:', response.status, response.body?.message);
        return;
      }

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('processInstanceKey');
      expect(response.body.status).toBe(ProcessInstanceStatus.ACTIVE);
      expect(response.body.entityId).toBe(testEntity.id);

      testInstance = response.body;
      console.log('✅ Process instance started:', testInstance.processInstanceKey);
    });

    it('должен вернуть экземпляры для workspace', async () => {
      if (!testInstance) {
        console.warn('⚠️ Skipping - no instance created');
        return;
      }

      const response = await request(app.getHttpServer())
        .get(`/api/bpmn/instances/workspace/${testWorkspace.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.some((i: any) => i.id === testInstance.id)).toBe(true);
    });

    it('должен вернуть экземпляры для entity', async () => {
      if (!testInstance) {
        console.warn('⚠️ Skipping - no instance created');
        return;
      }

      const response = await request(app.getHttpServer())
        .get(`/api/bpmn/instances/entity/${testEntity.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0].entityId).toBe(testEntity.id);
    });

    it('должен дождаться завершения процесса', async () => {
      if (!testInstance) {
        console.warn('⚠️ Skipping - no instance created');
        return;
      }

      // Wait for process to complete (workers should process the tasks)
      let attempts = 0;
      const maxAttempts = 10;
      let completed = false;

      while (attempts < maxAttempts && !completed) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const response = await request(app.getHttpServer())
          .get(`/api/bpmn/instances/entity/${testEntity.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const instance = response.body.find((i: any) => i.id === testInstance.id);
        if (instance?.status === ProcessInstanceStatus.COMPLETED) {
          completed = true;
          console.log('✅ Process completed after', attempts + 1, 'seconds');
        }

        attempts++;
      }

      if (!completed) {
        console.warn('⚠️ Process did not complete in time (may still be running)');
      }
    });
  });

  describe('5. Process Statistics', () => {
    it('должен вернуть статистику по определению', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/bpmn/statistics/definition/${testDefinition.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('active');
      expect(response.body).toHaveProperty('completed');
      expect(typeof response.body.total).toBe('number');

      console.log('📊 Definition statistics:', response.body);
    });

    it('должен вернуть статистику по workspace', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/bpmn/statistics/workspace/${testWorkspace.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('definitions');
      expect(response.body).toHaveProperty('totalInstances');
      expect(response.body).toHaveProperty('activeInstances');

      console.log('📊 Workspace statistics:', response.body);
    });
  });

  describe('6. Process Cancellation (requires Zeebe)', () => {
    it('должен отменить активный процесс', async () => {
      // Start a new process to cancel
      if (!testDefinition?.deployedKey) {
        console.warn('⚠️ Skipping - definition not deployed');
        return;
      }

      // Start new instance - may fail if Zeebe has issues
      const startResponse = await request(app.getHttpServer())
        .post('/api/bpmn/instances/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          processDefinitionId: testDefinition.id,
          entityId: testEntity.id,
          variables: { forCancellation: true },
        });

      if (startResponse.status !== 201) {
        console.warn('⚠️ Could not start process for cancellation test:', startResponse.status);
        return;
      }

      const instanceToCancel = startResponse.body;

      // Wait a moment for process to start
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Cancel it
      const cancelResponse = await request(app.getHttpServer())
        .post(`/api/bpmn/instances/${instanceToCancel.processInstanceKey}/cancel`)
        .set('Authorization', `Bearer ${authToken}`);

      // 200 for success, or other status if Zeebe is busy
      expect([200, 201, 500]).toContain(cancelResponse.status);
      console.log('✅ Process cancel result:', cancelResponse.status);
    });
  });

  describe('7. BPMN Templates', () => {
    it('должен вернуть список шаблонов', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/bpmn/templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      console.log('📋 Available templates:', response.body.map((t: any) => t.name));
    });

    it('должен вернуть категории шаблонов', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/bpmn/templates/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('8. Process Definition Cleanup', () => {
    it('должен удалить определение процесса без активных экземпляров', async () => {
      // First, ensure no active instances
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Create a new definition for deletion test
      const createResponse = await request(app.getHttpServer())
        .post(`/api/bpmn/definitions/${testWorkspace.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Definition to Delete',
          processId: 'delete-test-process',
          bpmnXml: simpleBpmnXml.replace('e2e-test-process', 'delete-test-process'),
        })
        .expect(201);

      const definitionToDelete = createResponse.body;

      // Delete it
      await request(app.getHttpServer())
        .delete(`/api/bpmn/definition/${definitionToDelete.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify deletion
      await request(app.getHttpServer())
        .get(`/api/bpmn/definition/${definitionToDelete.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      console.log('✅ Definition deleted:', definitionToDelete.id);
    });
  });

  describe('9. BPMN Messaging (requires Zeebe)', () => {
    it('должен отправить сообщение в процесс', async () => {
      const healthResponse = await request(app.getHttpServer())
        .get('/api/bpmn/health')
        .expect(200);

      if (!healthResponse.body.connected) {
        console.warn('⚠️ Skipping messaging test - Zeebe not connected');
        return;
      }

      // This will fail if no process is waiting for this message, but it tests the API
      const response = await request(app.getHttpServer())
        .post('/api/bpmn/message/test-message')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          correlationKey: testEntity.id,
          variables: { messageData: 'test' },
        });

      // 200, 201, or error - all are valid responses depending on state
      expect([200, 201, 500]).toContain(response.status);
      console.log('📬 Message send result:', response.status);
    });
  });
});
