import ExcelJS from 'exceljs';

export interface Col { header: string; key: string; width?: number; fmt?: 'int' | 'money' | 'date' | 'kg' }
const FMT = { int: '#,##0', money: '#,##0', kg: '#,##0.##', date: 'dd.mm.yyyy hh:mm' };
export const MAX_ROWS = 20000;

/**
 * Excel formula-inyeksiyasidan himoya (CSV/XLSX injection): foydalanuvchi kiritgan matn "=", "+", "-", "@" bilan boshlansa
 * formula sifatida bajarilmasligi uchun oldiga apostrof qo'yiladi.
 */
export function safeCell(v: unknown): unknown {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

export function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AgrarGo';
  wb.created = new Date();
  return wb;
}

export function addSheet(wb: ExcelJS.Workbook, name: string, cols: Col[], data: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18, style: c.fmt ? { numFmt: FMT[c.fmt] } : {} }));
  data.slice(0, MAX_ROWS).forEach((r) => ws.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)]))));
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  if (data.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

export function summarySheet(wb: ExcelJS.Workbook, title: string, lines: [string, string | number][]) {
  const ws = wb.addWorksheet('Xulosa');
  ws.columns = [{ width: 38 }, { width: 28 }];
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 14, color: { argb: 'FF065F46' } };
  ws.mergeCells(1, 1, 1, 2);
  ws.addRow([]);
  lines.forEach(([k, v]) => {
    const r = ws.addRow([k, safeCell(v)]);
    r.getCell(1).font = { bold: true };
    if (typeof v === 'number') r.getCell(2).numFmt = '#,##0.##';
    r.getCell(2).alignment = { horizontal: 'right' };
  });
  return ws;
}

export async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}
