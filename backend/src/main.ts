import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_ENV } from './config/app-env.module';
import { AppEnv, validateEnv } from './config/env.validation';
import { autoMigrate } from './prisma/auto-migrate';

async function bootstrap() {
  // Migratsiyalar server ko'tarilishidan oldin qo'llanadi (yangi ustun/jadval yo'qligidan 500 xato bo'lmasligi uchun)
  try { await autoMigrate(validateEnv(process.env)); } catch { /* validateEnv xatosini NestFactory aniq ko'rsatadi */ }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  // YANGI:
await app.listen(app.get<AppEnv>(APP_ENV).PORT, '0.0.0.0');
}
bootstrap();
