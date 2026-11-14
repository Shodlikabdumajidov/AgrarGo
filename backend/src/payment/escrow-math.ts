import { Prisma } from '@prisma/client';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const part = (v: Prisma.Decimal.Value, num: number, den: number) => D(v).mul(num).div(den).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export type DeliveryPolicy = 'KEEP' | 'PRORATE';

export interface DamageInput {
  amount: Prisma.Decimal.Value; // mahsulot summasi (fermerga tegishli)
  deliveryFee: Prisma.Decimal.Value;
  serviceFee: Prisma.Decimal.Value;
  feeAmount: Prisma.Decimal.Value; // omborxona xizmat haqi (mahsulot summasi ichida)
  cashbackUsed: Prisma.Decimal.Value;
  isLocal: boolean;
}

/**
 * Ziyon (OS&D) bo'yicha escrow qayta hisoblash: "50 ta qutidan 5 tasi yaroqsiz" -> mahsulot summasining 5/50 qismi xaridorga qaytadi,
 * fermerga qolgan 45/50 qismi tushadi.
 *  - yo'l haqi: PRORATE bo'lsa shu nisbatda qirqiladi (yuk hali tashilmagan), KEEP bo'lsa haydovchi to'liq oladi (yo'l bosib o'tilgan)
 *  - platforma komissiyasi: faqat tashqi (bron/ombor) to'lovlarda va keshbeksiz bo'lsa nisbatan qirqiladi; chakana buyurtmada Hub/platforma haqlari o'zgarmaydi
 *  - tiyingacha yaxlitlanadi; qaytariladigan jami = mahsulot + yo'l haqi + komissiya qismi
 */
export function damageRefund(i: DamageInput, damagedBoxes: number, totalBoxes: number, policy: DeliveryPolicy) {
  if (!Number.isInteger(damagedBoxes) || !Number.isInteger(totalBoxes) || damagedBoxes < 1 || totalBoxes < 2 || damagedBoxes >= totalBoxes) {
    throw new RangeError("Yaroqsiz qutilar soni 1 dan jami qutilar sonidan kam bo'lishi kerak");
  }
  const goods = part(i.amount, damagedBoxes, totalBoxes);
  const delivery = policy === 'PRORATE' && !i.isLocal ? part(i.deliveryFee, damagedBoxes, totalBoxes) : D(0);
  const service = !i.isLocal && D(i.cashbackUsed).lte(0) ? part(i.serviceFee, damagedBoxes, totalBoxes) : D(0);
  const fee = D(i.feeAmount).gt(0) ? part(i.feeAmount, damagedBoxes, totalBoxes) : D(0);
  return { goods, delivery, service, fee, refund: goods.add(delivery).add(service) };
}

/**
 * Qadoqlash (PaaS) haqini fermer ulushidan ushlab qolish: har bir topshirish bo'yicha qolgan qarz (haq - allaqachon ushlangan) navbat bilan,
 * fermer ulushidan oshmaydigan miqdorda. Natija: har bir topshirishdan ushlangan summa.
 */
export function packagingDeductions(farmerShare: Prisma.Decimal.Value, dues: { id: string; due: Prisma.Decimal.Value }[]) {
  let room = D(farmerShare);
  const out: { id: string; take: Prisma.Decimal }[] = [];
  for (const d of dues) {
    if (room.lte(0)) break;
    const take = Prisma.Decimal.min(room, D(d.due));
    if (take.gt(0)) { out.push({ id: d.id, take }); room = room.sub(take); }
  }
  return { items: out, total: out.reduce((a, x) => a.add(x.take), D(0)) };
}
