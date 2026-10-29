import ExcelJS from 'exceljs';
import {
  BOS_RENK,
  Branch,
  Employee,
  EmployeeMonthRow,
  GUN_KOD,
  KOD_RENK,
  Month,
  Profile,
  SEKIL_ETIKET,
  Shift,
  subeAyari,
} from './types';
import { ayBasligi, GUN_KISA, gunIndeksi, haftaBasi, iso } from './dates';
import { aktifGun, getShift, haftaKaydiVar, shiftMap } from './calc';

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
const dolgu = (hex: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: argb(hex) },
});
const ince: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFCCCCCC' } };
const cerceve: Partial<ExcelJS.Borders> = { top: ince, left: ince, bottom: ince, right: ince };
const yuvarla = (n: number) => Math.round(n * 100) / 100;

const ayGunleri = (ay: string): string[] => {
  const y = Number(ay.slice(0, 4));
  const m = Number(ay.slice(5, 7));
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => iso(new Date(y, m - 1, i + 1)));
};

const durumMetni = (month: Month | null) =>
  month?.durum === 'kesin' ? 'Kesin' : month?.durum === 'onayli' ? 'Onaylı' : 'Açık';

function puantajSayfasi(
  wb: ExcelJS.Workbook,
  branch: Branch,
  ay: string,
  rows: EmployeeMonthRow[],
  month: Month | null,
  profile: Profile | null
) {
  const ws = wb.addWorksheet('Puantaj');
  const ayar = subeAyari(branch, ay);
  ws.addRow(['Mesai Çizelgesi - Puantaj']).font = { bold: true, size: 14 };
  ws.addRow(['Şube', branch.ad]);
  ws.addRow(['Ay', ayBasligi(ay)]);
  ws.addRow(['Durum', durumMetni(month)]);
  ws.addRow(['Günlük saat', Number(ayar.gunluk_saat)]);
  ws.addRow(['Haftalık saat', Number(ayar.haftalik_saat)]);
  ws.addRow(['Hazırlayan', profile?.ad_soyad ?? '']);
  ws.addRow(['Oluşturma', new Date().toLocaleString('tr-TR')]);
  ws.addRow([]);

  const baslik = ws.addRow([
    'Personel',
    'Görev',
    'Çalışma şekli',
    'Çalışılan gün',
    'Toplam saat',
    'Fazla mesai',
    'Haftalık izin',
    'Rapor',
    'Bayram',
    'Yıllık izin',
    'Ücretsiz izin',
    'Part boş',
  ]);
  baslik.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = dolgu('#1f5e55');
    c.border = cerceve;
  });

  let gun = 0;
  let saat = 0;
  let fm = 0;
  for (const r of rows) {
    gun += r.calisilanGun;
    saat += r.toplamSaat;
    fm += r.fazlaMesai;
    const row = ws.addRow([
      r.employee.ad_soyad,
      r.employee.gorev ?? '',
      SEKIL_ETIKET[r.employee.calisma_sekli],
      r.calisilanGun,
      yuvarla(r.toplamSaat),
      yuvarla(r.fazlaMesai),
      r.izinGun,
      r.raporGun,
      r.bayramGun,
      r.yillikGun,
      r.ucretsizGun,
      r.partBosGun,
    ]);
    row.eachCell((c) => (c.border = cerceve));
  }
  const top = ws.addRow(['TOPLAM', '', '', gun, yuvarla(saat), yuvarla(fm)]);
  top.font = { bold: true };

  ws.columns = [26, 12, 13, 13, 12, 12, 12, 9, 9, 11, 13, 10].map((w) => ({ width: w }));
}

function cizelgeSayfasi(
  wb: ExcelJS.Workbook,
  ay: string,
  employees: Employee[],
  shifts: Shift[]
) {
  const ws = wb.addWorksheet('Günlük çizelge');
  const gunler = ayGunleri(ay);
  const map = shiftMap(shifts);

  const ust = ws.addRow(['Personel', ...gunler.map((g) => Number(g.slice(8, 10)))]);
  const alt = ws.addRow(['', ...gunler.map((g) => GUN_KISA[gunIndeksi(g)])]);
  [ust, alt].forEach((r) =>
    r.eachCell((c) => {
      c.font = { bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = dolgu('#eef2f1');
      c.border = cerceve;
    })
  );

  const kisiler = employees.filter((e) => gunler.some((g) => aktifGun(e, g)));
  for (const e of kisiler) {
    const row = ws.addRow([e.ad_soyad]);
    row.getCell(1).border = cerceve;
    gunler.forEach((tarih, i) => {
      const c = row.getCell(i + 2);
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = cerceve;
      c.font = { size: 9 };
      if (!aktifGun(e, tarih)) {
        c.fill = dolgu('#d9d9d9');
        return;
      }
      const s = getShift(map, e.id, tarih);
      if (!s) {
        if (haftaKaydiVar(e.id, haftaBasi(tarih), map)) c.fill = dolgu(BOS_RENK);
        return;
      }
      if (s.tip === 'vardiya') {
        c.value = `${s.baslangic?.slice(0, 5) ?? ''}\n${s.bitis?.slice(0, 5) ?? ''}`;
        return;
      }
      const [zemin, yazi] = KOD_RENK[s.tip];
      c.value = GUN_KOD[s.tip];
      c.fill = dolgu(zemin);
      c.font = { size: 9, bold: true, color: { argb: argb(yazi) } };
    });
    row.height = 30;
  }

  ws.addRow([]);
  const aciklama = ws.addRow(['Kodlar']);
  aciklama.font = { bold: true };
  (Object.keys(KOD_RENK) as Array<keyof typeof KOD_RENK>).forEach((tip) => {
    const r = ws.addRow([GUN_KOD[tip]]);
    const [zemin, yazi] = KOD_RENK[tip];
    r.getCell(1).fill = dolgu(zemin);
    r.getCell(1).font = { bold: true, color: { argb: argb(yazi) } };
    r.getCell(2).value = tip.replace('_', ' ');
  });
  const bos = ws.addRow(['Boş']);
  bos.getCell(1).fill = dolgu(BOS_RENK);
  bos.getCell(2).value = 'Kaydı olan haftada doldurulmamış gün';

  ws.columns = [{ width: 24 }, ...gunler.map(() => ({ width: 6.5 }))];
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
}

/** Aylık puantajı ve renkli günlük çizelgeyi .xlsx olarak indirir. */
export const puantajExcelIndir = async (
  branch: Branch,
  ay: string,
  rows: EmployeeMonthRow[],
  month: Month | null,
  profile: Profile | null,
  employees: Employee[],
  shifts: Shift[]
) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mesai Çizelgesi - Puantaj';
  puantajSayfasi(wb, branch, ay, rows, month, profile);
  cizelgeSayfasi(wb, ay, employees, shifts);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `puantaj-${branch.ad.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${ay.slice(0, 7)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
