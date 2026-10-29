import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  MessagesSquare,
  Lock,
} from 'lucide-react';
import { useApp } from '@/lib/auth';
import { useEmployees, useMonths, useMonthAction, useShifts, useWeeks } from '@/lib/queries';
import {
  ayBasligi,
  ayBasi,
  aySonraki,
  gunEkle,
  haftaBasi,
  iso,
  saatMetni,
} from '@/lib/dates';
import { aylikPuantaj } from '@/lib/calc';
import { AyBadge, EmptyState, InlineError, SectionHead } from '@/components/parts';
import { puantajExcelIndir } from '@/lib/excel';
import { cn } from '@/lib/utils';

export default function PuantajPage() {
  const { profile, branch } = useApp();
  const [ay, setAy] = useState(() => ayBasi(new Date()));
  const [panel, setPanel] = useState<null | 'onayla' | 'kesin' | 'geri' | 'kesin_ac'>(null);
  const [not, setNot] = useState('');
  const [hata, setHata] = useState('');

  const branchId = branch?.id ?? null;

  // Fazla mesai haftanın Pazartesi ayına yazıldığı için ay sınırlarını taşan
  // haftaların günleri de çekilir.
  const { from, to } = useMemo(() => {
    const ilkGun = `${ay.slice(0, 7)}-01`;
    const d = new Date(Number(ay.slice(0, 4)), Number(ay.slice(5, 7)), 0);
    const sonGun = iso(d);
    return { from: haftaBasi(ilkGun), to: gunEkle(haftaBasi(sonGun), 6) };
  }, [ay]);

  const { data: employees = [] } = useEmployees(branchId);
  const { data: shifts = [], isLoading } = useShifts(branchId, from, to);
  const { data: months = [] } = useMonths(branchId);
  const { data: weeks = [] } = useWeeks(branchId);
  const monthAction = useMonthAction();

  const month = months.find((m) => m.ay === ay) ?? null;
  const durum = month?.durum ?? 'acik';

  const hesap = useMemo(() => {
    if (!branch) return { satirlar: [], haftaSayisi: 0 };
    return aylikPuantaj(employees, shifts, branch, ay);
  }, [employees, shifts, branch, ay]);

  const doluHaftalar = useMemo(() => {
    const set = new Set(shifts.map((s) => haftaBasi(s.tarih)));
    return [...set]
      .filter((m) => m.slice(0, 7) === ay.slice(0, 7))
      .sort();
  }, [shifts, ay]);

  const onaylanmamis = doluHaftalar.filter((m) => {
    const w = weeks.find((x) => x.hafta_baslangic === m);
    return (w?.durum ?? 'acik') !== 'onayli';
  });

  const toplamlar = useMemo(
    () =>
      hesap.satirlar.reduce(
        (acc, r) => ({
          gun: acc.gun + r.calisilanGun,
          saat: acc.saat + r.toplamSaat,
          fm: acc.fm + r.fazlaMesai,
        }),
        { gun: 0, saat: 0, fm: 0 }
      ),
    [hesap.satirlar]
  );

  const satirlar = useMemo(() => {
    if (durum !== 'kesin' || !month?.kesin_sonuc) return hesap.satirlar;
    const frozen = new Map(month.kesin_sonuc.satirlar.map((s) => [s.employee_id, s]));
    return hesap.satirlar.map((r) => {
      const f = frozen.get(r.employee.id);
      if (!f) return r;
      return {
        ...r,
        calisilanGun: f.calisilan_gun,
        toplamSaat: f.toplam_saat,
        fazlaMesai: f.fazla_mesai,
        izinGun: f.izin,
        raporGun: f.rapor,
        bayramGun: f.bayram,
      };
    });
  }, [durum, month, hesap.satirlar]);

  if (!branch) {
    return (
      <EmptyState
        icon={<FileSpreadsheet className="size-5" />}
        title="Şube seçin"
        description="Aylık puantaj için önce bir şube seçmelisiniz."
      />
    );
  }

  const isveren = profile?.rol === 'isveren';
  const notGerekli = panel === 'geri' || panel === 'kesin_ac';

  const islem = async () => {
    if (!profile || !panel) return;
    setHata('');
    if (panel === 'onayla' && onaylanmamis.length > 0) {
      setHata('Ayı onaylamak için tüm dolu haftalar onaylı olmalı.');
      return;
    }
    if (notGerekli && not.trim().length === 0) {
      setHata('Bu işlem için not yazın.');
      return;
    }
    try {
      await monthAction.mutateAsync({
        branchId: branch.id,
        ay,
        action: panel,
        not: notGerekli ? not.trim() : undefined,
        userId: profile.id,
        kesinSonuc:
          panel === 'kesin'
            ? {
                ay,
                satirlar: hesap.satirlar.map((r) => ({
                  employee_id: r.employee.id,
                  ad_soyad: r.employee.ad_soyad,
                  calisilan_gun: r.calisilanGun,
                  toplam_saat: r.toplamSaat,
                  fazla_mesai: r.fazlaMesai,
                  izin: r.izinGun,
                  rapor: r.raporGun,
                  bayram: r.bayramGun,
                })),
              }
            : undefined,
      });
      setPanel(null);
      setNot('');
    } catch (e) {
      setHata((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAy(aySonraki(ay, -1))}
          aria-label="Önceki ay"
          className="press grid size-11 place-items-center rounded-full border border-[hsl(var(--line))] bg-card"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="text-center">
          <p className="label-cap">Aylık puantaj</p>
          <p className="font-display text-[17px] font-extrabold capitalize leading-tight">
            {ayBasligi(ay)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAy(aySonraki(ay, 1))}
          aria-label="Sonraki ay"
          className="press grid size-11 place-items-center rounded-full border border-[hsl(var(--line))] bg-card"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AyBadge durum={durum} />
        <span className="hint">
          {doluHaftalar.length} hafta · {onaylanmamis.length} onay bekliyor
        </span>
      </div>

      {month?.geri_not && durum === 'acik' && (
        <div className="rounded-xl bg-[hsl(var(--durum-kapali)/0.12)] px-3 py-2 text-[13px]">
          <strong className="font-semibold">Geri gönderildi:</strong> {month.geri_not}
        </div>
      )}

      <div className="card-surface grid grid-cols-3 gap-3 p-4">
        <div>
          <p className="figure text-primary">{saatMetni(toplamlar.saat)}</p>
          <p className="hint mt-1">Toplam saat</p>
        </div>
        <div>
          <p className="figure">{toplamlar.gun}</p>
          <p className="hint mt-1">Çalışılan gün</p>
        </div>
        <div>
          <p
            className={cn(
              'figure',
              toplamlar.fm > 0 && 'text-[hsl(var(--durum-kapali))]'
            )}
          >
            {saatMetni(toplamlar.fm)}
          </p>
          <p className="hint mt-1">Fazla mesai</p>
        </div>
      </div>

      <div>
        <SectionHead
          title="Personel"
          extra={
            <button
              type="button"
              onClick={() =>
                puantajExcelIndir(branch, ay, satirlar, month, profile, employees, shifts).catch(
                  (e) => setHata((e as Error).message)
                )
              }
              disabled={satirlar.length === 0}
              className="press flex min-h-9 items-center gap-1.5 rounded-full border border-[hsl(var(--line))] px-3 text-[13px] font-semibold disabled:opacity-45"
            >
              <Download className="size-3.5" /> Excel
            </button>
          }
        />
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-[hsl(var(--ink-soft))]">
            <Loader2 className="size-4 animate-spin" /> Yükleniyor…
          </div>
        ) : satirlar.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet className="size-5" />}
            title="Bu ay için kayıt yok"
            description="Çizelge girildikçe aylık puantaj burada oluşur."
          />
        ) : (
          <ul className="space-y-2">
            {satirlar.map((r) => (
              <li key={r.employee.id} className="card-surface px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-[15px] font-semibold">{r.employee.ad_soyad}</p>
                  <p className="shrink-0 text-[13px] text-[hsl(var(--ink-soft))] num">
                    {r.calisilanGun} gün · {saatMetni(r.toplamSaat)} saat
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[hsl(var(--ink-soft))]">
                  <span
                    className={cn(
                      'font-semibold',
                      r.fazlaMesai > 0 ? 'text-[hsl(var(--durum-kapali))]' : 'text-foreground'
                    )}
                  >
                    FM {saatMetni(r.fazlaMesai)}
                  </span>
                  <span>İzin {r.izinGun}</span>
                  <span>Rapor {r.raporGun}</span>
                  <span>Bayram {r.bayramGun}</span>
                  {r.yillikGun > 0 && <span>Yıllık {r.yillikGun}</span>}
                  {r.ucretsizGun > 0 && <span>Ücretsiz {r.ucretsizGun}</span>}
                  {r.partBosGun > 0 && <span>Part boş {r.partBosGun}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card-surface p-4">
        <SectionHead title="Ay işlemleri" />
        {durum === 'kesin' ? (
          <div className="flex items-start gap-2 text-[13px]">
            <Lock className="mt-0.5 size-4 shrink-0 text-[hsl(var(--durum-kesin))]" />
            <span>
              Bu ay kesinleşti; puantaj sonuçları donduruldu.
              {isveren && ' Düzeltme için işveren kesin kapanışı açabilir.'}
            </span>
          </div>
        ) : onaylanmamis.length > 0 && durum === 'acik' ? (
          <p className="hint">
            Onay öncesi tüm dolu haftalar onaylı olmalı. Onay bekleyen:{' '}
            {onaylanmamis.length} hafta.
          </p>
        ) : (
          <p className="hint">
            {durum === 'acik'
              ? 'Tüm haftalar onaylı. Ayı onaylayabilirsiniz.'
              : 'Ay onaylı. İşveren kesinleştirebilir veya notla geri gönderebilir.'}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {durum === 'acik' && profile?.rol !== 'sube' && (
            <button
              type="button"
              onClick={() => {
                setHata('');
                setPanel('onayla');
              }}
              className="press min-h-11 flex-1 rounded-xl bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
            >
              Ayı onayla
            </button>
          )}
          {durum === 'onayli' && isveren && (
            <>
              <button
                type="button"
                onClick={() => {
                  setHata('');
                  setPanel('kesin');
                }}
                className="press min-h-11 flex-1 rounded-xl bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
              >
                Kesinleştir
              </button>
              <button
                type="button"
                onClick={() => {
                  setHata('');
                  setPanel('kesin_ac');
                }}
                className="press min-h-11 rounded-xl border border-[hsl(var(--line))] px-4 text-[14px] font-semibold"
              >
                Kesini aç
              </button>
            </>
          )}
          {durum === 'onayli' && profile?.rol !== 'sube' && (
            <button
              type="button"
              onClick={() => {
                setHata('');
                setPanel('geri');
              }}
              className="press min-h-11 flex-1 rounded-xl border border-[hsl(var(--line))] px-4 text-[14px] font-semibold"
            >
              Notla geri gönder
            </button>
          )}
          {durum === 'kesin' && isveren && (
            <button
              type="button"
              onClick={() => {
                setHata('');
                setPanel('kesin_ac');
              }}
              className="press min-h-11 flex-1 rounded-xl border border-[hsl(var(--line))] px-4 text-[14px] font-semibold"
            >
              Kesin kapanışı aç
            </button>
          )}
        </div>
      </div>

      {panel && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setPanel(null)}
            className="absolute inset-0 bg-[hsl(167_18%_10%/0.45)]"
          />
          <div className="safe-bottom absolute inset-x-0 bottom-0 mx-auto w-full max-w-[480px] rounded-t-[24px] border-t border-[hsl(var(--line))] bg-card px-5 pb-4 pt-4">
            <h3 className="section-title">
              {panel === 'onayla'
                ? 'Ayı onayla'
                : panel === 'kesin'
                  ? 'Kesinleştir'
                  : panel === 'kesin_ac'
                    ? 'Kesin kapanışı aç'
                    : 'Notla geri gönder'}
            </h3>
            <p className="hint mt-1">
              {panel === 'onayla'
                ? 'Ay onaylandığında haftalar onaylı kalır; puantaj salt okunur olur.'
                : panel === 'kesin'
                  ? 'Kesinleşen ayın puantaj sonuçları dondurulur ve kimse düzenleyemez.'
                  : panel === 'kesin_ac'
                    ? 'Ay yeniden "Onaylı" durumuna döner. Sonraki ay kesinleşmişse bu işlem yapılamaz.'
                    : 'Ay açılır, düzeltme notu görünür.'}
            </p>
            {notGerekli && (
              <textarea
                value={not}
                onChange={(e) => setNot(e.target.value)}
                rows={3}
                placeholder="Açıklama…"
                className="mt-3 w-full rounded-xl border border-[hsl(var(--line))] bg-background p-3 outline-none focus:border-primary"
              />
            )}
            {hata && (
              <div className="mt-3">
                <InlineError message={hata} />
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="press min-h-12 flex-1 rounded-xl border border-[hsl(var(--line))] text-[15px] font-semibold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={monthAction.isPending}
                onClick={islem}
                className="press flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-45"
              >
                {monthAction.isPending && <Loader2 className="size-4 animate-spin" />}
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}

      {month?.geri_not && durum !== 'acik' && (
        <p className="flex items-start gap-2 text-[13px] text-[hsl(var(--ink-soft))]">
          <MessagesSquare className="mt-0.5 size-4 shrink-0" />
          Son not: {month.geri_not}
        </p>
      )}
    </div>
  );
}
