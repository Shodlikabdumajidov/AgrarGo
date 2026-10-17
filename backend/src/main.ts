import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOADS_DIR } from './profile/profile.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Yuklangan avatarlar: /uploads/avatars/<fayl>. Papka ro'yxati ko'rsatilmaydi, faqat aniq fayl nomi bilan olinadi
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads', index: false, dotfiles: 'deny' });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
