import { ayGunSayisi, gunEkle, haftaBasi, haftaGunleri } from './dates';
import { Branch, Employee, EmployeeMonthRow, Shift, ilkGun, subeAyari } from './types';

export interface HaftaOzet {
  toplamSaat: number;
  calisilanGun: number;
  izinGun: number;
  raporGun: number;
  bayramGun: number;
  ucretsizGun: number;
  yillikGun: number;
  partBosGun: number;
  /** Kaydı olan haftada boş bırakılan gün (eksi mesai) */
  bosGun: number;
  fazlaMesai: number;
  bonus: number;
}

const BOS_OZET: HaftaOzet = {
  toplamSaat: 0,
  calisilanGun: 0,
  izinGun: 0,
  raporGun: 0,
  bayramGun: 0,
  ucretsizGun: 0,
  yillikGun: 0,
  partBosGun: 0,
  bosGun: 0,
  fazlaMesai: 0,
  bonus: 0,
};

const yuvarla = (n: number) => Math.round(n * 100) / 100;
const shiftKey = (employeeId: string, tarih: string) => `${employeeId}|${tarih}`;

export const shiftMap = (shifts: Shift[]): Map<string, Shift> =>
  new Map(shifts.map((s) => [shiftKey(s.employee_id, s.tarih), s]));

export const getShift = (
  map: Map<string, Shift>,
  employeeId: string,
  tarih: string
): Shift | undefined => map.get(shiftKey(employeeId, tarih));

/** Kişi bu tarihte çizelgede görünür mü (fiili başlama/SGK girişi – çıkış). */
export const aktifGun = (employee: Employee, tarih: string): boolean => {
  if (tarih < ilkGun(employee)) return false;
  if (employee.isten_cikis && tarih > employee.isten_cikis) return false;
  return true;
};

/** Haftada en az bir günü dolu mu? Kaydı olmayan hafta fazla mesaiye girmez. */
export const haftaKaydiVar = (employeeId: string, monday: string, map: Map<string, Shift>) =>
  haftaGunleri(monday).some((t) => !!getShift(map, employeeId, t));

/**
 * Eski sistemdeki kural (Excel ile aynı):
 *   FM = çalışılan saat − (vardiya günü + boş gün) × günlük + bonus
 *   bonus = 7 gün de vardiyalıysa 7 × günlük − haftalık
 * İzin/rapor/bayram/yıllık/part boş günleri beklenen gün değildir; boş gün eksi mesai sayılır.
 * Part ve esnaf kuryede fazla mesai yoktur.
 */
export const haftaOzeti = (
  employee: Employee,
  monday: string,
  map: Map<string, Shift>,
  branch: Branch
): HaftaOzet => {
  const ayar = subeAyari(branch, monday);
  const kayit = haftaKaydiVar(employee.id, monday, map);
  const o: HaftaOzet = { ...BOS_OZET };

  for (const tarih of haftaGunleri(monday)) {
    if (!aktifGun(employee, tarih)) continue;
    const s = getShift(map, employee.id, tarih);
    if (!s) {
      if (kayit) o.bosGun += 1;
      continue;
    }
    switch (s.tip) {
      case 'vardiya':
        o.calisilanGun += 1;
        o.toplamSaat += Number(s.saat ?? 0);
        break;
      case 'haftalik_izin':
        o.izinGun += 1;
        break;
      case 'rapor':
        o.raporGun += 1;
        break;
      case 'bayram':
        o.bayramGun += 1;
        break;
      case 'ucretsiz_izin':
        o.ucretsizGun += 1;
        break;
      case 'yillik_izin':
        o.yillikGun += 1;
        break;
      case 'part_bos':
        o.partBosGun += 1;
        break;
    }
  }

  const fmYok = employee.calisma_sekli !== 'tam';
  o.bonus = o.calisilanGun === 7 ? yuvarla(7 * ayar.gunluk_saat - ayar.haftalik_saat) : 0;
  o.toplamSaat = yuvarla(o.toplamSaat);
  o.fazlaMesai =
    !kayit || fmYok
      ? 0
      : yuvarla(o.toplamSaat - (o.calisilanGun + o.bosGun) * ayar.gunluk_saat + o.bonus);
  if (fmYok) o.bonus = 0;
  return o;
};

export const haftaToplami = (ozetler: HaftaOzet[]): HaftaOzet =>
  ozetler.reduce<HaftaOzet>(
    (acc, o) => ({
      toplamSaat: yuvarla(acc.toplamSaat + o.toplamSaat),
      calisilanGun: acc.calisilanGun + o.calisilanGun,
      izinGun: acc.izinGun + o.izinGun,
      raporGun: acc.raporGun + o.raporGun,
      bayramGun: acc.bayramGun + o.bayramGun,
      ucretsizGun: acc.ucretsizGun + o.ucretsizGun,
      yillikGun: acc.yillikGun + o.yillikGun,
      partBosGun: acc.partBosGun + o.partBosGun,
      bosGun: acc.bosGun + o.bosGun,
      fazlaMesai: yuvarla(acc.fazlaMesai + o.fazlaMesai),
      bonus: yuvarla(acc.bonus + o.bonus),
    }),
    { ...BOS_OZET }
  );

export const haftaKadro = (employees: Employee[], monday: string): Employee[] => {
  const gunler = haftaGunleri(monday);
  return employees.filter((e) => gunler.some((g) => aktifGun(e, g)));
};

export interface AyHesaplama {
  satirlar: EmployeeMonthRow[];
  haftaSayisi: number;
}

/**
 * Aylık puantaj. Gün ve saatler takvim ayına göre toplanır;
 * haftalık fazla mesai, Pazartesi'si bu ayda olan haftalardan gelir.
 */
export const aylikPuantaj = (
  employees: Employee[],
  shifts: Shift[],
  branch: Branch,
  ay: string
): AyHesaplama => {
  const map = shiftMap(shifts);
  const ak = ay.slice(0, 7);
  const ayIlk = `${ak}-01`;
  const aySon = `${ak}-${String(ayGunSayisi(ayIlk)).padStart(2, '0')}`;

  const pazartesiler: string[] = [];
  for (let m = haftaBasi(ayIlk); m <= aySon; m = gunEkle(m, 7)) {
    if (m.slice(0, 7) === ak) pazartesiler.push(m);
  }

  const satirlar: EmployeeMonthRow[] = employees
    .filter((e) => ilkGun(e) <= aySon && (!e.isten_cikis || e.isten_cikis >= ayIlk))
    .map((employee) => {
      const row: EmployeeMonthRow = {
        employee,
        calisilanGun: 0,
        toplamSaat: 0,
        fazlaMesai: 0,
        izinGun: 0,
        raporGun: 0,
        bayramGun: 0,
        ucretsizGun: 0,
        yillikGun: 0,
        partBosGun: 0,
      };
      for (const s of shifts) {
        if (s.employee_id !== employee.id || s.tarih < ayIlk || s.tarih > aySon) continue;
        if (s.tip === 'vardiya') {
          row.calisilanGun += 1;
          row.toplamSaat += Number(s.saat ?? 0);
        } else if (s.tip === 'rapor') row.raporGun += 1;
        else if (s.tip === 'bayram') row.bayramGun += 1;
        else if (s.tip === 'ucretsiz_izin') row.ucretsizGun += 1;
        else if (s.tip === 'part_bos') row.partBosGun += 1;
        else if (s.tip === 'yillik_izin') row.yillikGun += 1;
        else row.izinGun += 1;
      }
      row.toplamSaat = yuvarla(row.toplamSaat);
      row.fazlaMesai = yuvarla(
        pazartesiler.reduce((t, m) => t + haftaOzeti(employee, m, map, branch).fazlaMesai, 0)
      );
      return row;
    })
    .sort((a, b) => a.employee.ad_soyad.localeCompare(b.employee.ad_soyad, 'tr'));

  return { satirlar, haftaSayisi: pazartesiler.length };
};

/** Şubede belirtilen haftanın boş hücreleri (kapatma öncesi kontrol). */
export const bosHucreler = (
  employees: Employee[],
  monday: string,
  map: Map<string, Shift>
): Array<{ employee: Employee; tarih: string }> => {
  const misses: Array<{ employee: Employee; tarih: string }> = [];
  for (const e of haftaKadro(employees, monday)) {
    for (const tarih of haftaGunleri(monday)) {
      if (!aktifGun(e, tarih)) continue;
      if (!getShift(map, e.id, tarih)) misses.push({ employee: e, tarih });
    }
  }
  return misses;
};
