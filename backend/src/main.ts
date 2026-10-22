import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_ENV } from './config/app-env.module';
import { AppEnv } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  // YANGI:
await app.listen(app.get<AppEnv>(APP_ENV).PORT, '0.0.0.0');
}
bootstrap();
