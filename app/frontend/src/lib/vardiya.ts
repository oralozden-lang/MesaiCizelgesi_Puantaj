/** Saat metni ("11:00" ya da "11:00:00") → ondalık saat. */
const saat = (s: string): number => {
  const [h, m] = s.slice(0, 5).split(':').map(Number);
  return h + m / 60;
};

export interface VardiyaTuru {
  /** Başlangıç, şubenin açılışında ya da ondan önce */
  acilis: boolean;
  /** Bitiş, şubenin kapanışında ya da ondan sonra */
  kapanis: boolean;
}

/**
 * Çizelgede renklendirme (docs/kurallar.md S-6): başlangıç ≤ açılış → açılış vardiyası,
 * bitiş ≥ kapanış → kapanış vardiyası. Kapanış açılıştan küçükse ertesi güne taşar.
 */
export const vardiyaTuru = (
  baslangic: string,
  bitis: string,
  sube: { acilis: string; kapanis: string }
): VardiyaTuru => {
  const s = saat(baslangic);
  let e = saat(bitis);
  if (e <= s) e += 24;
  const op = saat(sube.acilis);
  let cl = saat(sube.kapanis);
  if (cl <= op) cl += 24;
  return { acilis: s <= op + 1e-6, kapanis: e >= cl - 1e-6 };
};

/** "Ali Veli Yılmaz" → "Ali Y." (dar ekranda isim sütunu için). */
export const kisaAd = (ad: string): string => {
  const p = ad.trim().split(/\s+/);
  if (p.length < 2) return p[0] ?? '';
  const son = p[p.length - 1];
  return /^\d+$/.test(son) ? p.join(' ') : `${p[0]} ${son[0]}.`;
};
