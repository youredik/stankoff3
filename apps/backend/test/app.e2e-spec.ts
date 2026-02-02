import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('API E2E Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let testUserId: string;

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
  });

  describe('Auth Endpoints', () => {
    describe('GET /api/auth/provider', () => {
      it('должен вернуть провайдер аутентификации', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/auth/provider')
          .expect(200);

        expect(response.body).toHaveProperty('provider');
        expect(['local', 'keycloak']).toContain(response.body.provider);
      });
    });

    describe('POST /api/auth/login', () => {
      it('должен вернуть 401 при неверных credentials', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'wrong@email.com', password: 'wrongpassword' })
          .expect(401);
      });
    });

    describe('GET /api/auth/me', () => {
      it('должен вернуть 401 без токена', async () => {
        await request(app.getHttpServer()).get('/api/auth/me').expect(401);
      });
    });
  });

  describe('Users Endpoints', () => {
    describe('GET /api/users', () => {
      it('должен вернуть 401 без авторизации', async () => {
        await request(app.getHttpServer()).get('/api/users').expect(401);
      });
    });
  });

  describe('Workspaces Endpoints', () => {
    describe('GET /api/workspaces', () => {
      it('должен вернуть 401 без авторизации', async () => {
        await request(app.getHttpServer()).get('/api/workspaces').expect(401);
      });
    });
  });

  describe('Entities Endpoints', () => {
    describe('GET /api/entities', () => {
      it('должен вернуть 401 без авторизации', async () => {
        await request(app.getHttpServer()).get('/api/entities').expect(401);
      });
    });
  });

  describe('Health Check', () => {
    describe('GET /api/health', () => {
      it('должен вернуть статус здоровья приложения', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/health')
          .expect(200);

        expect(response.body).toHaveProperty('status', 'ok');
        expect(response.body).toHaveProperty('timestamp');
      });
    });
  });
});
