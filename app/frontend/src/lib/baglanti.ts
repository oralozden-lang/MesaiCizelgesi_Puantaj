import { PROJE_REF } from './supabase';

/**
 * Önbellek sürümü. Uygulama kabuğu veya backend değiştiğinde bu değeri artırın:
 * eski service worker ve önbellekler tarayıcıda bir kez temizlenir.
 */
const SURUM = 'puantaj-v3';

/**
 * Eski bir service worker, sayfayı önbellekten servis ederek uygulamanın eski
 * backend adresine istek atmasına yol açabilir. Bu kontrol, sürüm ya da proje
 * değiştiğinde kayıtlı worker'ları ve önbellekleri bırakır.
 */
export async function eskiOnbellegiTemizle(): Promise<void> {
  if (typeof window === 'undefined') return;

  const mevcutAnahtar = `${SURUM}|${PROJE_REF}`;
  const kayitli = localStorage.getItem('mesai.surum');

  if (kayitli === mevcutAnahtar) return;

  const temizlenecek = Boolean(kayitli) || kayitli === null;
  localStorage.setItem('mesai.surum', mevcutAnahtar);

  if (!temizlenecek) return;

  let kayitBulundu = false;
  try {
    if ('serviceWorker' in navigator) {
      const kayitlar = await navigator.serviceWorker.getRegistrations();
      kayitBulundu = kayitlar.length > 0;
      await Promise.all(kayitlar.map((kayit) => kayit.unregister()));
    }
    if ('caches' in window) {
      const anahtarlar = await caches.keys();
      await Promise.all(anahtarlar.map((anahtar) => caches.delete(anahtar)));
    }
  } catch {
    // Temizlik başarısız olsa da uygulama çalışmaya devam eder.
  }

  // Yalnızca gerçekten eski bir worker varsa yeniden yükle; sonsuz döngü olmaz
  // çünkü sürüm anahtarı yukarıda yazıldı.
  if (kayitBulundu) {
    const url = new URL(window.location.href);
    url.searchParams.set('v', SURUM);
    window.location.replace(url.toString());
  }
}
