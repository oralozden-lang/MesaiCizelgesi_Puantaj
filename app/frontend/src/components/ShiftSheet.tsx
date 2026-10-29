import { useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import {
  Branch,
  Employee,
  GUN_TIP_ETIKET,
  GunTip,
  HIZLI_KODLAR,
  KOD_RENK,
  SEKIL_ETIKET,
  Shift,
} from '@/lib/types';
import { bugunVeyaGecmis, saatListesi, saatMetni, uzunTarih, vardiyaSuresi } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  employee: Employee | null;
  tarih: string;
  branch: Branch;
  shift: Shift | undefined;
  editable: boolean;
  onClose: () => void;
  onSave: (payload: {
    tip: GunTip;
    baslangic: string | null;
    bitis: string | null;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}

export default function ShiftSheet({
  open,
  employee,
  tarih,
  branch,
  shift,
  editable,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const secenekler = useMemo(
    () =>
      saatListesi(
        branch.acilis.slice(0, 5),
        branch.kapanis.slice(0, 5),
        bugunVeyaGecmis(tarih)
      ),
    [branch.acilis, branch.kapanis, tarih]
  );
  const kodlar = useMemo(
    () =>
      HIZLI_KODLAR.filter(
        (k) => k !== 'part_bos' || employee?.calisma_sekli === 'part'
      ),
    [employee?.calisma_sekli]
  );
  const [baslangic, setBaslangic] = useState('');
  const [bitis, setBitis] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState('');
  const mevcutVar = !baslangic || secenekler.some((o) => o.s === baslangic);

  useEffect(() => {
    if (!open) return;
    setHata('');
    setBaslangic(shift?.baslangic?.slice(0, 5) ?? '');
    setBitis(shift?.bitis?.slice(0, 5) ?? '');
  }, [open, shift, tarih]);

  if (!open || !employee) return null;

  const sure = baslangic && bitis ? vardiyaSuresi(baslangic, bitis) : null;
  const secenekSinifi = (pay: '' | 'erken' | 'gec') =>
    cn(
      'min-h-12 w-full rounded-xl border bg-background px-3 num',
      pay === 'erken' && 'border-amber-500 font-semibold text-amber-700',
      pay === 'gec' && 'border-amber-500 font-semibold text-amber-700',
      pay === '' && 'border-[hsl(var(--line))]'
    );

  const kaydet = async (tip: GunTip, start: string | null, end: string | null) => {
    setHata('');
    setBusy(true);
    try {
      await onSave({ tip, baslangic: start, bitis: end });
      onClose();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Gün düzenle">
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-[hsl(167_18%_10%/0.45)]"
      />
      <div className="safe-bottom absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] w-full max-w-[480px] overflow-y-auto rounded-t-[24px] border-t border-[hsl(var(--line))] bg-card px-5 pb-4 pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[hsl(var(--line))]" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-cap">{uzunTarih(tarih)}</p>
            <h3 className="section-title mt-0.5 truncate">{employee.ad_soyad}</h3>
            <p className="hint mt-0.5">
              {SEKIL_ETIKET[employee.calisma_sekli]} ·{' '}
              {shift ? GUN_TIP_ETIKET[shift.tip] : 'Kayıt yok'}
              {shift?.tip === 'vardiya' && shift?.saat
                ? ` · ${shift.baslangic?.slice(0, 5)}–${shift.bitis?.slice(0, 5)} · ${saatMetni(shift.saat)} saat`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="press grid size-11 shrink-0 place-items-center rounded-full bg-[hsl(var(--surface-2))]"
          >
            <X className="size-5" />
          </button>
        </div>

        {!editable ? (
          <div className="mt-4 rounded-xl bg-[hsl(var(--surface-2))] px-4 py-3">
            <p className="text-[14px] font-semibold">Bu gün kilitli</p>
            <p className="hint mt-1">
              Hafta kapalı/onaylı ya da ay kesinleşmiş. Düzenleme için yetkili onayı gerekir.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="label-cap">Vardiya saati</span>
                {sure !== null && (
                  <span className="text-[13px] font-semibold text-primary num">
                    {saatMetni(sure)} saat
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="hint">Başlangıç</span>
                  <select
                    value={baslangic}
                    onChange={(e) => setBaslangic(e.target.value)}
                    className={secenekSinifi(
                      secenekler.find((o) => o.s === baslangic)?.pay ?? ''
                    )}
                  >
                    <option value="">—</option>
                    {secenekler.map((o) => (
                      <option key={o.s} value={o.s}>
                        {o.s}
                        {o.pay ? ' (pay)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="hint">Bitiş</span>
                  <select
                    value={bitis}
                    onChange={(e) => setBitis(e.target.value)}
                    className={secenekSinifi(
                      secenekler.find((o) => o.s === bitis)?.pay ?? ''
                    )}
                  >
                    <option value="">—</option>
                    {secenekler.map((o) => (
                      <option key={o.s} value={o.s}>
                        {o.s}
                        {o.pay ? ' (pay)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {secenekler.some((o) => o.pay) && (
                <p className="hint">
                  Turuncu saatler normal mesai aralığının dışındaki pay saatleridir.
                </p>
              )}
              {baslangic && !mevcutVar && (
                <p className="text-[13px] font-medium text-destructive">
                  Seçili başlangıç saati güncel listeye uymuyor; lütfen yeniden seçin.
                </p>
              )}
              <button
                type="button"
                disabled={!baslangic || !bitis || busy}
                onClick={() => kaydet('vardiya', baslangic, bitis)}
                className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-45"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Vardiyayı kaydet
              </button>
            </div>

            <div className="mt-5 space-y-2">
              <span className="label-cap">Hızlı kodlar</span>
              <div className="grid grid-cols-2 gap-2">
                {kodlar.map((tip) => {
                  const active = shift?.tip === tip;
                  const renk = KOD_RENK[tip];
                  return (
                    <button
                      key={tip}
                      type="button"
                      disabled={busy}
                      onClick={() => kaydet(tip, null, null)}
                      style={
                        active
                          ? { backgroundColor: renk[0], color: renk[1], borderColor: renk[0] }
                          : { borderColor: renk[0], color: renk[0] }
                      }
                      className="press min-h-12 rounded-xl border px-3 text-[14px] font-semibold"
                    >
                      {GUN_TIP_ETIKET[tip]}
                    </button>
                  );
                })}
              </div>
              {employee.calisma_sekli !== 'part' && (
                <p className="hint">Part boş kodu yalnızca part personelde kullanılır.</p>
              )}
            </div>

            {hata && (
              <p role="alert" className="mt-3 text-[13px] font-medium text-destructive">
                {hata}
              </p>
            )}

            {shift && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onDelete();
                    onClose();
                  } catch (e) {
                    setHata((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="press mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-medium text-destructive"
              >
                <Trash2 className="size-4" /> Günü temizle
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
