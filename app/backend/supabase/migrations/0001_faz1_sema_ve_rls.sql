-- Puantaj Merkezi — Faz 1 şeması (şartname §6) + RLS politikaları
-- Bu dosya Supabase SQL editöründe ya da SupabaseManager.create_tables ile uygulanır.

-- ---------------------------------------------------------------------------
-- Enum tipleri
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.rol as enum ('isveren', 'bolge', 'sube');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hafta_durum as enum ('acik', 'kapali', 'onayli');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ay_durum as enum ('acik', 'onayli', 'kesin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gun_tip as enum (
    'vardiya', 'haftalik_izin', 'ucretsiz_izin', 'yillik_izin', 'rapor', 'bayram', 'part_bos'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  kullanici_adi text unique not null,
  ad_soyad text not null,
  rol public.rol not null,
  aktif boolean not null default true,
  sifre_degistirmeli boolean not null default true
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  acilis time not null default '11:00',
  kapanis time not null default '00:30',
  gunluk_saat numeric(4, 2) not null,
  haftalik_saat numeric(4, 2) not null,
  aktif boolean not null default true
);

create table if not exists public.user_branches (
  user_id uuid references public.profiles (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete cascade,
  primary key (user_id, branch_id)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  ad_soyad text not null,
  calisma_sekli text not null default 'tam' check (calisma_sekli in ('tam', 'part')),
  ise_giris date not null,
  isten_cikis date
);

create table if not exists public.shifts (
  employee_id uuid references public.employees (id) on delete cascade,
  tarih date,
  branch_id uuid not null references public.branches (id),
  tip public.gun_tip not null,
  baslangic time,
  bitis time,
  saat numeric(4, 2),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (employee_id, tarih),
  check (tip <> 'vardiya' or (baslangic is not null and bitis is not null))
);

create table if not exists public.weeks (
  branch_id uuid references public.branches (id),
  hafta_baslangic date check (extract(isodow from hafta_baslangic) = 1),
  durum public.hafta_durum not null default 'acik',
  kapatan uuid references public.profiles (id),
  kapatma_zamani timestamptz,
  onaylayan uuid references public.profiles (id),
  onay_zamani timestamptz,
  geri_not text,
  primary key (branch_id, hafta_baslangic)
);

create table if not exists public.months (
  branch_id uuid references public.branches (id),
  ay date check (extract(day from ay) = 1),
  durum public.ay_durum not null default 'acik',
  onaylayan uuid references public.profiles (id),
  onay_zamani timestamptz,
  kesin_yapan uuid references public.profiles (id),
  kesin_zamani timestamptz,
  geri_not text,
  kesin_sonuc jsonb,
  primary key (branch_id, ay)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  zaman timestamptz not null default now(),
  kullanici uuid references public.profiles (id),
  branch_id uuid references public.branches (id),
  islem text not null,
  detay jsonb
);

create index if not exists shifts_branch_tarih_idx on public.shifts (branch_id, tarih);
create index if not exists employees_branch_idx on public.employees (branch_id);
create index if not exists user_branches_branch_idx on public.user_branches (branch_id);
create index if not exists audit_log_zaman_idx on public.audit_log (zaman desc);

-- ---------------------------------------------------------------------------
-- Yetki yardımcıları (security definer: RLS özyinelemesini önler)
-- ---------------------------------------------------------------------------
create or replace function public.is_isveren()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.rol = 'isveren' and p.aktif
  );
$$;

create or replace function public.current_rol()
returns public.rol language sql stable security definer set search_path = public as $$
  select p.rol from public.profiles p where p.id = auth.uid() and p.aktif;
$$;

-- Kullanıcının user_branches üzerinden atandığı şube mi? (bolge ve sube için ortak)
create or replace function public.has_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_branches ub
    where ub.user_id = auth.uid() and ub.branch_id = p_branch
  );
$$;

-- İşveren hepsine, bölge/şube müdürü yalnızca atandığı şubelere erişir.
create or replace function public.can_access_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_isveren() or public.has_branch(p_branch);
$$;

-- İlk girişte şifre değişikliği tamamlandığında çağrılır (yalnızca kendi satırı).
create or replace function public.sifre_degistirildi()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum bulunamadı';
  end if;
  update public.profiles set sifre_degistirmeli = false where id = auth.uid();
end;
$$;

-- Her durum değişikliği / düzeltme bu fonksiyonla kaydedilir.
create or replace function public.audit_yaz(
  p_islem text, p_branch uuid default null, p_detay jsonb default null
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (kullanici, branch_id, islem, detay)
  values (auth.uid(), p_branch, p_islem, p_detay);
$$;

-- Kullanıcı kendi profilinde rol/aktif/kullanıcı adı değiştiremez.
create or replace function public.koru_profil_alanlari()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_isveren() then
    if new.rol <> old.rol
       or new.aktif <> old.aktif
       or new.kullanici_adi <> old.kullanici_adi
       or (new.sifre_degistirmeli and not old.sifre_degistirmeli) then
      raise exception 'Bu alanları yalnızca işveren değiştirebilir';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_koru_alanlar on public.profiles;
create trigger profiles_koru_alanlar
  before update on public.profiles
  for each row execute function public.koru_profil_alanlari();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.user_branches enable row level security;
alter table public.employees enable row level security;
alter table public.shifts enable row level security;
alter table public.weeks enable row level security;
alter table public.months enable row level security;
alter table public.audit_log enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.is_isveren()
  or exists (
    select 1
    from public.user_branches mine
    join public.user_branches theirs on theirs.branch_id = mine.branch_id
    where mine.user_id = auth.uid() and theirs.user_id = public.profiles.id
  )
);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
with check (public.is_isveren());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid() or public.is_isveren())
with check (id = auth.uid() or public.is_isveren());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
using (public.is_isveren());

-- branches -------------------------------------------------------------------
drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches for select to authenticated
using (public.is_isveren() or public.has_branch(id));

drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches for all to authenticated
using (public.is_isveren()) with check (public.is_isveren());

-- user_branches --------------------------------------------------------------
drop policy if exists user_branches_select on public.user_branches;
create policy user_branches_select on public.user_branches for select to authenticated
using (
  public.is_isveren()
  or user_id = auth.uid()
  or (public.current_rol() = 'bolge' and public.has_branch(branch_id))
);

drop policy if exists user_branches_write on public.user_branches;
create policy user_branches_write on public.user_branches for all to authenticated
using (public.is_isveren()) with check (public.is_isveren());

-- employees ------------------------------------------------------------------
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated
using (public.can_access_branch(branch_id));

drop policy if exists employees_write on public.employees;
create policy employees_write on public.employees for all to authenticated
using (public.is_isveren()) with check (public.is_isveren());

-- shifts ---------------------------------------------------------------------
drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated
using (public.can_access_branch(branch_id));

-- Yazma: Faz 1'de yalnızca işveren. Faz 4'te hafta/ay kilidi trigger'ları ile
-- birlikte bölge ve şube müdürüne genişletilir (şartname §5).
drop policy if exists shifts_write on public.shifts;
create policy shifts_write on public.shifts for all to authenticated
using (public.is_isveren()) with check (public.is_isveren());

-- weeks ----------------------------------------------------------------------
drop policy if exists weeks_select on public.weeks;
create policy weeks_select on public.weeks for select to authenticated
using (public.can_access_branch(branch_id));

drop policy if exists weeks_write on public.weeks;
create policy weeks_write on public.weeks for all to authenticated
using (public.is_isveren()) with check (public.is_isveren());

-- months ---------------------------------------------------------------------
drop policy if exists months_select on public.months;
create policy months_select on public.months for select to authenticated
using (public.can_access_branch(branch_id));

drop policy if exists months_write on public.months;
create policy months_write on public.months for all to authenticated
using (public.is_isveren()) with check (public.is_isveren());

-- audit_log ------------------------------------------------------------------
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
using (public.is_isveren());
