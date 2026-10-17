import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Production: faqat CORS_ORIGINS ro'yxatidagi manzillar. Ro'yxatda bo'lmagan origin uchun CORS sarlavhalari
 * qo'yilmaydi, brauzer javobni bloklaydi. Origin sarlavhasi yo'q so'rovlar (curl, server-server) CORS'ga tegishli emas.
 * Development: ro'yxat bo'sh bo'lsa hamma manzilga ruxsat (file:// va localhost sinovlari uchun).
 */
export function buildCorsOptions(origins: string[], production: boolean): CorsOptions {
  const base: CorsOptions = {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Retry-After'],
    credentials: false, // JWT Authorization sarlavhasida; cookie ishlatilmaydi
    maxAge: 600,
  };
  if (!production && origins.length === 0) return { ...base, origin: true };

  const allowed = new Set(origins);
  return {
    ...base,
    origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
  };
}
