import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase, callUserFn, onbellegiSifirla } from '@/lib/supabase';
import { InlineError } from '@/components/parts';

const DOMAIN = 'puantaj-merkezi.app';

export default function Setup() {
  const navigate = useNavigate();
  const [adSoyad, setAdSoyad] = useState('');
  const [kullaniciAdi, setKullaniciAdi] = useState('');
  const [sifre, setSifre] = useState('');
  const [tekrar, setTekrar] = useState('');
  const [hata, setHata] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata('');
    if (sifre.length < 6) return setHata('Şifre en az 6 karakter olmalı.');
    if (sifre !== tekrar) return setHata('Şifreler eşleşmiyor.');
    setBusy(true);
    try {
      const res = await callUserFn({
        action: 'bootstrap',
        ad_soyad: adSoyad,
        kullanici_adi: kullaniciAdi,
        sifre,
      });
      if (res.error) {
        setHata(res.error);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: `${kullaniciAdi.trim().toLowerCase()}@${DOMAIN}`,
        password: sifre,
      });
      if (error) {
        setHata('Hesap oluşturuldu, giriş yapılamadı. Giriş ekranını deneyin.');
        return;
      }
      navigate('/cizelge', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[480px] px-6 pb-12 pt-14">
        <p className="label-cap">İlk kurulum</p>
        <h1 className="mt-1 font-display text-[26px] font-extrabold leading-[1.15]">
          İşveren hesabı
        </h1>
        <p className="hint mt-2">
          Bu hesap tüm şubelere erişir; şubeleri, personeli ve kullanıcıları buradan yönetirsiniz.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Ad soyad">
            <input
              value={adSoyad}
              onChange={(e) => setAdSoyad(e.target.value)}
              required
              className={inputCls}
              placeholder="Ayşe Yılmaz"
            />
          </Field>
          <Field label="Kullanıcı adı">
            <input
              value={kullaniciAdi}
              onChange={(e) => setKullaniciAdi(e.target.value)}
              required
              autoCapitalize="none"
              spellCheck={false}
              className={inputCls}
              placeholder="ayse.yilmaz"
            />
            <p className="hint">Harf, rakam, nokta, tire ve alt çizgi kullanılabilir.</p>
          </Field>
          <Field label="Şifre">
            <input
              type="password"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              required
              className={inputCls}
              placeholder="En az 6 karakter"
            />
          </Field>
          <Field label="Şifre tekrar">
            <input
              type="password"
              value={tekrar}
              onChange={(e) => setTekrar(e.target.value)}
              required
              className={inputCls}
            />
          </Field>
          {hata && <InlineError message={hata} />}
          <button
            type="submit"
            disabled={busy}
            className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-45"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Oluşturuluyor…' : 'Hesabı oluştur'}
          </button>
          {hata && (
            <button
              type="button"
              onClick={() => void onbellegiSifirla()}
              className="press min-h-11 w-full rounded-xl border border-[hsl(var(--line))] text-[14px] font-medium"
            >
              Bağlantıyı sıfırla ve yeniden dene
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'min-h-12 w-full rounded-xl border border-[hsl(var(--line))] bg-card px-3.5 outline-none focus:border-primary';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="label-cap">{label}</span>
      {children}
    </div>
  );
}
