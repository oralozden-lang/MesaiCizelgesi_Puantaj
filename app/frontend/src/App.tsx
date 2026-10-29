import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppProvider, useApp } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import Login from '@/pages/Login';
import Setup from '@/pages/Setup';
import ChangePassword from '@/pages/ChangePassword';
import SchedulePage from '@/pages/Cizelge';
import PuantajPage from '@/pages/Puantaj';
import YonetimPage from '@/pages/Yonetim';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

function BootScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="flex items-center gap-2 text-[hsl(var(--ink-soft))]">
        <Loader2 className="size-4 animate-spin" /> Yükleniyor…
      </div>
    </div>
  );
}

/** Oturum ve profil gerektiren korumalı alan. */
function Protected() {
  const { loading, profile } = useApp();
  const location = useLocation();

  if (loading) return <BootScreen />;
  if (!profile) return <Navigate to="/" replace />;
  if (!profile.aktif) return <Navigate to="/" replace />;
  if (profile.sifre_degistirmeli && location.pathname !== '/sifre') {
    return <Navigate to="/sifre" replace />;
  }
  if (!profile.sifre_degistirmeli && location.pathname === '/sifre') {
    return <Navigate to="/cizelge" replace />;
  }
  return <Outlet />;
}

function RootGate() {
  const { loading, profile } = useApp();
  if (loading) return <BootScreen />;
  if (!profile) return <Login />;
  return <Navigate to={profile.sifre_degistirmeli ? '/sifre' : '/cizelge'} replace />;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<RootGate />} />
    <Route path="/kayit" element={<Setup />} />
    <Route element={<Protected />}>
      <Route path="/sifre" element={<ChangePassword />} />
      <Route element={<AppShell />}>
        <Route path="/cizelge" element={<SchedulePage />} />
        <Route path="/puantaj" element={<PuantajPage />} />
        <Route path="/yonetim" element={<YonetimPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
export { AppRoutes };
