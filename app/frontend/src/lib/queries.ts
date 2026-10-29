import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, T } from './supabase';
import { Branch, Employee, EmployeePrivate, Month, Profile, Shift, Week } from './types';
import { haftaGunleri } from './dates';
import { aktifGun } from './calc';

const err = (e: unknown): never => {
  throw new Error(
    (e as { message?: string })?.message ?? 'İşlem tamamlanamadı'
  );
};

export const useProfile = () =>
  useQuery({
    queryKey: ['profile'],
    queryFn: async (): Promise<Profile | null> => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from(T.profiles)
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      if (error) err(error);
      return (data as Profile) ?? null;
    },
  });

export const useMyBranches = () =>
  useQuery({
    queryKey: ['branches', 'mine'],
    queryFn: async (): Promise<Branch[]> => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return [];
      const { data: prof } = await supabase
        .from(T.profiles)
        .select('rol')
        .eq('id', uid)
        .maybeSingle();
      if (prof?.rol === 'isveren') {
        const { data, error } = await supabase
          .from(T.branches)
          .select('*')
          .order('ad');
        if (error) err(error);
        return (data ?? []) as Branch[];
      }
      const { data: links, error: lErr } = await supabase
        .from(T.userBranches)
        .select('branch_id')
        .eq('user_id', uid);
      if (lErr) err(lErr);
      const ids = (links ?? []).map((l) => l.branch_id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from(T.branches)
        .select('*')
        .in('id', ids)
        .order('ad');
      if (error) err(error);
      return (data ?? []) as Branch[];
    },
  });

export const useEmployees = (branchId: string | null) =>
  useQuery({
    queryKey: ['employees', branchId],
    enabled: !!branchId,
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase
        .from(T.employees)
        .select('*')
        .eq('branch_id', branchId)
        .order('ad_soyad');
      if (error) err(error);
      return (data ?? []) as Employee[];
    },
  });

export const useShifts = (branchId: string | null, from: string, to: string) =>
  useQuery({
    queryKey: ['shifts', branchId, from, to],
    enabled: !!branchId,
    queryFn: async (): Promise<Shift[]> => {
      const { data, error } = await supabase
        .from(T.shifts)
        .select('*')
        .eq('branch_id', branchId)
        .gte('tarih', from)
        .lte('tarih', to);
      if (error) err(error);
      return (data ?? []) as Shift[];
    },
  });

export const useWeeks = (branchId: string | null) =>
  useQuery({
    queryKey: ['weeks', branchId],
    enabled: !!branchId,
    queryFn: async (): Promise<Week[]> => {
      const { data, error } = await supabase
        .from(T.weeks)
        .select('*')
        .eq('branch_id', branchId)
        .order('hafta_baslangic', { ascending: false });
      if (error) err(error);
      return (data ?? []) as Week[];
    },
  });

export const useMonths = (branchId: string | null) =>
  useQuery({
    queryKey: ['months', branchId],
    enabled: !!branchId,
    queryFn: async (): Promise<Month[]> => {
      const { data, error } = await supabase
        .from(T.months)
        .select('*')
        .eq('branch_id', branchId)
        .order('ay', { ascending: false });
      if (error) err(error);
      return (data ?? []) as Month[];
    },
  });

export const useAudit = (branchId: string | null) =>
  useQuery({
    queryKey: ['audit', branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(T.audit)
        .select('id, zaman, kullanici, branch_id, islem, detay')
        .eq('branch_id', branchId)
        .order('zaman', { ascending: false })
        .limit(200);
      if (error) err(error);
      const rows = data ?? [];
      const ids = [...new Set(rows.map((r) => r.kullanici).filter(Boolean))] as string[];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from(T.profiles)
          .select('id, ad_soyad')
          .in('id', ids);
        names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.ad_soyad]));
      }
      return rows.map((r) => ({
        ...r,
        kullanici: r.kullanici ? (names[r.kullanici] ?? null) : null,
      }));
    },
  });

export const useSaveShift = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Shift) => {
      const { error } = await supabase
        .from(T.shifts)
        .upsert(payload, { onConflict: 'employee_id,tarih' });
      if (error) err(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
  });
};

export const useDeleteShift = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { employee_id: string; tarih: string }) => {
      const { error } = await supabase
        .from(T.shifts)
        .delete()
        .eq('employee_id', payload.employee_id)
        .eq('tarih', payload.tarih);
      if (error) err(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
};

/** Önceki haftadan kopyala: bu hafta boş olan günleri doldurur. */
export const useCopyWeek = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      branchId: string;
      targetMonday: string;
      sourceMonday: string;
      employees: Employee[];
    }) => {
      const { branchId, targetMonday, sourceMonday, employees } = payload;
      const sourceDays = haftaGunleri(sourceMonday);
      const targetDays = haftaGunleri(targetMonday);
      const ids = employees.map((e) => e.id);
      if (!ids.length) return 0;
      const { data: source, error } = await supabase
        .from(T.shifts)
        .select('*')
        .eq('branch_id', branchId)
        .gte('tarih', sourceDays[0])
        .lte('tarih', sourceDays[6]);
      if (error) err(error);
      const { data: existing } = await supabase
        .from(T.shifts)
        .select('employee_id, tarih')
        .eq('branch_id', branchId)
        .gte('tarih', targetDays[0])
        .lte('tarih', targetDays[6]);
      const taken = new Set((existing ?? []).map((r) => `${r.employee_id}|${r.tarih}`));
      const kisiler = new Map(employees.map((e) => [e.id, e]));
      const rows = (source ?? []).flatMap((s) => {
        const idx = sourceDays.indexOf(s.tarih as string);
        if (idx < 0) return [];
        const target = targetDays[idx];
        if (taken.has(`${s.employee_id}|${target}`)) return [];
        const kisi = kisiler.get(s.employee_id as string);
        if (!kisi || !aktifGun(kisi, target)) return [];
        if (s.tip === 'part_bos' && kisi.calisma_sekli !== 'part') return [];
        return [
          {
            employee_id: s.employee_id,
            tarih: target,
            branch_id: branchId,
            tip: s.tip,
            baslangic: s.baslangic,
            bitis: s.bitis,
            updated_at: new Date().toISOString(),
          },
        ];
      });
      if (!rows.length) return 0;
      const { error: insErr } = await supabase
        .from(T.shifts)
        .upsert(rows, { onConflict: 'employee_id,tarih' });
      if (insErr) err(insErr);
      return rows.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
};

/* --------------------------- Şube / personel --------------------------- */

export const useSaveBranch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Branch> & { ad: string }) => {
      const { error } = payload.id
        ? await supabase.from(T.branches).update(payload).eq('id', payload.id)
        : await supabase.from(T.branches).insert(payload);
      if (error) err(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });
};

/** Kaydedilebilir personel alanları (grup veritabanında görevden türetilir). */
export type EmployeeInput = Omit<Employee, 'id' | 'grup'> & { id?: string };

export const useSaveEmployee = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      employee: EmployeeInput;
      ozel?: { tc: string | null; iban: string | null; paket_ucret: number | null } | null;
    }): Promise<string | undefined> => {
      const { id, ...alanlar } = payload.employee;
      let empId = id;
      if (id) {
        const { error } = await supabase.from(T.employees).update(alanlar).eq('id', id);
        if (error) err(error);
      } else {
        const { data, error } = await supabase
          .from(T.employees)
          .insert(alanlar)
          .select('id')
          .single();
        if (error) err(error);
        empId = data?.id;
      }
      if (payload.ozel && empId) {
        const { error } = await supabase
          .from(T.private)
          .upsert(
            {
              employee_id: empId,
              tc: payload.ozel.tc,
              iban: payload.ozel.iban,
              paket_ucret: payload.ozel.paket_ucret,
            },
            { onConflict: 'employee_id' }
          );
        if (error) err(error);
      }
      return empId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['private'] });
    },
  });
};

/** TC ve IBAN — yalnızca işveren ve şubenin bölge müdürü okuyabilir (RLS). */
export const useEmployeePrivate = (branchId: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ['private', branchId],
    enabled: enabled && !!branchId,
    queryFn: async (): Promise<EmployeePrivate[]> => {
      const { data: emps, error: eErr } = await supabase
        .from(T.employees)
        .select('id')
        .eq('branch_id', branchId);
      if (eErr) err(eErr);
      const ids = (emps ?? []).map((e) => e.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from(T.private)
        .select('employee_id, tc, iban, iban_eski, iban_degisim, paket_ucret')
        .in('employee_id', ids);
      if (error) err(error);
      return (data ?? []) as EmployeePrivate[];
    },
  });

/* ------------------------------ Yönetim ------------------------------ */

export const useAllProfiles = (enabled: boolean) =>
  useQuery({
    queryKey: ['profiles', 'all'],
    enabled,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from(T.profiles)
        .select('*')
        .order('ad_soyad');
      if (error) err(error);
      return (data ?? []) as Profile[];
    },
  });

export const useAllUserBranches = (enabled: boolean) =>
  useQuery({
    queryKey: ['user-branches', 'all'],
    enabled,
    queryFn: async (): Promise<Array<{ user_id: string; branch_id: string }>> => {
      const { data, error } = await supabase
        .from(T.userBranches)
        .select('user_id, branch_id');
      if (error) err(error);
      return data ?? [];
    },
  });

export const refreshUserData = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['profiles'] });
  qc.invalidateQueries({ queryKey: ['user-branches'] });
  qc.invalidateQueries({ queryKey: ['branches'] });
};


export const useWeekAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      branchId: string;
      monday: string;
      action: 'kapat' | 'onayla' | 'geri';
      not?: string;
      userId: string;
      emptyCount?: number;
    }) => {
      const { branchId, monday, action, not, userId } = payload;
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { branch_id: branchId, hafta_baslangic: monday };
      if (action === 'kapat') {
        Object.assign(patch, {
          durum: 'kapali',
          kapatan: userId,
          kapatma_zamani: now,
          geri_not: null,
        });
      } else if (action === 'onayla') {
        Object.assign(patch, { durum: 'onayli', onaylayan: userId, onay_zamani: now, geri_not: null });
      } else {
        Object.assign(patch, { durum: 'acik', geri_not: not ?? null });
      }
      const { error } = await supabase
        .from(T.weeks)
        .upsert(patch, { onConflict: 'branch_id,hafta_baslangic' });
      if (error) err(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weeks'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
};

export const useMonthAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      branchId: string;
      ay: string;
      action: 'onayla' | 'kesin' | 'geri' | 'kesin_ac';
      not?: string;
      userId: string;
      kesinSonuc?: unknown;
    }) => {
      const { branchId, ay, action, not, userId, kesinSonuc } = payload;
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { branch_id: branchId, ay };
      if (action === 'onayla') {
        Object.assign(patch, { durum: 'onayli', onaylayan: userId, onay_zamani: now, geri_not: null });
      } else if (action === 'kesin') {
        Object.assign(patch, {
          durum: 'kesin',
          kesin_yapan: userId,
          kesin_zamani: now,
          kesin_sonuc: kesinSonuc ?? null,
        });
      } else if (action === 'kesin_ac') {
        Object.assign(patch, { durum: 'onayli', kesin_yapan: null, kesin_zamani: null });
      } else {
        Object.assign(patch, { durum: 'acik', geri_not: not ?? null });
      }
      const { error } = await supabase
        .from(T.months)
        .upsert(patch, { onConflict: 'branch_id,ay' });
      if (error) err(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['months'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
};
