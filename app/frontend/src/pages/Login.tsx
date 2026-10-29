import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { callUserFn } from '@/lib/supabase';
import { InlineError } from '@/components/parts';
import InstallBanner from '@/components/InstallBanner';

const DOMAIN = 'puantaj-merkezi.app';

export default function Login() {
  const navigate = useNavigate();
  const [kullaniciAdi, setKullaniciAdi] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState('');
  const [busy, setBusy] = useState(false);
  const [kontrol, setKontrol] = useState(true);
  const [kurulum, setKurulum] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await callUserFn({ action: 'durum' });
      setKurulum(Boolean(res.kurulum_gerekli));
      setKontrol(false);
    })();
  }, []);

  // Sistemde hiç kullanıcı yoksa doğrudan işveren hesabı formuna geç.
  useEffect(() => {
    if (!kontrol && kurulum) navigate('/kayit', { replace: true });
  }, [kontrol, kurulum, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata('');
    setBusy(true);
    try {
      const email = `${kullaniciAdi.trim().toLowerCase()}@${DOMAIN}`;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: sifre });
      if (error || !data.user) {
        setHata('Kullanıcı adı veya şifre hatalı.');
        return;
      }
      const { data: prof } = await supabase
        .from('app_8524c8f4f5_profiles')
        .select('aktif, sifre_degistirmeli')
        .eq('id', data.user.id)
        .maybeSingle();
      if (!prof) {
        await supabase.auth.signOut();
        setHata('Bu hesap için profil bulunamadı. Yöneticinize başvurun.');
        return;
      }
      if (!prof.aktif) {
        await supabase.auth.signOut();
        setHata('Hesabınız pasif durumda. Yöneticinize başvurun.');
        return;
      }
      navigate(prof.sifre_degistirmeli ? '/sifre' : '/cizelge', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col justify-center px-6 pb-10 pt-14">
        <div className="mb-9">
          <div className="mb-5 flex items-center gap-2" aria-hidden>
            <span className="h-10 w-1.5 rounded-full bg-primary" />
            <span className="h-6 w-1.5 rounded-full bg-[hsl(var(--amber))]" />
            <span className="h-3 w-1.5 rounded-full bg-[hsl(var(--line))]" />
          </div>
          <p className="label-cap">Vardiya ve puantaj</p>
          <h1 className="mt-1 font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em]">
            Mesai Çizelgesi
            <span className="block text-primary">Puantaj</span>
          </h1>
          <p className="hint mt-3 max-w-[30ch]">
            Şube çizelgelerini girin, aylık puantaj ve fazla mesai otomatik oluşsun.
          </p>
        </div>

        {kontrol ? (
          <div className="flex items-center gap-2 text-[hsl(var(--ink-soft))]">
            <Loader2 className="size-4 animate-spin" /> Hazırlanıyor…
          </div>
        ) : kurulum ? (
          <div className="card-surface p-5">
            <p className="section-title">İlk kurulum</p>
            <p className="hint mt-1">
              Sistemde henüz kullanıcı yok. İşveren hesabını oluşturarak başlayın.
            </p>
            <button
              type="button"
              onClick={() => navigate('/kayit')}
              className="press mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground"
            >
              İşveren hesabı oluştur
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="kadi" className="label-cap">
                Kullanıcı adı
              </label>
              <input
                id="kadi"
                value={kullaniciAdi}
                onChange={(e) => setKullaniciAdi(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                className="min-h-12 w-full rounded-xl border border-[hsl(var(--line))] bg-card px-3.5 outline-none focus:border-primary"
                placeholder="ornek.mudur"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="sifre" className="label-cap">
                Şifre
              </label>
              <input
                id="sifre"
                type="password"
                value={sifre}
                onChange={(e) => setSifre(e.target.value)}
                autoComplete="current-password"
                required
                className="min-h-12 w-full rounded-xl border border-[hsl(var(--line))] bg-card px-3.5 outline-none focus:border-primary"
                placeholder="••••••"
              />
            </div>
            {hata && <InlineError message={hata} />}
            <button
              type="submit"
              disabled={busy}
              className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-45"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
              {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </button>
            <p className="hint text-center">
              Şifrenizi bilmiyorsanız işverenden sıfırlama talep edin.
            </p>
          </form>
        )}
        <InstallBanner className="mt-8" />
      </div>
    </div>
  );
}
