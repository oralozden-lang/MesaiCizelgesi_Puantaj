import { ayBasi, haftaBasi } from './dates';
import { AyDurum, HaftaDurum, Rol } from './types';

/**
 * Şartname §5 düzenleme kilidi — arayüz tarafı.
 * Aynı kural veritabanında (RLS + p_can_edit_day) uygulanır; burada yalnızca
 * kullanıcıya hangi günün düzenlenebilir olduğunu göstermek için kullanılır.
 */
export const gunDuzenlenebilir = (
  rol: Rol,
  haftaDurum: HaftaDurum,
  ayDurum: AyDurum
): boolean => {
  if (ayDurum === 'kesin') return false;
  if (haftaDurum === 'onayli') return rol === 'isveren';
  if (haftaDurum === 'kapali') return rol === 'bolge' || rol === 'isveren';
  return true;
};

/** Haftanın herhangi bir günü kilitli mi (ay kesin ise). */
export const haftaKilitliMi = (ayDurumlar: AyDurum[]): boolean =>
  ayDurumlar.some((d) => d === 'kesin');

export const haftaBaslangiciAl = (tarih: string) => haftaBasi(tarih);
export const ayBaslangiciAl = (tarih: string) => ayBasi(tarih);
