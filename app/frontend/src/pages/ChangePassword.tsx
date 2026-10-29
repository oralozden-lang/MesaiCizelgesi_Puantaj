import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/lib/auth';
import { InlineError } from '@/components/parts';

export default function ChangePassword() {
  const navigate = useNavigate();
  const { refreshProfile, signOut } = useApp();
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
      const { error } = await supabase.auth.updateUser({ password: sifre });
      if (error) {
        setHata(error.message);
        return;
      }
      const { error: rpcError } = await supabase.rpc('p_sifre_degistirildi');
      if (rpcError) {
        setHata('Şifre güncellendi ancak profil işaretlenemedi. Lütfen tekrar giriş yapın.');
        return;
      }
      await refreshProfile();
      navigate('/cizelge', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[480px] px-6 pb-12 pt-16">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="label-cap">Güvenlik</p>
            <h1 className="font-display text-[22px] font-extrabold leading-tight">Şifre değiştir</h1>
          </div>
        </div>
        <p className="hint mb-6">
          İlk girişte geçici şifrenizi kendi şifrenizle değiştirmeniz gerekiyor.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            placeholder="Yeni şifre"
            autoComplete="new-password"
            required
            className="min-h-12 w-full rounded-xl border border-[hsl(var(--line))] bg-card px-3.5 outline-none focus:border-primary"
          />
          <input
            type="password"
            value={tekrar}
            onChange={(e) => setTekrar(e.target.value)}
            placeholder="Yeni şifre tekrar"
            autoComplete="new-password"
            required
            className="min-h-12 w-full rounded-xl border border-[hsl(var(--line))] bg-card px-3.5 outline-none focus:border-primary"
          />
          {hata && <InlineError message={hata} />}
          <button
            type="submit"
            disabled={busy}
            className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-45"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Kaydediliyor…' : 'Şifreyi kaydet'}
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
            className="press min-h-11 w-full text-[14px] font-medium text-[hsl(var(--ink-soft))]"
          >
            Oturumu kapat
          </button>
        </form>
      </div>
    </div>
  );
}
