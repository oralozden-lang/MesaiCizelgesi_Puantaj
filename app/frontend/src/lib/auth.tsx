import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { supabase, T } from './supabase';
import { Branch, Profile } from './types';

interface AppState {
  loading: boolean;
  profile: Profile | null;
  branches: Branch[];
  branchId: string | null;
  branch: Branch | null;
  setBranchId: (id: string) => void;
  refreshProfile: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

const BRANCH_KEY = 'mesai.aktifSube';

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchIdState] = useState<string | null>(null);

  const loadBranches = useCallback(async (prof: Profile) => {
    if (prof.rol === 'isveren') {
      const { data } = await supabase.from(T.branches).select('*').order('ad');
      const list = (data ?? []) as Branch[];
      setBranches(list);
      setBranchIdState((prev) => {
        if (prev && list.some((b) => b.id === prev)) return prev;
        const saved = localStorage.getItem(BRANCH_KEY);
        if (saved && list.some((b) => b.id === saved)) return saved;
        return list[0]?.id ?? null;
      });
      return;
    }
    const { data: links } = await supabase
      .from(T.userBranches)
      .select('branch_id')
      .eq('user_id', prof.id);
    const ids = (links ?? []).map((l) => l.branch_id);
    if (!ids.length) {
      setBranches([]);
      setBranchIdState(null);
      return;
    }
    const { data } = await supabase.from(T.branches).select('*').in('id', ids).order('ad');
    const list = (data ?? []) as Branch[];
    setBranches(list);
    setBranchIdState((prev) => {
      if (prev && list.some((b) => b.id === prev)) return prev;
      const saved = localStorage.getItem(BRANCH_KEY);
      if (saved && list.some((b) => b.id === saved)) return saved;
      return list[0]?.id ?? null;
    });
  }, []);

  const loadProfile = useCallback(async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes?.user?.id;
    if (!uid) {
      setProfile(null);
      setBranches([]);
      setBranchIdState(null);
      return;
    }
    const { data } = await supabase.from(T.profiles).select('*').eq('id', uid).maybeSingle();
    const prof = (data as Profile) ?? null;
    setProfile(prof);
    if (prof?.aktif) await loadBranches(prof);
  }, [loadBranches]);

  useEffect(() => {
    let active = true;
    (async () => {
      await loadProfile();
      if (active) setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setBranches([]);
        setBranchIdState(null);
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') void loadProfile();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const setBranchId = useCallback((id: string) => {
    localStorage.setItem(BRANCH_KEY, id);
    setBranchIdState(id);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(BRANCH_KEY);
  }, []);

  const branch = useMemo(
    () => branches.find((b) => b.id === branchId) ?? null,
    [branches, branchId]
  );

  const value = useMemo<AppState>(
    () => ({
      loading,
      profile,
      branches,
      branchId,
      branch,
      setBranchId,
      refreshProfile: loadProfile,
      refreshBranches: async () => {
        if (profile?.aktif) await loadBranches(profile);
      },
      signOut,
    }),
    [loading, profile, branches, branchId, branch, setBranchId, loadProfile, loadBranches, signOut]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppProvider bulunamadı');
  return ctx;
}
