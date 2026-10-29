export type Rol = 'isveren' | 'bolge' | 'sube';
export type HaftaDurum = 'acik' | 'kapali' | 'onayli';
export type AyDurum = 'acik' | 'onayli' | 'kesin';
export type GunTip =
  | 'vardiya'
  | 'haftalik_izin'
  | 'ucretsiz_izin'
  | 'yillik_izin'
  | 'rapor'
  | 'bayram'
  | 'part_bos';
export type CalismaSekli = 'tam' | 'part' | 'esnaf';
export type Grup = 'M' | 'K' | 'S';
export type Gorev = 'R. Müdür' | 'V. Müdür' | 'Mutfak' | 'Kurye' | 'Esnaf Kurye';

export const ROL_ETIKET: Record<Rol, string> = {
  isveren: 'İşveren',
  bolge: 'Bölge müdürü',
  sube: 'Şube müdürü',
};

export const HAFTA_ETIKET: Record<HaftaDurum, string> = {
  acik: 'Açık',
  kapali: 'Kapalı',
  onayli: 'Onaylı',
};

export const AY_ETIKET: Record<AyDurum, string> = {
  acik: 'Açık',
  onayli: 'Onaylı',
  kesin: 'Kesin',
};

/** Eski sistemdeki kodlarla birebir: HT, UI, YI, R, B, CG. */
export const GUN_KOD: Record<GunTip, string> = {
  vardiya: '',
  haftalik_izin: 'HT',
  ucretsiz_izin: 'UI',
  yillik_izin: 'YI',
  rapor: 'R',
  bayram: 'B',
  part_bos: 'CG',
};

export const GUN_TIP_ETIKET: Record<GunTip, string> = {
  vardiya: 'Vardiya',
  haftalik_izin: 'Haftalık izin',
  ucretsiz_izin: 'Ücretsiz izin',
  yillik_izin: 'Yıllık izin',
  rapor: 'Rapor',
  bayram: 'Bayram',
  part_bos: 'Part boş',
};

export const GUN_TIP_KISA: Record<GunTip, string> = {
  vardiya: 'Vardiya',
  haftalik_izin: 'İZİN',
  ucretsiz_izin: 'ÜCR. İZİN',
  yillik_izin: 'YILLIK',
  rapor: 'RAPOR',
  bayram: 'BAYR.',
  part_bos: 'PART BOŞ',
};

/** Excel'deki koşullu biçim renkleri: [zemin, yazı] — eski sistemle aynı. */
export const KOD_RENK: Record<Exclude<GunTip, 'vardiya'>, [string, string]> = {
  haftalik_izin: ['#1c1c1c', '#ffffff'],
  rapor: ['#c6e3ab', '#24401a'],
  ucretsiz_izin: ['#1f3864', '#ffffff'],
  yillik_izin: ['#4f6a2a', '#ffffff'],
  bayram: ['#e9edf3', '#33415a'],
  part_bos: ['#e01e1e', '#ffffff'],
};
/** Kaydı olan haftada boş kalan gün. */
export const BOS_RENK = '#fde2e2';

/** Hızlı kod butonlarında gösterilen sıra (Part boş yalnızca part personelde). */
export const HIZLI_KODLAR: Array<Exclude<GunTip, 'vardiya'>> = [
  'haftalik_izin',
  'rapor',
  'ucretsiz_izin',
  'yillik_izin',
  'bayram',
  'part_bos',
];

/** Vardiya dışı günlerde "çalışılmış sayılan" tipler (fazla mesai formülü). */
export const SAYILAN_BOS_TIPLER: GunTip[] = ['yillik_izin', 'rapor', 'bayram'];

export const GOREVLER: Array<{ ad: Gorev; grup: Grup; sekil?: CalismaSekli }> = [
  { ad: 'R. Müdür', grup: 'M' },
  { ad: 'V. Müdür', grup: 'M' },
  { ad: 'Mutfak', grup: 'K' },
  { ad: 'Kurye', grup: 'S' },
  { ad: 'Esnaf Kurye', grup: 'S', sekil: 'esnaf' },
];

export const GRUP_ETIKET: Record<Grup, string> = { M: 'Müdür', K: 'Mutfak', S: 'Kurye' };
export const GRUP_SIRA: Grup[] = ['M', 'K', 'S'];

export const SEKIL_ETIKET: Record<CalismaSekli, string> = {
  tam: 'Tam',
  part: 'Part',
  esnaf: 'Esnaf kurye',
};

export interface Profile {
  id: string;
  kullanici_adi: string;
  ad_soyad: string;
  rol: Rol;
  aktif: boolean;
  sifre_degistirmeli: boolean;
}

export interface BranchAyar {
  gunluk_saat: number;
  haftalik_saat: number;
  fm_donem: 'hafta' | 'takvim';
  fm_yontem: 'sabit' | 'yuzde';
  fm_ucret: number;
}

export interface Branch extends BranchAyar {
  id: string;
  ad: string;
  acilis: string;
  kapanis: string;
  aktif: boolean;
  /** {"2026-11": {...}} = o aydan itibaren geçerli ayarlar */
  ayar_gecmis: Record<string, BranchAyar>;
}

export interface Employee {
  id: string;
  branch_id: string;
  ad_soyad: string;
  calisma_sekli: CalismaSekli;
  gorev: Gorev;
  grup: Grup;
  sgk_var: boolean;
  sgk_branch_id: string | null;
  /** SGK girişi */
  ise_giris: string;
  /** Fiili başlama (deneme dahil); girişten önceyse çizelgede bu tarihten görünür */
  baslama: string | null;
  isten_cikis: string | null;
  sira: number | null;
}

export interface EmployeePrivate {
  employee_id: string;
  tc: string | null;
  iban: string | null;
  iban_eski: string | null;
  iban_degisim: string | null;
  /** Esnaf kurye paket başı ücret (₺) — ücret bilgisi, yalnızca işveren ve bölge müdürü */
  paket_ucret: number | null;
}

export interface Shift {
  employee_id: string;
  tarih: string;
  branch_id: string;
  tip: GunTip;
  baslangic: string | null;
  bitis: string | null;
  saat: number | null;
}

export interface Week {
  branch_id: string;
  hafta_baslangic: string;
  durum: HaftaDurum;
  kapatan: string | null;
  kapatma_zamani: string | null;
  onaylayan: string | null;
  onay_zamani: string | null;
  geri_not: string | null;
}

export interface Month {
  branch_id: string;
  ay: string;
  durum: AyDurum;
  onaylayan: string | null;
  onay_zamani: string | null;
  kesin_yapan: string | null;
  kesin_zamani: string | null;
  geri_not: string | null;
  kesin_sonuc: KesinSonuc | null;
}

export interface KesinSonuc {
  ay: string;
  satirlar: Array<{
    employee_id: string;
    ad_soyad: string;
    calisilan_gun: number;
    toplam_saat: number;
    fazla_mesai: number;
    izin: number;
    rapor: number;
    bayram: number;
  }>;
}

export interface AuditEntry {
  id: number;
  zaman: string;
  kullanici: string | null;
  branch_id: string | null;
  islem: string;
  detay: Record<string, unknown> | null;
}

export interface EmployeeMonthRow {
  employee: Employee;
  calisilanGun: number;
  toplamSaat: number;
  fazlaMesai: number;
  izinGun: number;
  raporGun: number;
  bayramGun: number;
  ucretsizGun: number;
  yillikGun: number;
  partBosGun: number;
}

/** Fiili ilk çalışma günü: başlama girişten önceyse başlama, değilse SGK girişi. */
export const ilkGun = (e: Employee): string =>
  e.baslama && e.baslama < e.ise_giris ? e.baslama : e.ise_giris;

/** Şubenin verilen aydaki geçerli ayarı (ayar geçmişinden). */
export const subeAyari = (b: Branch, ay: string): BranchAyar => {
  const ak = ay.slice(0, 7);
  const g = b.ayar_gecmis ?? {};
  const k = Object.keys(g)
    .filter((x) => x <= ak)
    .sort()
    .pop();
  const base: BranchAyar = {
    gunluk_saat: Number(b.gunluk_saat),
    haftalik_saat: Number(b.haftalik_saat),
    fm_donem: b.fm_donem,
    fm_yontem: b.fm_yontem,
    fm_ucret: Number(b.fm_ucret),
  };
  if (!k) return base;
  const r = g[k];
  return {
    gunluk_saat: Number(r.gunluk_saat),
    haftalik_saat: Number(r.haftalik_saat),
    fm_donem: r.fm_donem,
    fm_yontem: r.fm_yontem,
    fm_ucret: Number(r.fm_ucret),
  };
};

export const siralaPersonel = (list: Employee[]): Employee[] =>
  list
    .slice()
    .sort(
      (a, b) =>
        GRUP_SIRA.indexOf(a.grup) - GRUP_SIRA.indexOf(b.grup) ||
        (a.sira ?? 999) - (b.sira ?? 999) ||
        a.ad_soyad.localeCompare(b.ad_soyad, 'tr')
    );
