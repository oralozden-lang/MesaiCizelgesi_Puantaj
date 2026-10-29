import { addDays, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { tr } from 'date-fns/locale';

/** Türkiye hafta başlangıcı: Pazartesi. */
export const HAFTA_BASLANGICI = 1;

export const GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const GUN_UZUN = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
];

export const iso = (d: Date) => format(d, 'yyyy-MM-dd');
export const parse = (s: string) => parseISO(s);

/** Verilen tarihin (veya ISO metninin) Pazartesi'si. */
export const haftaBasi = (value: Date | string): string => {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return iso(startOfWeek(d, { weekStartsOn: HAFTA_BASLANGICI }));
};

export const ayBasi = (value: Date | string): string => {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return iso(startOfMonth(d));
};

/** Pazartesi'den başlayan 7 günün ISO listesi. */
export const haftaGunleri = (monday: string): string[] =>
  Array.from({ length: 7 }, (_, i) => iso(addDays(parseISO(monday), i)));

/** gün indeksi 0 = Pazartesi */
export const gunIndeksi = (tarih: string): number =>
  (parseISO(tarih).getDay() + 6) % 7;

export const gunEkle = (tarih: string, n: number) =>
  iso(addDays(parseISO(tarih), n));

export const haftaBasligi = (monday: string): string => {
  const start = parseISO(monday);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const left = format(start, sameMonth ? 'd' : 'd MMM', { locale: tr });
  const right = format(end, 'd MMM yyyy', { locale: tr });
  return `${left} – ${right}`;
};

export const ayBasligi = (ay: string): string =>
  format(parseISO(ay), 'MMMM yyyy', { locale: tr });

export const kisaTarih = (tarih: string): string =>
  format(parseISO(tarih), 'd MMM', { locale: tr });

export const uzunTarih = (tarih: string): string =>
  format(parseISO(tarih), 'd MMMM yyyy', { locale: tr });

export const aySonraki = (ay: string, delta: number): string => {
  const d = parseISO(ay);
  return iso(new Date(d.getFullYear(), d.getMonth() + delta, 1));
};

export const ayniAy = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

export const ayGunSayisi = (ay: string): number => {
  const d = parseISO(ay);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

/** "8,5" biçiminde saat gösterimi. */
export const saatMetni = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0$/, '').replace('.', ',');
};

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (total: number): string => {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Şubenin açılış–kapanış aralığında yarım saatlik seçenekler.
 * Kapanıştan 30 dk sonrasına kadar izin verilir; gece devreden saatler mod 24 gösterilir.
 */
export const saatSecenekleri = (acilis: string, kapanis: string): string[] => {
  const start = toMinutes(acilis);
  let end = toMinutes(kapanis);
  if (end <= start) end += 1440;
  const result: string[] = [];
  for (let m = start; m <= end + 30 && result.length < 60; m += 30) {
    const label = fromMinutes(m);
    if (!result.includes(label)) result.push(label);
  }
  return result;
};

export interface SaatSecenek {
  s: string;
  /** Normal aralık dışında kalan pay saatleri (turuncu gösterilir) */
  pay: '' | 'erken' | 'gec';
}

/**
 * Eski sistemle aynı saat listesi: açılış – kapanış + 30 dk, yarım saatlik.
 * Bugün ve geçmiş günlerde iki uçta birer saat pay eklenir.
 */
export const saatListesi = (acilis: string, kapanis: string, payli: boolean): SaatSecenek[] => {
  const n0 = Math.round(toMinutes(acilis) / 30) * 30;
  let kapanisDk = Math.round(toMinutes(kapanis) / 30) * 30;
  if (kapanisDk <= n0) kapanisDk += 1440;
  const n1 = kapanisDk + 30;
  const bas = n0 - (payli ? 60 : 0);
  const son = n1 + (payli ? 60 : 0);
  const out: SaatSecenek[] = [];
  const gorulen = new Set<string>();
  for (let m = bas; m <= son; m += 30) {
    const s = fromMinutes(m);
    if (gorulen.has(s)) continue;
    gorulen.add(s);
    out.push({ s, pay: m < n0 ? 'erken' : m > n1 ? 'gec' : '' });
  }
  return out;
};

export const bugunVeyaGecmis = (tarih: string): boolean => tarih <= iso(new Date());

/** Gece vardiyasını hesaba katan süre (saat). */
export const vardiyaSuresi = (baslangic: string, bitis: string): number => {
  let diff = toMinutes(bitis) - toMinutes(baslangic);
  if (diff <= 0) diff += 1440;
  return Math.round((diff / 60) * 100) / 100;
};
