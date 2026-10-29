import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Lock,
} from 'lucide-react';
import { useApp } from '@/lib/auth';
import {
  useCopyWeek,
  useDeleteShift,
  useEmployees,
  useMonths,
  useSaveShift,
  useShifts,
  useWeeks,
  useWeekAction,
} from '@/lib/queries';
import {
  ayBasi,
  gunEkle,
  gunIndeksi,
  haftaBasi,
  haftaBasligi,
  haftaGunleri,
  iso,
  kisaTarih,
  GUN_KISA,
  saatMetni,
} from '@/lib/dates';
import { AyBadge, EmptyState, HaftaBadge, InlineError, SectionHead } from '@/components/parts';
import ShiftSheet from '@/components/ShiftSheet';
import { gunDuzenlenebilir } from '@/lib/permissions';
import {
  aktifGun,
  bosHucreler,
  getShift,
  haftaKadro,
  haftaKaydiVar,
  haftaOzeti,
  haftaToplami,
  shiftMap,
} from '@/lib/calc';
import {
  BOS_RENK,
  Employee,
  GRUP_ETIKET,
  GRUP_SIRA,
  GUN_TIP_KISA,
  GunTip,
  KOD_RENK,
  Shift,
  siralaPersonel,
} from '@/lib/types';
import { cn } from '@/lib/utils';

export default function SchedulePage() {
  const { profile, branch, branches } = useApp();
  const [monday, setMonday] = useState(() => haftaBasi(new Date()));
  const [acikKisi, setAcikKisi] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ employee: Employee; tarih: string } | null>(null);
  const [actionPanel, setActionPanel] = useState<null | 'kapat' | 'onayla' | 'geri'>(null);
  const [not, setNot] = useState('');
  const [hata, setHata] = useState('');
  const [kopyaBilgi, setKopyaBilgi] = useState('');

  const branchId = branch?.id ?? null;
  const gunler = haftaGunleri(monday);
  const { data: employees = [], isLoading: eLoad } = useEmployees(branchId);
  const { data: shifts = [], isLoading: sLoad } = useShifts(branchId, gunler[0], gunler[6]);
  const { data: weeks = [] } = useWeeks(branchId);
  const { data: months = [] } = useMonths(branchId);
  const saveShift = useSaveShift();
  const deleteShift = useDeleteShift();
  const copyWeek = useCopyWeek();
  const weekAction = useWeekAction();

  const map = useMemo(() => shiftMap(shifts), [shifts]);
  const kadro = useMemo(() => siralaPersonel(haftaKadro(employees, monday)), [employees, monday]);
  const haftaDurum = weeks.find((w) => w.hafta_baslangic === monday)?.durum ?? 'acik';
  const geriNot = weeks.find((w) => w.hafta_baslangic === monday)?.geri_not ?? null;

  const ayDurum = (tarih: string) =>
    months.find((m) => m.ay === ayBasi(tarih))?.durum ?? 'acik';

  const duzenlenebilir = (tarih: string) =>
    !!profile && gunDuzenlenebilir(profile.rol, haftaDurum, ayDurum(tarih));

  const ozetler = useMemo(() => {
    if (!branch) return [];
    return kadro.map((e) => ({ employee: e, ozet: haftaOzeti(e, monday, map, branch) }));
  }, [kadro, monday, map, branch]);

  const toplam = useMemo(
    () => haftaToplami(ozetler.map((o) => o.ozet)),
    [ozetler]
  );

  const eksikler = useMemo(() => bosHucreler(kadro, monday, map), [kadro, monday, map]);

  if (!branch) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-5" />}
        title={branches.length ? 'Şube seçin' : 'Şube tanımlı değil'}
        description={
          branches.length
            ? 'Üstteki şube adına dokunarak çalışacağınız şubeyi seçin.'
            : 'İşveren hesabıyla Yönetim ekranından şube oluşturun.'
        }
      />
    );
  }

  const aktifShift = editing ? getShift(map, editing.employee.id, editing.tarih) : undefined;

  const kaydet = async (payload: { tip: GunTip; baslangic: string | null; bitis: string | null }) => {
    if (!editing) return;
    await saveShift.mutateAsync({
      employee_id: editing.employee.id,
      tarih: editing.tarih,
      branch_id: branch.id,
      tip: payload.tip,
      baslangic: payload.baslangic,
      bitis: payload.bitis,
      updated_by: profile?.id ?? null,
      saat: null,
    } as unknown as Shift);
  };

  const haftaIslem = async () => {
    if (!profile || !actionPanel) return;
    setHata('');
    if (actionPanel === 'geri' && not.trim().length === 0) {
      setHata('Geri gönderme için not yazın.');
      return;
    }
    try {
      await weekAction.mutateAsync({
        branchId: branch.id,
        monday,
        action: actionPanel,
        not: actionPanel === 'geri' ? not.trim() : undefined,
        userId: profile.id,
        emptyCount: eksikler.length,
      });
      setActionPanel(null);
      setNot('');
    } catch (e) {
      setHata((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMonday(haftaBasi(gunEkle(monday, -7)))}
            aria-label="Önceki hafta"
            className="press grid size-11 place-items-center rounded-full border border-[hsl(var(--line))] bg-card"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setMonday(haftaBasi(new Date()))}
            className="press min-w-0 text-center"
          >
            <p className="label-cap">{monday === haftaBasi(new Date()) ? 'Bu hafta' : 'Hafta'}</p>
            <p className="truncate font-display text-[17px] font-extrabold leading-tight">
              {haftaBasligi(monday)}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMonday(haftaBasi(gunEkle(monday, 7)))}
            aria-label="Sonraki hafta"
            className="press grid size-11 place-items-center rounded-full border border-[hsl(var(--line))] bg-card"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <HaftaBadge durum={haftaDurum} />
          {[...new Set(gunler.map(ayDurum))].map((d) => (
            <AyBadge key={d} durum={d} />
          ))}
          <span className="hint ml-auto">{kadro.length} kişi</span>
        </div>

        {geriNot && haftaDurum === 'acik' && (
          <div className="mt-3 flex gap-2 rounded-xl bg-[hsl(var(--durum-kapali)/0.12)] px-3 py-2 text-[13px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[hsl(var(--durum-kapali))]" />
            <span>
              <strong className="font-semibold">Geri gönderildi:</strong> {geriNot}
            </span>
          </div>
        )}
      </div>

      <div className="card-surface grid grid-cols-3 gap-3 p-4">
        <div>
          <p className="figure text-primary">{saatMetni(toplam.toplamSaat)}</p>
          <p className="hint mt-1">Toplam saat</p>
        </div>
        <div>
          <p className="figure">{toplam.calisilanGun}</p>
          <p className="hint mt-1">Çalışılan gün</p>
        </div>
        <div>
          <p
            className={cn(
              'figure',
              toplam.fazlaMesai > 0 && 'text-[hsl(var(--durum-kapali))]'
            )}
          >
            {saatMetni(toplam.fazlaMesai)}
          </p>
          <p className="hint mt-1">Fazla mesai</p>
        </div>
        <div className="col-span-3 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[hsl(var(--ink-soft))]">
          <span>İzin {toplam.izinGun + toplam.ucretsizGun}</span>
          <span>Rapor {toplam.raporGun}</span>
          <span>Bayram {toplam.bayramGun}</span>
          <span>Part boş {toplam.partBosGun}</span>
        </div>
      </div>

      <div>
        <SectionHead
          title="Kadro"
          extra={
            <button
              type="button"
              disabled={copyWeek.isPending}
              onClick={async () => {
                setKopyaBilgi('');
                try {
                  const n = await copyWeek.mutateAsync({
                    branchId: branch.id,
                    targetMonday: monday,
                    sourceMonday: haftaBasi(gunEkle(monday, -7)),
                    employees,
                  });
                  setKopyaBilgi(
                    n > 0 ? `${n} gün önceki haftadan kopyalandı.` : 'Kopyalanacak boş gün bulunamadı.'
                  );
                } catch (e) {
                  setHata((e as Error).message);
                }
              }}
              className="press flex min-h-9 items-center gap-1.5 rounded-full border border-[hsl(var(--line))] px-3 text-[13px] font-semibold"
            >
              {copyWeek.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Copy className="size-3.5" />
              )}
              Önceki haftadan kopyala
            </button>
          }
        />
        {kopyaBilgi && <p className="hint mb-2">{kopyaBilgi}</p>}

        {(eLoad || sLoad) && (
          <div className="flex items-center gap-2 py-6 text-[hsl(var(--ink-soft))]">
            <Loader2 className="size-4 animate-spin" /> Yükleniyor…
          </div>
        )}

        {!eLoad && kadro.length === 0 && (
          <EmptyState
            icon={<CalendarDays className="size-5" />}
            title="Bu haftada personel yok"
            description="Personel kayıtlarının işe giriş/çıkış tarihlerini kontrol edin."
          />
        )}

        <div className="space-y-4">
          {GRUP_SIRA.map((grup) => {
            const grupList = ozetler.filter((o) => (o.employee.grup ?? 'K') === grup);
            if (grupList.length === 0) return null;
            return (
              <section key={grup}>
                <p className="label-cap mb-2">
                  {GRUP_ETIKET[grup]} · {grupList.length}
                </p>
        <ul className="space-y-2">
          {grupList.map(({ employee, ozet }) => {
            const open = acikKisi === employee.id;
            const kayitli = haftaKaydiVar(employee.id, monday, map);
            return (
              <li key={employee.id} className="card-surface overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAcikKisi(open ? null : employee.id)}
                  aria-expanded={open}
                  className="press flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[hsl(var(--surface-2))] text-[13px] font-bold text-[hsl(var(--ink-soft))]">
                    {employee.ad_soyad
                      .split(' ')
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join('')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {employee.ad_soyad}
                    </span>
                    <span className="hint">
                      {ozet.calisilanGun} gün · {saatMetni(ozet.toplamSaat)} saat
                      {ozet.fazlaMesai !== 0 && ` · FM ${saatMetni(ozet.fazlaMesai)}`}
                    </span>
                  </span>
                  <ChevronRight
                    className={cn(
                      'size-4 shrink-0 text-[hsl(var(--ink-soft))] transition-transform',
                      open && 'rotate-90'
                    )}
                  />
                </button>

                {open && (
                  <div className="border-t border-[hsl(var(--line))] px-3 pb-3 pt-3">
                    <div className="grid grid-cols-7 gap-1">
                      {gunler.map((tarih, i) => {
                        const s = getShift(map, employee.id, tarih);
                        const kilit = !duzenlenebilir(tarih);
                        const aktif = aktifGun(employee, tarih);
                        if (!aktif) {
                          return (
                            <div
                              key={tarih}
                              className="flex min-h-[62px] flex-col items-center justify-start gap-0.5 rounded-xl bg-[hsl(var(--surface-2))] px-0.5 py-1.5 text-center opacity-50"
                            >
                              <span className="text-[11px] font-semibold">{GUN_KISA[i]}</span>
                              <span className="text-[10px] num">—</span>
                            </div>
                          );
                        }
                        const renk = s && s.tip !== 'vardiya' ? KOD_RENK[s.tip] : null;
                        const bos = !s && kayitli;
                        return (
                          <button
                            key={tarih}
                            type="button"
                            onClick={() => setEditing({ employee, tarih })}
                            style={
                              renk
                                ? { backgroundColor: renk[0], color: renk[1], borderColor: renk[0] }
                                : bos
                                  ? { backgroundColor: BOS_RENK, borderColor: '#f3b4b4' }
                                  : undefined
                            }
                            className={cn(
                              'press flex min-h-[62px] flex-col items-center justify-start gap-0.5 rounded-xl border px-0.5 py-1.5 text-center',
                              s
                                ? s.tip === 'vardiya' && 'border-primary/30 bg-primary-soft'
                                : !bos && 'border-dashed border-[hsl(var(--line))] bg-background'
                            )}
                          >
                            <span className={cn('text-[11px] font-semibold', !renk && 'text-[hsl(var(--ink-soft))]')}>
                              {GUN_KISA[i]}
                            </span>
                            <span className={cn('text-[10px] num', !renk && 'text-[hsl(var(--ink-soft))]')}>
                              {kisaTarih(tarih).split(' ')[0]}
                            </span>
                            {s ? (
                              s.tip === 'vardiya' ? (
                                <span className="text-[10px] font-bold leading-tight num">
                                  {s.baslangic?.slice(0, 5)}
                                  <br />
                                  {s.bitis?.slice(0, 5)}
                                </span>
                              ) : (
                                <span className="px-0.5 text-[9px] font-bold leading-tight">
                                  {GUN_TIP_KISA[s.tip]}
                                </span>
                              )
                            ) : (
                              <span className="text-[16px] leading-none text-[hsl(var(--line))]">
                                +
                              </span>
                            )}
                            {kilit && <Lock className="size-2.5 text-[hsl(var(--durum-acik))]" />}
                          </button>
                        );
                      })}
                    </div>
                    <p className="hint mt-2">
                      Vardiya {saatMetni(ozet.toplamSaat)} saat · Fazla mesai{' '}
                      <span className="font-semibold">{saatMetni(ozet.fazlaMesai)}</span>
                      {ozet.bonus > 0 && ` (7 gün bonusu ${saatMetni(ozet.bonus)})`}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
              </section>
            );
          })}
        </div>
      </div>

      <div className="card-surface p-4">
        <SectionHead title="Hafta işlemleri" />
        {eksikler.length > 0 && haftaDurum === 'acik' && (
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-[hsl(var(--durum-kapali)/0.12)] px-3 py-2 text-[13px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[hsl(var(--durum-kapali))]" />
            <span>
              {eksikler.length} boş gün var:{' '}
              {eksikler
                .slice(0, 3)
                .map((e) => `${e.employee.ad_soyad.split(' ')[0]} ${kisaTarih(e.tarih)}`)
                .join(', ')}
              {eksikler.length > 3 && '…'}
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {haftaDurum === 'acik' && (
            <button
              type="button"
              onClick={() => {
                setHata('');
                setActionPanel('kapat');
              }}
              className="press min-h-11 flex-1 rounded-xl bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
            >
              Haftayı kapat
            </button>
          )}
          {haftaDurum === 'kapali' && profile?.rol !== 'sube' && (
            <button
              type="button"
              onClick={() => {
                setHata('');
                setActionPanel('onayla');
              }}
              className="press min-h-11 flex-1 rounded-xl bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
            >
              Haftayı onayla
            </button>
          )}
          {haftaDurum !== 'acik' && profile?.rol !== 'sube' && (
            <button
              type="button"
              onClick={() => {
                setHata('');
                setActionPanel('geri');
              }}
              className="press min-h-11 flex-1 rounded-xl border border-[hsl(var(--line))] px-4 text-[14px] font-semibold"
            >
              Notla geri gönder
            </button>
          )}
          {haftaDurum === 'onayli' && profile?.rol === 'sube' && (
            <p className="hint">Hafta onaylandı. Düzeltme için bölge müdürüne başvurun.</p>
          )}
        </div>
      </div>

      <ShiftSheet
        open={!!editing}
        employee={editing?.employee ?? null}
        tarih={editing?.tarih ?? iso(new Date())}
        branch={branch}
        shift={aktifShift}
        editable={editing ? duzenlenebilir(editing.tarih) : false}
        onClose={() => setEditing(null)}
        onSave={kaydet}
        onDelete={async () => {
          if (!editing) return;
          await deleteShift.mutateAsync({
            employee_id: editing.employee.id,
            tarih: editing.tarih,
          });
        }}
      />

      {actionPanel && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setActionPanel(null)}
            className="absolute inset-0 bg-[hsl(167_18%_10%/0.45)]"
          />
          <div className="safe-bottom absolute inset-x-0 bottom-0 mx-auto w-full max-w-[480px] rounded-t-[24px] border-t border-[hsl(var(--line))] bg-card px-5 pb-4 pt-4">
            <h3 className="section-title">
              {actionPanel === 'kapat'
                ? 'Haftayı kapat'
                : actionPanel === 'onayla'
                  ? 'Haftayı onayla'
                  : 'Notla geri gönder'}
            </h3>
            <p className="hint mt-1">
              {actionPanel === 'kapat'
                ? eksikler.length > 0
                  ? `${eksikler.length} boş gün var. Yine de kapatılsın mı?`
                  : 'Tüm günler dolu. Hafta kapatıldığında şube müdürü düzenleyemez.'
                : actionPanel === 'onayla'
                  ? 'Onaylanan haftayı yalnızca işveren düzenleyebilir.'
                  : 'Hafta açılır ve düzeltme notu görünür.'}
            </p>
            {actionPanel === 'geri' && (
              <textarea
                value={not}
                onChange={(e) => setNot(e.target.value)}
                rows={3}
                placeholder="Düzeltilmesi gerekenler…"
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
                onClick={() => setActionPanel(null)}
                className="press min-h-12 flex-1 rounded-xl border border-[hsl(var(--line))] text-[15px] font-semibold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={weekAction.isPending}
                onClick={haftaIslem}
                className="press flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-45"
              >
                {weekAction.isPending && <Loader2 className="size-4 animate-spin" />}
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
