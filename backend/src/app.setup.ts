import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { APP_ENV } from './config/app-env.module';
import { buildCorsOptions } from './config/cors';
import { AppEnv, envWarnings } from './config/env.validation';
import { UPLOADS_DIR } from './profile/profile.service';

/** main.ts va e2e testlar uchun umumiy sozlamalar: sinovlar productionga aynan o'xshash ishlaydi. */
export function configureApp(app: NestExpressApplication) {
  const env = app.get<AppEnv>(APP_ENV);
  const production = env.NODE_ENV === 'production';

  // Proksi ortida haqiqiy mijoz IP'sini olish (rate-limit uchun muhim)
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  // Static fayllardan oldin: avatarlar ham xavfsizlik sarlavhalari bilan beriladi.
  // Rasmlarni boshqa domendagi frontend ko'rishi uchun cross-origin ruxsat beriladi.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors(buildCorsOptions(env.CORS_ORIGINS, production));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads', index: false, dotfiles: 'deny' });
  app.enableShutdownHooks();

  const logger = new Logger('Config');
  for (const w of envWarnings(env)) logger.warn(w);
}
