import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
  });

  // Глобальная валидация
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // Глобальный префикс для API
  app.setGlobalPrefix('api');

  const port = process.env.BACKEND_PORT || 3001;
  await app.listen(port);

  console.log(`🚀 Backend запущен на http://localhost:${port}`);
  console.log(`📊 API доступен по адресу http://localhost:${port}/api`);
}

bootstrap();
