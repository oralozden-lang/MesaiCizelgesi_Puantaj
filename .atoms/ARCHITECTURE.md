# Architecture

## Stack
- Frontend: React 18 + Vite + TypeScript + Tailwind + shadcn/ui, `app/frontend`.
- Backend: Supabase (Postgres + Auth + RLS + Edge Functions).
- Auth model: kullanıcı adı → `kullaniciadi@puantaj-merkezi.app` e-posta eşlemesi; Supabase Auth şifreyi hash'li yönetir, hiçbir tabloda şifre tutulmaz.

## Data Model (Faz 1, şartname §6)
- `app_{session}_{profiles}` benzeri isimlendirme yerine şartnamedeki tablo adları kullanılır: `profiles`, `branches`, `user_branches`, `employees`, `shifts`, `weeks`, `months`, `audit_log`.
- Enum tipleri: `rol`, `hafta_durum`, `ay_durum`, `gun_tip`.
- `profiles.id` → `auth.users.id` (cascade). `sifre_degistirmeli` ilk giriş zorunluluğunu taşır.

## RLS Policy Matrix (Faz 1)
- `profiles`: kişi kendi satırını okur/günceller (`sifre_degistirmeli` dahil); `isveren` tüm satırları okur/yazar; `bolge` yalnızca ortak şubesi olan kullanıcıları okur; `sube` aynı şubedeki kullanıcıları okur.
- `branches`: `isveren` tam yetki; `bolge` ve `sube` yalnızca `user_branches` üzerinden atandıkları şubeleri okur.
- `user_branches`: `isveren` tam yetki; diğerleri kendi atamalarını okur.
- `employees`, `shifts`, `weeks`, `months`: Faz 1'de `isveren` tam yetki, `bolge`/`sube` atandıkları şubeler için okuma; yazma kilitleri Faz 3–4'te trigger ile genişletilir.
- `audit_log`: yalnızca `isveren` okur; ekleme `security definer` fonksiyon/trigger üzerinden.
- Yardımcı fonksiyonlar: `current_rol()`, `has_branch(branch_id)`, `is_isveren()` — `security definer`, `search_path` sabit.

## Edge Functions
- `admin-users`: işveren oturumu doğrulanır (JWT), çağıranın `profiles.rol='isveren'` olduğu DB'den teyit edilir; `auth.admin.createUser` / `updateUserById` ile kullanıcı oluşturma ve şifre sıfırlama. Service role key yalnızca fonksiyon ortamında; frontend'de yalnız `VITE_SUPABASE_ANON_KEY`.
- Çağrı `supabaseUrl` üzerinden `supabase.functions.invoke` ile yapılır, `window.location.origin` kullanılmaz.

## Frontend Structure
- `src/lib/supabase.ts` — tek client.
- `src/lib/auth.tsx` — oturum + profil context'i, `sifre_degistirmeli` yönlendirmesi.
- `src/pages/Login.tsx`, `src/pages/ChangePassword.tsx`, `src/pages/Home.tsx`.
- `src/components/layout/AppShell.tsx` + `TabBar.tsx` — rol bazlı alt sekme çubuğu.
- Rol bazlı erişim: UI gizleme + RLS birlikte.

## Faz 1 Dışı
Çizelge, onay, puantaj ekranları; haftalık/aylık kilit trigger'ları; Excel çıktısı.
