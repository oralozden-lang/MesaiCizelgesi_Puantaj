import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  LogOut,
  Moon,
  Settings2,
  Sun,
  Table2,
  WifiOff,
} from 'lucide-react';
import { useApp } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { ROL_ETIKET } from '@/lib/types';
import InstallBanner from '@/components/InstallBanner';

const useOnline = () => {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
};

const useTheme = () => {
  const [dark, setDark] = useState(
    () => localStorage.getItem('mesai.tema') === 'koyu'
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('mesai.tema', dark ? 'koyu' : 'acik');
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
};

export default function AppShell() {
  const { profile, branches, branchId, setBranchId, signOut } = useApp();
  const online = useOnline();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [branchOpen, setBranchOpen] = useState(false);

  const tabs = [
    { to: '/cizelge', label: 'Çizelge', icon: CalendarDays },
    { to: '/puantaj', label: 'Puantaj', icon: Table2 },
    ...(profile?.rol === 'isveren'
      ? [{ to: '/yonetim', label: 'Yönetim', icon: Settings2 }]
      : []),
  ];

  const showTabs =
    location.pathname !== '/sifre' && location.pathname !== '/kayit';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col border-x border-[hsl(var(--line))] bg-background lg:max-w-[560px]">
        <header className="sticky top-0 z-30 border-b border-[hsl(var(--line))] bg-background/95 px-5 pb-3 pt-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="label-cap">Mesai Çizelgesi · Puantaj</p>
              <button
                type="button"
                onClick={() => setBranchOpen((v) => !v)}
                className="press -ml-1 mt-0.5 flex max-w-full items-center gap-1 rounded-lg px-1 py-0.5 text-left"
                aria-expanded={branchOpen}
              >
                <span className="truncate font-display text-[19px] font-extrabold">
                  {branches.find((b) => b.id === branchId)?.ad ?? 'Şube yok'}
                </span>
                {branches.length > 1 && (
                  <ChevronDown className="size-4 shrink-0 text-[hsl(var(--ink-soft))]" />
                )}
              </button>
              <p className="hint mt-0.5">{profile ? ROL_ETIKET[profile.rol] : ''}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={toggle}
                aria-label={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
                className="press grid size-11 place-items-center rounded-full border border-[hsl(var(--line))] bg-card"
              >
                {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
                aria-label="Oturumu kapat"
                className="press grid size-11 place-items-center rounded-full border border-[hsl(var(--line))] bg-card"
              >
                <LogOut className="size-5" />
              </button>
            </div>
          </div>

          {branchOpen && branches.length > 1 && (
            <div className="mt-3 space-y-1 rounded-2xl border border-[hsl(var(--line))] bg-card p-2">
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBranchId(b.id);
                    setBranchOpen(false);
                  }}
                  className={cn(
                    'press flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-[15px]',
                    b.id === branchId
                      ? 'bg-primary-soft font-semibold text-primary'
                      : 'hover:bg-[hsl(var(--surface-2))]'
                  )}
                >
                  <span>{b.ad}</span>
                  {b.id === branchId && <span aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          )}

          {!online && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-[hsl(var(--amber)/0.12)] px-3 py-2 text-[13px] text-[hsl(var(--durum-kapali))]">
              <WifiOff className="mt-0.5 size-4 shrink-0" />
              <span>Bağlantı yok. Kaydetme işlemleri için internete bağlanın.</span>
            </div>
          )}
        </header>

        <main className="flex-1 px-5 pb-28 pt-5">
          {showTabs && <InstallBanner className="mb-4" />}
          <Outlet />
        </main>

        {showTabs && (
          <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] border-t border-[hsl(var(--line))] bg-background/90 pt-1 backdrop-blur lg:max-w-[560px]">
            <ul className="flex items-stretch">
              {tabs.map((t) => (
                <li key={t.to} className="flex-1">
                  <NavLink
                    to={t.to}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-[56px] flex-col items-center justify-center gap-1 border-t-2 pt-1 text-[11px] font-medium',
                        isActive
                          ? 'border-primary text-primary'
                          : 'border-transparent text-[hsl(var(--ink-soft))]'
                      )
                    }
                  >
                    <t.icon className="size-6" />
                    {t.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
