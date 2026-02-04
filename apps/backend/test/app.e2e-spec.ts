import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('API E2E Tests', () => {
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

  describe('Auth Endpoints (Keycloak SSO)', () => {
    describe('GET /api/auth/me', () => {
      it('должен вернуть 401 без токена', async () => {
        await request(app.getHttpServer()).get('/api/auth/me').expect(401);
      });
    });

    describe('POST /api/auth/refresh', () => {
      it('должен вернуть 401 без refresh token cookie', async () => {
        await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
      });
    });

    describe('POST /api/auth/logout', () => {
      it('должен вернуть 401 без авторизации', async () => {
        // Logout endpoint requires authentication
        await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
      });
    });

    describe('GET /api/auth/keycloak/login', () => {
      it('должен вернуть ошибку без настроенного Keycloak', async () => {
        // В тестовом окружении Keycloak не настроен, поэтому ожидаем ошибку
        const response = await request(app.getHttpServer())
          .get('/api/auth/keycloak/login');

        // Может вернуть 500 (Internal Server Error) или 302 (redirect)
        expect([302, 500]).toContain(response.status);
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
