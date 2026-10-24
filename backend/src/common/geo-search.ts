import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

const num = ({ value }: { value: unknown }) => (value === '' || value === undefined || value === null ? undefined : Number(value));

/** Ommaviy radiusli qidiruv parametrlari: lat, lng va radiusKm birgalikda beriladi */
export class RadiusQuery {
  @IsOptional() @Transform(num) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @Transform(num) @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @Transform(num) @IsNumber() @Min(1) @Max(500) radiusKm?: number;
}

export interface Radius { lat: number; lng: number; radiusKm: number }

export function parseRadius(q: RadiusQuery): Radius | null {
  const given = [q.lat, q.lng, q.radiusKm].filter((v) => v !== undefined).length;
  if (given === 0) return null;
  if (given < 3) throw new BadRequestException('Radiusli qidiruv uchun lat, lng va radiusKm birgalikda yuborilishi kerak');
  return { lat: q.lat!, lng: q.lng!, radiusKm: q.radiusKm! };
}

/** Haversine masofasi (km) SQL ifodasi; ustunlar NULL bo'lsa natija NULL */
export const haversineSql = (latCol: string, lngCol: string, lat: number, lng: number) =>
  Prisma.sql`(2 * 6371 * asin(sqrt(least(1, power(sin(radians(${Prisma.raw(latCol)} - ${lat}) / 2), 2) + cos(radians(${lat})) * cos(radians(${Prisma.raw(latCol)})) * power(sin(radians(${Prisma.raw(lngCol)} - ${lng}) / 2), 2)))))`;

/** Bounding box oldindan filtri (indeksga mos): radius atrofidagi kvadrat */
export function boundingBox(r: Radius) {
  const dLat = r.radiusKm / 111.32;
  const dLng = r.radiusKm / (111.32 * Math.max(0.01, Math.cos((r.lat * Math.PI) / 180)));
  return { minLat: r.lat - dLat, maxLat: r.lat + dLat, minLng: r.lng - dLng, maxLng: r.lng + dLng };
}

/**
 * `table` jadvalidan radius ichidagi id'larni masofa bo'yicha tartiblab qaytaradi.
 * Avval bounding box, so'ng aniq Haversine bilan saralanadi (xom SQL, parametrlar bog'langan).
 */
export async function idsWithinRadius(
  db: { $queryRaw<T = unknown>(q: Prisma.Sql): Promise<T> },
  table: 'DriverPost' | 'Shipment',
  r: Radius,
  latCol: string,
  lngCol: string,
  extraWhere: Prisma.Sql = Prisma.sql`TRUE`,
): Promise<{ id: string; distanceKm: number }[]> {
  const b = boundingBox(r);
  const dist = haversineSql(`"${latCol}"`, `"${lngCol}"`, r.lat, r.lng);
  const rows = await db.$queryRaw<{ id: string; distanceKm: number }[]>(Prisma.sql`
    SELECT id, ${dist} AS "distanceKm" FROM ${Prisma.raw(`"${table}"`)}
    WHERE ${extraWhere}
      AND ${Prisma.raw(`"${latCol}"`)} BETWEEN ${b.minLat} AND ${b.maxLat}
      AND ${Prisma.raw(`"${lngCol}"`)} BETWEEN ${b.minLng} AND ${b.maxLng}
      AND ${dist} <= ${r.radiusKm}
    ORDER BY "distanceKm" ASC LIMIT 500`);
  return rows.map((x) => ({ id: x.id, distanceKm: Math.round(Number(x.distanceKm) * 10) / 10 }));
}
