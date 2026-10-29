import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

/** Chrome / Edge / Android'in "yükle" olayı. */
interface YuklemeOlayi extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const GIZLE_ANAHTAR = 'mesai.kurulum.gizle';
const GIZLE_GUN = 14;

/** Olay bir kez ve erken gelir; bileşen sonradan açılsa da kaçmasın diye burada tutulur. */
let bekleyenOlay: YuklemeOlayi | null = null;
const dinleyiciler = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    bekleyenOlay = e as YuklemeOlayi;
    dinleyiciler.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    bekleyenOlay = null;
    dinleyiciler.forEach((f) => f());
  });
}

const kuruluMu = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const iosMu = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const safariMi = () => /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios/i.test(navigator.userAgent);

const gizlenmisMi = () => {
  try {
    const t = Number(localStorage.getItem(GIZLE_ANAHTAR) ?? 0);
    return t > Date.now() - GIZLE_GUN * 864e5;
  } catch {
    return false;
  }
};

/** Ana ekrana ekleme uyarısı: Android'de "Yükle" düğmesi, iPhone'da adım adım yönerge. */
export default function InstallBanner({ className = '' }: { className?: string }) {
  const [, yenile] = useState(0);
  const [gizli, setGizli] = useState(gizlenmisMi);

  useEffect(() => {
    const f = () => yenile((n) => n + 1);
    dinleyiciler.add(f);
    return () => {
      dinleyiciler.delete(f);
    };
  }, []);

  if (gizli || kuruluMu()) return null;

  const ios = iosMu();
  if (!bekleyenOlay && !ios) return null;

  const kapat = () => {
    try {
      localStorage.setItem(GIZLE_ANAHTAR, String(Date.now()));
    } catch {
      // saklanamazsa bu oturumda gizli kalır
    }
    setGizli(true);
  };

  const yukle = async () => {
    const olay = bekleyenOlay;
    if (!olay) return;
    await olay.prompt();
    const { outcome } = await olay.userChoice;
    bekleyenOlay = null;
    if (outcome === 'accepted') setGizli(true);
    else yenile((n) => n + 1);
  };

  return (
    <div
      role="region"
      aria-label="Uygulamayı ana ekrana ekle"
      className={`card-surface flex items-start gap-3 p-4 ${className}`}
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <Download className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="section-title">Ana ekrana ekleyin</p>
        {bekleyenOlay ? (
          <>
            <p className="hint mt-0.5">Uygulama gibi tam ekran açılır, tek dokunuşla ulaşırsınız.</p>
            <button
              type="button"
              onClick={yukle}
              className="press mt-3 flex min-h-11 items-center justify-center rounded-[14px] bg-primary px-5 text-[14px] font-semibold text-primary-foreground"
            >
              Yükle
            </button>
          </>
        ) : safariMi() ? (
          <p className="hint mt-0.5">
            Alttaki <Share className="mx-0.5 inline size-3.5 align-[-2px]" aria-label="Paylaş" /> düğmesine
            dokunun, ardından <b>Ana Ekrana Ekle</b>'yi seçin.
          </p>
        ) : (
          <p className="hint mt-0.5">
            Bu adresi <b>Safari</b>'de açın, sonra Paylaş düğmesinden <b>Ana Ekrana Ekle</b>'yi seçin.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={kapat}
        aria-label="Şimdilik gizle"
        className="press grid size-11 shrink-0 place-items-center rounded-full text-[hsl(var(--ink-soft))]"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
