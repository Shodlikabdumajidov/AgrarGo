/** Ulgurji va dehqon bozorlari (viloyat bo'yicha). Narx kiritishda faqat shu ro'yxatdagi nomlar qabul qilinadi. */
export const MARKET_GROUPS: { region: string; markets: string[] }[] = [
  { region: 'Toshkent', markets: ['Toshkent Food City', "Qo'yliq dehqon bozori", 'Chorsu dehqon bozori'] },
  { region: 'Samarqand', markets: ['Samarqand Siyob dehqon bozori', 'Samarqand ulgurji savdo bazasi', "Samarqand Temiryo'l dehqon bozori"] },
  { region: 'Jizzax', markets: ["Jizzax Markaziy dehqon bozori (Ko'k bozor)", 'Jizzax Eski shahar dehqon bozori'] },
];
export const MARKET_NAMES = MARKET_GROUPS.flatMap((g) => g.markets);
