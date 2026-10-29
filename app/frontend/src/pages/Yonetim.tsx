import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  KeyRound,
  Loader2,
  Plus,
  ScrollText,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/auth';
import {
  refreshUserData,
  useAllProfiles,
  useAllUserBranches,
  useAudit,
  useSaveBranch,
  useSaveEmployee,
  useEmployees,
  useWeeks,
} from '@/lib/queries';
import { callUserFn } from '@/lib/supabase';
import { Branch, Employee, ROL_ETIKET, Rol } from '@/lib/types';
import { kisaTarih, uzunTarih } from '@/lib/dates';
import { EmptyState, InlineError, SectionHead } from '@/components/parts';
import { Sheet, SheetActions, inputCls } from '@/components/Sheet';
import StaffTab from '@/components/StaffTab';
import { cn } from '@/lib/utils';

type Tab = 'subeler' | 'personel' | 'kullanicilar' | 'kayit';


export default function YonetimPage() {
  const { branch, branches, profile } = useApp();
  const [tab, setTab] = useState<Tab>('subeler');

  const tabs: Array<{ key: Tab; label: string; icon: typeof Users }> = [
    { key: 'subeler', label: 'Şubeler', icon: Building2 },
    { key: 'personel', label: 'Personel', icon: Users },
    { key: 'kullanicilar', label: 'Kullanıcılar', icon: UserRound },
    { key: 'kayit', label: 'İşlem kaydı', icon: ScrollText },
  ];

  if (profile?.rol !== 'isveren') {
    return (
      <EmptyState
        icon={<Users className="size-5" />}
        title="Yetki gerekli"
        description="Yönetim ekranı yalnızca işveren hesabına açıktır."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="screen-title">Yönetim</h1>
        <p className="hint mt-1">Şubeler, personel, kullanıcılar ve değişiklik geçmişi.</p>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'press flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold',
              tab === t.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-[hsl(var(--line))] text-[hsl(var(--ink-soft))]'
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'subeler' && <BranchesTab branches={branches} />}
      {tab === 'personel' && <StaffTab branches={branches} activeBranch={branch} />}
      {tab === 'kullanicilar' && <UsersTab branches={branches} selfId={profile.id} />}
      {tab === 'kayit' && <AuditTab branchId={branch?.id ?? null} />}
    </div>
  );
}

/* ------------------------------- Şubeler ------------------------------- */

function BranchesTab({ branches }: { branches: Branch[] }) {
  const save = useSaveBranch();
  const [open, setOpen] = useState(false);
  const bosForm = {
    id: '',
    ad: '',
    acilis: '11:00',
    kapanis: '00:30',
    gunluk_saat: '8.5',
    fm_donem: 'hafta' as 'hafta' | 'takvim',
    fm_yontem: 'sabit' as 'sabit' | 'yuzde',
    fm_ucret: '165',
  };
  const [form, setForm] = useState(bosForm);
  const [hata, setHata] = useState('');
  const gunlukSayi = Number(form.gunluk_saat.replace(',', '.')) || 0;

  const ac = (b?: Branch) => {
    setHata('');
    setForm(
      b
        ? {
            id: b.id,
            ad: b.ad,
            acilis: b.acilis.slice(0, 5),
            kapanis: b.kapanis.slice(0, 5),
            gunluk_saat: String(b.gunluk_saat),
            fm_donem: b.fm_donem ?? 'hafta',
            fm_yontem: b.fm_yontem ?? 'sabit',
            fm_ucret: String(b.fm_ucret ?? 165),
          }
        : bosForm
    );
    setOpen(true);
  };

  const kaydet = async () => {
    setHata('');
    if (form.ad.trim().length < 2) return setHata('Şube adı gerekli.');
    const gunluk = gunlukSayi;
    const ucret = Number(form.fm_ucret.replace(',', '.'));
    if (!gunluk || gunluk <= 0 || gunluk > 24) return setHata('Günlük saat 0-24 arası olmalı.');
    if (!(ucret >= 0)) return setHata('Fazla mesai ücreti geçerli bir sayı olmalı.');
    try {
      await save.mutateAsync({
        ...(form.id ? { id: form.id } : {}),
        ad: form.ad.trim(),
        acilis: form.acilis,
        kapanis: form.kapanis,
        gunluk_saat: gunluk,
        haftalik_saat: Math.round(gunluk * 6 * 100) / 100,
        fm_donem: form.fm_donem,
        fm_yontem: form.fm_yontem,
        fm_ucret: ucret,
      });
      setOpen(false);
    } catch (e) {
      setHata((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <SectionHead
        title={`Şubeler (${branches.length})`}
        extra={
          <button
            type="button"
            onClick={() => ac()}
            className="press flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground"
          >
            <Plus className="size-3.5" /> Yeni şube
          </button>
        }
      />
      {branches.length === 0 && (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title="Şube yok"
          description="Çizelge girmek için önce bir şube oluşturun."
        />
      )}
      <ul className="space-y-2">
        {branches.map((b) => (
          <li key={b.id} className="card-surface px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{b.ad}</p>
                <p className="hint mt-0.5 num">
                  {b.acilis.slice(0, 5)}–{b.kapanis.slice(0, 5)} · günlük {b.gunluk_saat} sa · haftalık{' '}
                  {b.haftalik_saat} sa
                </p>
                <p className="hint num">
                  FM: {b.fm_donem === 'takvim' ? 'takvim ayı' : 'hafta'} ·{' '}
                  {b.fm_yontem === 'yuzde' ? `%${b.fm_ucret}` : `${b.fm_ucret} ₺/sa`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => ac(b)}
                className="press min-h-9 shrink-0 rounded-full border border-[hsl(var(--line))] px-3 text-[13px] font-semibold"
              >
                Düzenle
              </button>
            </div>
          </li>
        ))}
      </ul>

      {open && (
        <Sheet title={form.id ? 'Şubeyi düzenle' : 'Yeni şube'} onClose={() => setOpen(false)}>
          <label className="block space-y-1">
            <span className="label-cap">Şube adı</span>
            <input
              value={form.ad}
              onChange={(e) => setForm({ ...form, ad: e.target.value })}
              className={inputCls}
              placeholder="Merkez"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="label-cap">Açılış</span>
              <input
                type="time"
                value={form.acilis}
                onChange={(e) => setForm({ ...form, acilis: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className="label-cap">Kapanış</span>
              <input
                type="time"
                value={form.kapanis}
                onChange={(e) => setForm({ ...form, kapanis: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className="label-cap">Günlük saat</span>
              <input
                inputMode="decimal"
                value={form.gunluk_saat}
                onChange={(e) => setForm({ ...form, gunluk_saat: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className="label-cap">Haftalık saat</span>
              <input
                readOnly
                value={String(Math.round(gunlukSayi * 6 * 100) / 100).replace('.', ',')}
                className={cn(inputCls, 'bg-[hsl(var(--surface-2))]')}
                aria-label="Haftalık saat (günlük × 6)"
              />
            </label>
            <label className="block space-y-1">
              <span className="label-cap">FM dönemi</span>
              <select
                value={form.fm_donem}
                onChange={(e) =>
                  setForm({ ...form, fm_donem: e.target.value as 'hafta' | 'takvim' })
                }
                className={inputCls}
              >
                <option value="hafta">Hafta (Pazartesi kuralı)</option>
                <option value="takvim">Takvim ayı</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="label-cap">FM yöntemi</span>
              <select
                value={form.fm_yontem}
                onChange={(e) =>
                  setForm({ ...form, fm_yontem: e.target.value as 'sabit' | 'yuzde' })
                }
                className={inputCls}
              >
                <option value="sabit">Sabit saat ücreti</option>
                <option value="yuzde">Yüzde (maaşa göre)</option>
              </select>
            </label>
            <label className="col-span-2 block space-y-1">
              <span className="label-cap">
                {form.fm_yontem === 'sabit' ? 'FM saat ücreti (₺)' : 'FM oranı (%)'}
              </span>
              <input
                inputMode="decimal"
                value={form.fm_ucret}
                onChange={(e) => setForm({ ...form, fm_ucret: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>
          <p className="hint">
            Haftalık saat otomatik olarak günlük × 6 hesaplanır. Ayar değişiklikleri içinde
            bulunulan aydan itibaren geçerlidir; önceki ayların hesabı eski ayarla korunur.
            Kapanış açılıştan küçükse gece vardiyası kabul edilir.
          </p>
          {hata && <InlineError message={hata} />}
          <SheetActions busy={save.isPending} onSubmit={kaydet} onCancel={() => setOpen(false)} />
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------ Kullanıcılar ------------------------------ */

function UsersTab({ branches, selfId }: { branches: Branch[]; selfId: string }) {
  const qc = useQueryClient();
  const { data: profiles = [], isLoading } = useAllProfiles(true);
  const { data: links = [] } = useAllUserBranches(true);
  const [open, setOpen] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetSifre, setResetSifre] = useState('');
  const [hata, setHata] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    ad_soyad: '',
    kullanici_adi: '',
    sifre: '',
    rol: 'sube' as Rol,
    branch_ids: [] as string[],
  });

  const branchAdi = useMemo(
    () => Object.fromEntries(branches.map((b) => [b.id, b.ad])),
    [branches]
  );

  const ac = () => {
    setHata('');
    setForm({ ad_soyad: '', kullanici_adi: '', sifre: '', rol: 'sube', branch_ids: [] });
    setOpen(true);
  };

  const olustur = async () => {
    setHata('');
    setBusy(true);
    try {
      const res = await callUserFn({
        action: 'create',
        ad_soyad: form.ad_soyad,
        kullanici_adi: form.kullanici_adi,
        sifre: form.sifre,
        rol: form.rol,
        branch_ids: form.rol === 'isveren' ? [] : form.branch_ids,
      });
      if (res.error) return setHata(res.error);
      refreshUserData(qc);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const sifreSifirla = async () => {
    if (!resetFor) return;
    setHata('');
    setBusy(true);
    try {
      const res = await callUserFn({ action: 'reset', user_id: resetFor, sifre: resetSifre });
      if (res.error) return setHata(res.error);
      setResetFor(null);
      setResetSifre('');
      refreshUserData(qc);
    } finally {
      setBusy(false);
    }
  };

  const sil = async (id: string) => {
    setHata('');
    setBusy(true);
    try {
      const res = await callUserFn({ action: 'sil', user_id: id });
      if (res.error) return setHata(res.error);
      refreshUserData(qc);
    } finally {
      setBusy(false);
    }
  };

  const toggleBranch = (id: string) => {
    setForm((f) => ({
      ...f,
      branch_ids: f.branch_ids.includes(id)
        ? f.branch_ids.filter((x) => x !== id)
        : [...f.branch_ids, id],
    }));
  };

  return (
    <div className="space-y-3">
      <SectionHead
        title={`Kullanıcılar (${profiles.length})`}
        extra={
          <button
            type="button"
            onClick={ac}
            className="press flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground"
          >
            <Plus className="size-3.5" /> Yeni kullanıcı
          </button>
        }
      />

      {hata && <InlineError message={hata} />}

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-[hsl(var(--ink-soft))]">
          <Loader2 className="size-4 animate-spin" /> Yükleniyor…
        </div>
      )}

      <ul className="space-y-2">
        {profiles.map((p) => {
          const subeler = links
            .filter((l) => l.user_id === p.id)
            .map((l) => branchAdi[l.branch_id])
            .filter(Boolean);
          return (
            <li key={p.id} className="card-surface px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{p.ad_soyad}</p>
                  <p className="hint mt-0.5">
                    @{p.kullanici_adi} · {ROL_ETIKET[p.rol]}
                    {p.sifre_degistirmeli && ' · şifre bekliyor'}
                  </p>
                  <p className="hint">
                    {p.rol === 'isveren'
                      ? 'Tüm şubeler'
                      : subeler.length
                        ? subeler.join(', ')
                        : 'Şube atanmadı'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setHata('');
                      setResetFor(p.id);
                      setResetSifre('');
                    }}
                    className="press flex min-h-9 items-center gap-1 rounded-full border border-[hsl(var(--line))] px-2.5 text-[12px] font-semibold"
                  >
                    <KeyRound className="size-3.5" /> Şifre
                  </button>
                  {p.id !== selfId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => sil(p.id)}
                      className="press flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-destructive disabled:opacity-45"
                    >
                      <Trash2 className="size-3.5" /> Sil
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {open && (
        <Sheet title="Yeni kullanıcı" onClose={() => setOpen(false)}>
          <label className="block space-y-1">
            <span className="label-cap">Ad soyad</span>
            <input
              value={form.ad_soyad}
              onChange={(e) => setForm({ ...form, ad_soyad: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1">
            <span className="label-cap">Kullanıcı adı</span>
            <input
              value={form.kullanici_adi}
              onChange={(e) => setForm({ ...form, kullanici_adi: e.target.value })}
              autoCapitalize="none"
              spellCheck={false}
              className={inputCls}
              placeholder="sube.mudur"
            />
          </label>
          <label className="block space-y-1">
            <span className="label-cap">Geçici şifre</span>
            <input
              value={form.sifre}
              onChange={(e) => setForm({ ...form, sifre: e.target.value })}
              className={inputCls}
              placeholder="En az 6 karakter"
            />
          </label>
          <label className="block space-y-1">
            <span className="label-cap">Rol</span>
            <select
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}
              className={inputCls}
            >
              <option value="sube">Şube müdürü</option>
              <option value="bolge">Bölge müdürü</option>
              <option value="isveren">İşveren</option>
            </select>
          </label>

          {form.rol !== 'isveren' && (
            <div className="space-y-1">
              <span className="label-cap">Şube atamaları</span>
              <div className="space-y-1">
                {branches.length === 0 && <p className="hint">Önce şube oluşturun.</p>}
                {branches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBranch(b.id)}
                    className={cn(
                      'press flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left text-[14px]',
                      form.branch_ids.includes(b.id)
                        ? 'border-primary bg-primary-soft font-semibold text-primary'
                        : 'border-[hsl(var(--line))] bg-background'
                    )}
                  >
                    {b.ad}
                    {form.branch_ids.includes(b.id) && <span aria-hidden>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="hint">
            Kullanıcı ilk girişte geçici şifreyi değiştirmek zorundadır. Şifreler hiçbir yerde okunabilir
            saklanmaz.
          </p>
          {hata && <InlineError message={hata} />}
          <SheetActions busy={busy} onSubmit={olustur} onCancel={() => setOpen(false)} label="Oluştur" />
        </Sheet>
      )}

      {resetFor && (
        <Sheet
          title="Şifre sıfırla"
          onClose={() => {
            setResetFor(null);
            setResetSifre('');
          }}
        >
          <p className="hint">Yeni geçici şifre belirleyin. Kullanıcı ilk girişte değiştirecek.</p>
          <input
            value={resetSifre}
            onChange={(e) => setResetSifre(e.target.value)}
            className={inputCls}
            placeholder="En az 6 karakter"
          />
          {hata && <InlineError message={hata} />}
          <SheetActions
            busy={busy}
            onSubmit={sifreSifirla}
            onCancel={() => {
              setResetFor(null);
              setResetSifre('');
            }}
            label="Sıfırla"
          />
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------ İşlem kaydı ------------------------------ */

function AuditTab({ branchId }: { branchId: string | null }) {
  const { data: entries = [], isLoading } = useAudit(branchId);

  if (!branchId) {
    return (
      <EmptyState
        icon={<ScrollText className="size-5" />}
        title="Şube seçin"
        description="İşlem kaydı seçili şubeye göre listelenir."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-[hsl(var(--ink-soft))]">
        <Loader2 className="size-4 animate-spin" /> Yükleniyor…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<ScrollText className="size-5" />}
        title="Kayıt yok"
        description="Hafta/ay işlemleri yapıldıkça burada listelenir."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="card-surface px-4 py-3">
          <p className="text-[14px] font-semibold">{e.islem}</p>
          <p className="hint mt-0.5">
            {e.kullanici ?? 'Sistem'} · {uzunTarih(e.zaman.slice(0, 10))}{' '}
            {e.zaman.slice(11, 16)}
          </p>
          {typeof e.detay?.not === 'string' && e.detay.not && (
            <p className="mt-1 rounded-lg bg-[hsl(var(--surface-2))] px-2 py-1 text-[13px]">
              “{e.detay.not}”
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
