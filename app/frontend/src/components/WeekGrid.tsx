import { GUN_KISA, kisaTarih, saatMetni } from '@/lib/dates';
import { HaftaOzet, aktifGun, getShift } from '@/lib/calc';
import { kisaAd, vardiyaTuru } from '@/lib/vardiya';
import {
  BOS_RENK,
  Branch,
  Employee,
  GRUP_ETIKET,
  GRUP_SIRA,
  GUN_TIP_KISA,
  Grup,
  KOD_RENK,
  Shift,
} from '@/lib/types';
import { cn } from '@/lib/utils';

export interface GridSatir {
  employee: Employee;
  ozet: HaftaOzet;
}

interface Props {
  gunler: string[];
  satirlar: GridSatir[];
  map: Map<string, Shift>;
  branch: Branch;
  /** Kişinin o haftada en az bir dolu hücresi var mı (boş gün göstergesi için) */
  kayitli: (employeeId: string) => boolean;
  duzenlenebilir: (tarih: string) => boolean;
  bugun: string;
  onHucre: (employee: Employee, tarih: string) => void;
}

const SUTUNLAR = { gridTemplateColumns: '4.5rem repeat(7, minmax(0, 1fr))' } as const;

const fmRenk = (fm: number) =>
  fm > 0.004
    ? 'text-[hsl(var(--durum-onayli))]'
    : fm < -0.004
      ? 'text-[hsl(var(--destructive))]'
      : 'text-[hsl(var(--ink-soft))]';

/** Haftalık çizelge: isim solda, yanında 7 günün saatleri her zaman açık. */
export default function WeekGrid({
  gunler,
  satirlar,
  map,
  branch,
  kayitli,
  duzenlenebilir,
  bugun,
  onHucre,
}: Props) {
  return (
    <div className="-mx-4 space-y-4">
      <div className="grid items-end gap-x-0.5 px-1" style={SUTUNLAR} role="row">
        <span />
        {gunler.map((t, i) => (
          <div
            key={t}
            className={cn(
              'rounded-lg py-1 text-center leading-tight',
              t === bugun && 'bg-primary-soft text-primary'
            )}
          >
            <p className="text-[11px] font-semibold">{GUN_KISA[i]}</p>
            <p className="num text-[11px] text-[hsl(var(--ink-soft))]">
              {kisaTarih(t).split(' ')[0]}
            </p>
          </div>
        ))}
      </div>

      {GRUP_SIRA.map((grup: Grup) => {
        const liste = satirlar.filter((s) => (s.employee.grup ?? 'K') === grup);
        if (liste.length === 0) return null;
        return (
          <section key={grup} aria-label={GRUP_ETIKET[grup]}>
            <p className="label-cap mb-1.5 px-2">
              {GRUP_ETIKET[grup]} · {liste.length}
            </p>
            <ul className="space-y-1.5">
              {liste.map(({ employee, ozet }) => {
                const dolu = kayitli(employee.id);
                const fmYok = employee.calisma_sekli !== 'tam';
                return (
                  <li
                    key={employee.id}
                    className="grid items-stretch gap-x-0.5 rounded-xl border border-[hsl(var(--line))] bg-card px-1 py-1"
                    style={SUTUNLAR}
                  >
                    <div className="flex min-w-0 flex-col justify-center px-1">
                      <p className="truncate text-[12px] font-semibold leading-tight" title={employee.ad_soyad}>
                        {kisaAd(employee.ad_soyad)}
                      </p>
                      <p className="num text-[11px] leading-tight text-[hsl(var(--ink-soft))]">
                        {saatMetni(ozet.toplamSaat)} sa
                      </p>
                      {fmYok ? (
                        <p className="text-[10px] leading-tight text-[hsl(var(--ink-soft))]">
                          {employee.calisma_sekli === 'part' ? 'part' : 'esnaf'}
                        </p>
                      ) : (
                        <p className={cn('num text-[11px] font-semibold leading-tight', fmRenk(ozet.fazlaMesai))}>
                          FM {ozet.fazlaMesai > 0 ? '+' : ''}
                          {saatMetni(ozet.fazlaMesai)}
                        </p>
                      )}
                    </div>

                    {gunler.map((tarih, i) => {
                      const ad = `${employee.ad_soyad} ${GUN_KISA[i]}`;
                      if (!aktifGun(employee, tarih)) {
                        return (
                          <div
                            key={tarih}
                            aria-label={`${ad}: çalışmıyor`}
                            className="grid min-h-[52px] place-items-center rounded-lg bg-[hsl(var(--surface-2))] text-[11px] text-[hsl(var(--ink-soft))] opacity-60"
                          >
                            —
                          </div>
                        );
                      }
                      const s = getShift(map, employee.id, tarih);
                      const acik = duzenlenebilir(tarih);
                      const bos = !s && dolu;
                      const Hucre = acik ? 'button' : 'div';
                      const ortak = cn(
                        'flex min-h-[52px] flex-col items-stretch justify-center gap-0.5 rounded-lg px-0 py-0.5 text-center',
                        acik && 'press'
                      );

                      if (s && s.tip === 'vardiya' && s.baslangic && s.bitis) {
                        const tur = vardiyaTuru(s.baslangic, s.bitis, branch);
                        return (
                          <Hucre
                            key={tarih}
                            {...(acik ? { type: 'button' as const, onClick: () => onHucre(employee, tarih) } : {})}
                            aria-label={`${ad}: ${s.baslangic.slice(0, 5)}–${s.bitis.slice(0, 5)}`}
                            className={cn(ortak, 'border border-[hsl(var(--line))] bg-background')}
                          >
                            <span
                              className={cn(
                                'num rounded-md py-0.5 text-[10px] font-bold leading-none tracking-tight',
                                tur.acilis &&
                                  'bg-[hsl(var(--vardiya-acilis))] text-[hsl(var(--vardiya-acilis-ink))]'
                              )}
                            >
                              {s.baslangic.slice(0, 5)}
                            </span>
                            <span
                              className={cn(
                                'num rounded-md py-0.5 text-[10px] font-bold leading-none tracking-tight',
                                tur.kapanis &&
                                  'bg-[hsl(var(--vardiya-kapanis))] text-[hsl(var(--vardiya-kapanis-ink))]'
                              )}
                            >
                              {s.bitis.slice(0, 5)}
                            </span>
                          </Hucre>
                        );
                      }

                      if (s) {
                        const renk = KOD_RENK[s.tip as keyof typeof KOD_RENK];
                        return (
                          <Hucre
                            key={tarih}
                            {...(acik ? { type: 'button' as const, onClick: () => onHucre(employee, tarih) } : {})}
                            aria-label={`${ad}: ${GUN_TIP_KISA[s.tip]}`}
                            style={renk ? { backgroundColor: renk[0], color: renk[1] } : undefined}
                            className={cn(
                              ortak,
                              'justify-center text-[9px] font-bold leading-tight tracking-tight dark:ring-1 dark:ring-inset dark:ring-white/25'
                            )}
                          >
                            {GUN_TIP_KISA[s.tip]}
                          </Hucre>
                        );
                      }

                      return (
                        <Hucre
                          key={tarih}
                          {...(acik ? { type: 'button' as const, onClick: () => onHucre(employee, tarih) } : {})}
                          aria-label={`${ad}: boş`}
                          style={bos ? { backgroundColor: BOS_RENK, borderColor: '#f3b4b4' } : undefined}
                          className={cn(
                            ortak,
                            'justify-center border text-[16px] leading-none',
                            bos
                              ? 'text-[#b42323]'
                              : 'border-dashed border-[hsl(var(--line))] text-[hsl(var(--line))]'
                          )}
                        >
                          {acik ? '+' : ''}
                        </Hucre>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 text-[12px] text-[hsl(var(--ink-soft))]">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-sm bg-[hsl(var(--vardiya-acilis))]" /> Açılış vardiyası
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-sm bg-[hsl(var(--vardiya-kapanis))]" /> Kapanış vardiyası
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-sm" style={{ backgroundColor: BOS_RENK }} /> Boş gün
        </span>
      </div>
    </div>
  );
}
