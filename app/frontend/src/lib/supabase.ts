import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://gsyhuttsaaebwbkfuemb.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzeWh1dHRzYWFlYndia2Z1ZW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMTc0MDcsImV4cCI6MjEwODc5MzQwN30.YeRi-qZNJyw-JCFRm-Evny6kOh6faq-EiU-qQzeHSeA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** Oturum önekli tablo adları (tek yerden yönetilir). */
export const T = {
  profiles: 'app_8524c8f4f5_profiles',
  branches: 'app_8524c8f4f5_branches',
  userBranches: 'app_8524c8f4f5_user_branches',
  employees: 'app_8524c8f4f5_employees',
  shifts: 'app_8524c8f4f5_shifts',
  weeks: 'app_8524c8f4f5_weeks',
  months: 'app_8524c8f4f5_months',
  audit: 'app_8524c8f4f5_audit_log',
  private: 'app_8524c8f4f5_employee_private',
} as const;

const USER_FN = 'app_8524c8f4f5_kullanici';

/** Bağlı projenin referansı — hata ayıklamada hangi backend'e gidildiğini gösterir. */
export const PROJE_REF = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(SUPABASE_URL)?.[1] ?? 'bilinmiyor';

export interface FnResult<T = Record<string, unknown>> {
  ok?: boolean;
  error?: string;
  kurulum_gerekli?: boolean;
  id?: string;
  data?: T;
}

/** Kullanıcı yönetimi edge function çağrısı. */
export async function callUserFn<T = Record<string, unknown>>(
  body: Record<string, unknown>
): Promise<FnResult<T>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${USER_FN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      error: `Sunucuya ulaşılamadı (proje: ${PROJE_REF}). Bağlantınızı kontrol edip tekrar deneyin.`,
    };
  }

  const json = (await res.json().catch(() => ({}))) as FnResult<T>;
  if (json.error) return json;
  if (!res.ok) {
    return {
      error: `Sunucu yanıt vermedi (kod ${res.status}, proje: ${PROJE_REF}). Sayfayı yenileyip tekrar deneyin.`,
    };
  }
  return json;
}

/** Tarayıcıda kalan eski oturum ve önbelleği temizleyip sayfayı yeniler. */
export async function onbellegiSifirla(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // oturum yoksa yok say
  }
  try {
    if ('serviceWorker' in navigator) {
      const kayitlar = await navigator.serviceWorker.getRegistrations();
      await Promise.all(kayitlar.map((kayit) => kayit.unregister()));
    }
    if ('caches' in window) {
      const anahtarlar = await caches.keys();
      await Promise.all(anahtarlar.map((anahtar) => caches.delete(anahtar)));
    }
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // temizlik başarısız olsa da sayfa yenilenir
  }
  const temiz = new URL(window.location.href);
  temiz.searchParams.set('v', String(Date.now()));
  window.location.replace(temiz.toString());
}
