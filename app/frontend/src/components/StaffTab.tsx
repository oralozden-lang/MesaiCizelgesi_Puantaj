import { useMemo, useState } from 'react';
import { Loader2, Plus, Users } from 'lucide-react';
import { useEmployeePrivate, useEmployees, useSaveEmployee } from '@/lib/queries';
import {
  Branch,
  CalismaSekli,
  Employee,
  GOREVLER,
  GRUP_ETIKET,
  GRUP_SIRA,
  Gorev,
  SEKIL_ETIKET,
  siralaPersonel,
} from '@/lib/types';
import { iso, kisaTarih } from '@/lib/dates';
import { EmptyState, InlineError, SectionHead } from '@/components/parts';
import { Sheet, SheetActions, inputCls } from '@/components/Sheet';

interface Form {
  id: string;
  ad_soyad: string;
  gorev: Gorev;
  calisma_sekli: CalismaSekli;
  sgk_var: boolean;
  sgk_branch_id: string;
  ise_giris: string;
  baslama: string;
  isten_cikis: string;
  paket_basi: string;
  sira: number | null;
  tc: string;
  iban: string;
}

/** Çıkış yapan kişi, ertesi ayın 10'undan sonra Pasif'e düşer (eski sistemle aynı). */
const PASIF_GUN = 10;
const pasifMi = (e: Employee, bugun: string) => {
  if (!e.isten_cikis) return false;
  const [y, m] = e.isten_cikis.split('-').map(Number);
  return bugun > iso(new Date(y, m, PASIF_GUN));
};

const ibanNorm = (v: string) => v.replace(/\s+/g, '').toUpperCase();
const ibanGoster = (v: string) => ibanNorm(v).replace(/(.{4})/g, '$1 ').trim();

export default function StaffTab({
  branches,
  activeBranch,
}: {
  branches: Branch[];
  activeBranch: Branch | null;
}) {
  const [branchId, setBranchId] = useState(activeBranch?.id ?? branches[0]?.id ?? '');
  const [pasifGoster, setPasifGoster] = useState(false);
  const { data: employees = [], isLoading } = useEmployees(branchId || null);
  const { data: ozeller = [] } = useEmployeePrivate(branchId || null, true);
  const save = useSaveEmployee();
  const [form, setForm] = useState<Form | null>(null);
  const [hata, setHata] = useState('');

  const bugun = iso(new Date());
  const ozelMap = useMemo(() => new Map(ozeller.map((o) => [o.employee_id, o])), [ozeller]);
  const branchAdi = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.ad])), [branches]);

  const gorunen = siralaPersonel(employees).filter((e) => pasifGoster || !pasifMi(e, bugun));
  const pasifSayi = employees.filter((e) => pasifMi(e, bugun)).length;

  const ac = (e?: Employee) => {
    setHata('');
    const o = e ? ozelMap.get(e.id) : undefined;
    setForm({
      id: e?.id ?? '',
      ad_soyad: e?.ad_soyad ?? '',
      gorev: e?.gorev ?? 'Mutfak',
      calisma_sekli: e?.calisma_sekli ?? 'tam',
      sgk_var: e?.sgk_var ?? true,
      sgk_branch_id: e?.sgk_branch_id ?? branchId,
      ise_giris: e?.ise_giris ?? bugun,
      baslama: e?.baslama ?? '',
      isten_cikis: e?.isten_cikis ?? '',
      paket_basi: e?.paket_basi != null ? String(e.paket_basi) : '',
      sira: e?.sira ?? null,
      tc: o?.tc ?? '',
      iban: o?.iban ? ibanGoster(o.iban) : '',
    });
  };

  const gorevSec = (gorev: Gorev) => {
    if (!form) return;
    const g = GOREVLER.find((x) => x.ad === gorev);
    const sekil: CalismaSekli = g?.sekil
      ? g.sekil
      : form.calisma_sekli === 'esnaf'
        ? 'tam'
        : form.calisma_sekli;
    setForm({ ...form, gorev, calisma_sekli: sekil });
  };

  const kaydet = async () => {
    if (!form) return;
    setHata('');
    if (!branchId) return setHata('Önce şube seçin.');
    if (form.ad_soyad.trim().length < 3) return setHata('Ad soyad gerekli.');
    if (!form.ise_giris) return setHata('İşe giriş tarihi gerekli.');
    const ilk = form.baslama && form.baslama < form.ise_giris ? form.baslama : form.ise_giris;
    if (form.isten_cikis && form.isten_cikis < ilk)
      return setHata('İşten çıkış, ilk çalışma gününden önce olamaz.');
    const tc = form.tc.trim();
    if (tc && !/^[1-9][0-9]{10}$/.test(tc)) return setHata('TC kimlik no 11 haneli olmalı.');
    const iban = ibanNorm(form.iban);
    if (iban && !/^TR[0-9]{24}$/.test(iban)) return setHata('IBAN TR ile başlayan 26 karakter olmalı.');
    const esnaf = form.calisma_sekli === 'esnaf';
    const paket = form.paket_basi.trim() ? Number(form.paket_basi.replace(',', '.')) : null;
    if (esnaf && paket !== null && (Number.isNaN(paket) || paket < 0))
      return setHata('Paket başı ücret geçersiz.');

    try {
      await save.mutateAsync({
        employee: {
          ...(form.id ? { id: form.id } : {}),
          branch_id: branchId,
          ad_soyad: form.ad_soyad.trim(),
          gorev: form.gorev,
          calisma_sekli: form.calisma_sekli,
          sgk_var: form.sgk_var,
          sgk_branch_id: form.sgk_var ? form.sgk_branch_id || branchId : null,
          ise_giris: form.ise_giris,
          baslama: form.baslama || null,
          isten_cikis: form.isten_cikis || null,
          paket_basi: esnaf ? paket : null,
          sira: form.sira,
        },
        ozel: { tc: tc || null, iban: iban || null },
      });
      setForm(null);
    } catch (e) {
      setHata((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="label-cap">Şube</span>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.ad}
            </option>
          ))}
        </select>
      </label>

      <SectionHead
        title={`Personel (${gorunen.length})`}
        extra={
          <button
            type="button"
            onClick={() => ac()}
            disabled={!branchId}
            className="press flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-45"
          >
            <Plus className="size-3.5" /> Yeni personel
          </button>
        }
      />

      {pasifSayi > 0 && (
        <button
          type="button"
          onClick={() => setPasifGoster((v) => !v)}
          className="press min-h-9 rounded-full border border-[hsl(var(--line))] px-3 text-[13px] font-medium"
        >
          {pasifGoster ? 'Pasifleri gizle' : `Pasifleri göster (${pasifSayi})`}
        </button>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-[hsl(var(--ink-soft))]">
          <Loader2 className="size-4 animate-spin" /> Yükleniyor…
        </div>
      )}

      {!isLoading && gorunen.length === 0 && (
        <EmptyState
          icon={<Users className="size-5" />}
          title="Personel yok"
          description="Çizelgede görünmesi için bu şubeye personel ekleyin."
        />
      )}

      {GRUP_SIRA.map((g) => {
        const liste = gorunen.filter((e) => e.grup === g);
        if (!liste.length) return null;
        return (
          <div key={g} className="space-y-2">
            <p className="label-cap pt-1">{GRUP_ETIKET[g]}</p>
            <ul className="space-y-2">
              {liste.map((e) => {
                const o = ozelMap.get(e.id);
                const ibanYeni =
                  !!o?.iban_degisim &&
                  Date.now() - new Date(o.iban_degisim).getTime() < 30 * 864e5;
                return (
                  <li key={e.id} className="card-surface px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold">{e.ad_soyad}</p>
                        <p className="hint mt-0.5">
                          {e.gorev} · {SEKIL_ETIKET[e.calisma_sekli]} · giriş {kisaTarih(e.ise_giris)}
                          {e.isten_cikis ? ` · çıkış ${kisaTarih(e.isten_cikis)}` : ''}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {!e.sgk_var && <Rozet>SGK'sız</Rozet>}
                          {e.sgk_var && e.sgk_branch_id && e.sgk_branch_id !== e.branch_id && (
                            <Rozet>SGK: {branchAdi[e.sgk_branch_id] ?? '—'}</Rozet>
                          )}
                          {pasifMi(e, bugun) && <Rozet>Pasif</Rozet>}
                          {!o?.iban && <Rozet>IBAN yok</Rozet>}
                          {ibanYeni && <Rozet vurgu>IBAN güncellendi</Rozet>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => ac(e)}
                        className="press min-h-9 shrink-0 rounded-full border border-[hsl(var(--line))] px-3 text-[13px] font-semibold"
                      >
                        Düzenle
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {form && (
        <Sheet title={form.id ? 'Personeli düzenle' : 'Yeni personel'} onClose={() => setForm(null)}>
          <label className="block space-y-1">
            <span className="label-cap">Ad soyad</span>
            <input
              value={form.ad_soyad}
              onChange={(e) => setForm({ ...form, ad_soyad: e.target.value })}
              className={inputCls}
              placeholder="Mehmet Demir"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="label-cap">Görev</span>
              <select
                value={form.gorev}
                onChange={(e) => gorevSec(e.target.value as Gorev)}
                className={inputCls}
              >
                {GOREVLER.map((g) => (
                  <option key={g.ad} value={g.ad}>
                    {g.ad}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="label-cap">Çalışma şekli</span>
              <select
                value={form.calisma_sekli}
                disabled={form.calisma_sekli === 'esnaf'}
                onChange={(e) => setForm({ ...form, calisma_sekli: e.target.value as CalismaSekli })}
                className={`${inputCls} disabled:opacity-60`}
              >
                {form.calisma_sekli === 'esnaf' ? (
                  <option value="esnaf">Esnaf kurye</option>
                ) : (
                  <>
                    <option value="tam">Tam</option>
                    <option value="part">Part</option>
                  </>
                )}
              </select>
            </label>
          </div>
          <p className="hint">
            Görev çizelgedeki bölümü belirler. Part ve esnaf kuryede fazla mesai hesaplanmaz.
          </p>

          {form.calisma_sekli === 'esnaf' && (
            <label className="block space-y-1">
              <span className="label-cap">Paket başı ücret (₺)</span>
              <input
                inputMode="decimal"
                value={form.paket_basi}
                onChange={(e) => setForm({ ...form, paket_basi: e.target.value })}
                className={inputCls}
                placeholder="45"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="label-cap">SGK girişi</span>
              <input
                type="date"
                value={form.ise_giris}
                onChange={(e) => setForm({ ...form, ise_giris: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className="label-cap">Fiili başlama</span>
              <input
                type="date"
                value={form.baslama}
                onChange={(e) => setForm({ ...form, baslama: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="col-span-2 block space-y-1">
              <span className="label-cap">İşten çıkış</span>
              <input
                type="date"
                value={form.isten_cikis}
                onChange={(e) => setForm({ ...form, isten_cikis: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>
          <p className="hint">
            Deneme süresi varsa fiili başlamayı girin; kişi çizelgede o tarihten itibaren görünür.
          </p>

          <div className="space-y-2 rounded-xl border border-[hsl(var(--line))] p-3">
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-[14px] font-medium">SGK kaydı var</span>
              <input
                type="checkbox"
                checked={form.sgk_var}
                onChange={(e) => setForm({ ...form, sgk_var: e.target.checked })}
                className="size-5 accent-[hsl(var(--primary))]"
              />
            </label>
            {form.sgk_var && (
              <label className="block space-y-1">
                <span className="label-cap">SGK şubesi</span>
                <select
                  value={form.sgk_branch_id}
                  onChange={(e) => setForm({ ...form, sgk_branch_id: e.target.value })}
                  className={inputCls}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.ad}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-[hsl(var(--line))] p-3">
            <p className="label-cap">Gizli bilgiler</p>
            <label className="block space-y-1">
              <span className="hint">TC kimlik no</span>
              <input
                inputMode="numeric"
                maxLength={11}
                value={form.tc}
                onChange={(e) => setForm({ ...form, tc: e.target.value.replace(/\D/g, '') })}
                className={`${inputCls} num`}
              />
            </label>
            <label className="block space-y-1">
              <span className="hint">IBAN</span>
              <input
                value={form.iban}
                onChange={(e) => setForm({ ...form, iban: ibanGoster(e.target.value) })}
                autoCapitalize="characters"
                spellCheck={false}
                className={`${inputCls} num`}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
              />
            </label>
            <p className="hint">
              Yalnızca işveren ve şubenin bölge müdürü görür. IBAN değişince eskisi saklanır ve işlem kaydına yazılır.
            </p>
          </div>

          {hata && <InlineError message={hata} />}
          <SheetActions busy={save.isPending} onSubmit={kaydet} onCancel={() => setForm(null)} />
        </Sheet>
      )}
    </div>
  );
}

function Rozet({ children, vurgu = false }: { children: React.ReactNode; vurgu?: boolean }) {
  return (
    <span
      className={
        vurgu
          ? 'rounded-full bg-[hsl(var(--durum-kapali)/0.14)] px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--durum-kapali))]'
          : 'rounded-full bg-[hsl(var(--surface-2))] px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--ink-soft))]'
      }
    >
      {children}
    </span>
  );
}
