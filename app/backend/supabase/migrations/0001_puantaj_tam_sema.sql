-- Mesai Çizelgesi - Puantaj · tam şema (şartname §6) + ayarlar (§5, §7)
-- Uygulama sırası önemlidir: tipler → tablolar → yardımcı fonksiyonlar → trigger'lar → RLS.
-- Tüm nesneler app_{session_id}_ önekiyle oluşturulur; başka uygulamaların tablolarına dokunmaz.

-- ---------------------------------------------------------------------------
-- 1. Enum tipleri
-- ---------------------------------------------------------------------------
do $$ begin create type public.app_8524c8f4f5_rol as enum ('isveren','bolge','sube'); exception when duplicate_object then null; end $$;
do $$ begin create type public.app_8524c8f4f5_hafta_durum as enum ('acik','kapali','onayli'); exception when duplicate_object then null; end $$;
do $$ begin create type public.app_8524c8f4f5_ay_durum as enum ('acik','onayli','kesin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.app_8524c8f4f5_gun_tip as enum ('vardiya','haftalik_izin','ucretsiz_izin','yillik_izin','rapor','bayram','part_bos'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Tablolar
-- ---------------------------------------------------------------------------
create table if not exists public.app_8524c8f4f5_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  kullanici_adi text unique not null,
  ad_soyad text not null,
  rol public.app_8524c8f4f5_rol not null,
  aktif boolean not null default true,
  sifre_degistirmeli boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_8524c8f4f5_branches (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  acilis time not null default '11:00',
  kapanis time not null default '00:30',
  gunluk_saat numeric(4,2) not null default 7.5,
  haftalik_saat numeric(4,2) not null default 45,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_8524c8f4f5_user_branches (
  user_id uuid not null references public.app_8524c8f4f5_profiles(id) on delete cascade,
  branch_id uuid not null references public.app_8524c8f4f5_branches(id) on delete cascade,
  primary key (user_id, branch_id)
);

create table if not exists public.app_8524c8f4f5_employees (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.app_8524c8f4f5_branches(id) on delete cascade,
  ad_soyad text not null,
  calisma_sekli text not null default 'tam' check (calisma_sekli in ('tam','part')),
  ise_giris date not null,
  isten_cikis date,
  created_at timestamptz not null default now()
);

create table if not exists public.app_8524c8f4f5_shifts (
  employee_id uuid not null references public.app_8524c8f4f5_employees(id) on delete cascade,
  tarih date not null,
  branch_id uuid not null references public.app_8524c8f4f5_branches(id) on delete cascade,
  tip public.app_8524c8f4f5_gun_tip not null,
  baslangic time,
  bitis time,
  saat numeric(4,2),
  updated_by uuid references public.app_8524c8f4f5_profiles(id),
  updated_at timestamptz not null default now(),
  primary key (employee_id, tarih),
  check (tip <> 'vardiya' or (baslangic is not null and bitis is not null))
);

create table if not exists public.app_8524c8f4f5_weeks (
  branch_id uuid not null references public.app_8524c8f4f5_branches(id) on delete cascade,
  hafta_baslangic date not null check (extract(isodow from hafta_baslangic) = 1),
  durum public.app_8524c8f4f5_hafta_durum not null default 'acik',
  kapatan uuid references public.app_8524c8f4f5_profiles(id),
  kapatma_zamani timestamptz,
  onaylayan uuid references public.app_8524c8f4f5_profiles(id),
  onay_zamani timestamptz,
  geri_not text,
  primary key (branch_id, hafta_baslangic)
);

create table if not exists public.app_8524c8f4f5_months (
  branch_id uuid not null references public.app_8524c8f4f5_branches(id) on delete cascade,
  ay date not null check (extract(day from ay) = 1),
  durum public.app_8524c8f4f5_ay_durum not null default 'acik',
  onaylayan uuid references public.app_8524c8f4f5_profiles(id),
  onay_zamani timestamptz,
  kesin_yapan uuid references public.app_8524c8f4f5_profiles(id),
  kesin_zamani timestamptz,
  geri_not text,
  kesin_sonuc jsonb,
  primary key (branch_id, ay)
);

create table if not exists public.app_8524c8f4f5_audit_log (
  id bigint generated always as identity primary key,
  zaman timestamptz not null default now(),
  kullanici uuid references public.app_8524c8f4f5_profiles(id),
  branch_id uuid references public.app_8524c8f4f5_branches(id) on delete cascade,
  islem text not null,
  detay jsonb
);

create index if not exists p_shifts_branch_tarih_idx on public.app_8524c8f4f5_shifts (branch_id, tarih);
create index if not exists p_employees_branch_idx on public.app_8524c8f4f5_employees (branch_id);
create index if not exists p_user_branches_branch_idx on public.app_8524c8f4f5_user_branches (branch_id);
create index if not exists p_audit_zaman_idx on public.app_8524c8f4f5_audit_log (zaman desc);

-- ---------------------------------------------------------------------------
-- 3. Yetki yardımcıları (security definer: RLS özyinelemesini önler)
-- ---------------------------------------------------------------------------
create or replace function public.p_is_isveren() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_8524c8f4f5_profiles p where p.id = auth.uid() and p.rol = 'isveren' and p.aktif);
$$;

create or replace function public.p_rol() returns public.app_8524c8f4f5_rol
language sql stable security definer set search_path = public as $$
  select p.rol from public.app_8524c8f4f5_profiles p where p.id = auth.uid() and p.aktif;
$$;

create or replace function public.p_has_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_8524c8f4f5_user_branches ub where ub.user_id = auth.uid() and ub.branch_id = p_branch);
$$;

create or replace function public.p_can_access_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.p_is_isveren() or public.p_has_branch(p_branch);
$$;

-- Günün ait olduğu haftanın durumu (Pazartesi başlangıç, ISO).
create or replace function public.p_hafta_durum(p_branch uuid, p_tarih date) returns public.app_8524c8f4f5_hafta_durum
language sql stable security definer set search_path = public as $$
  select coalesce((select durum from public.app_8524c8f4f5_weeks
    where branch_id = p_branch and hafta_baslangic = p_tarih - ((extract(isodow from p_tarih)::int) - 1)), 'acik');
$$;

create or replace function public.p_ay_durum(p_branch uuid, p_tarih date) returns public.app_8524c8f4f5_ay_durum
language sql stable security definer set search_path = public as $$
  select coalesce((select durum from public.app_8524c8f4f5_months
    where branch_id = p_branch and ay = date_trunc('month', p_tarih)::date), 'acik');
$$;

-- Şartname §5: gün/tarih bazlı düzenleme kilidi.
create or replace function public.p_can_edit_day(p_branch uuid, p_tarih date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r public.app_8524c8f4f5_rol; hd public.app_8524c8f4f5_hafta_durum; ad public.app_8524c8f4f5_ay_durum;
begin
  if auth.uid() is null or not public.p_can_access_branch(p_branch) then return false; end if;
  r := public.p_rol();
  ad := public.p_ay_durum(p_branch, p_tarih);
  if ad = 'kesin' then return false; end if;
  hd := public.p_hafta_durum(p_branch, p_tarih);
  if hd = 'onayli' then return r = 'isveren'; end if;
  if hd = 'kapali' then return r in ('bolge','isveren'); end if;
  return true;
end;
$$;

create or replace function public.p_audit_yaz(p_islem text, p_branch uuid default null, p_detay jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into public.app_8524c8f4f5_audit_log (kullanici, branch_id, islem, detay) values (auth.uid(), p_branch, p_islem, p_detay);
$$;

create or replace function public.p_sifre_degistirildi() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Oturum bulunamadi'; end if;
  update public.app_8524c8f4f5_profiles set sifre_degistirmeli = false where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Trigger'lar: vardiya süresi, profil koruması, durum geçişleri
-- ---------------------------------------------------------------------------
create or replace function public.p_shifts_saat() returns trigger
language plpgsql as $$
declare d int;
begin
  if new.tip = 'vardiya' and new.baslangic is not null and new.bitis is not null then
    d := (extract(epoch from new.bitis) - extract(epoch from new.baslangic))::int;
    if d <= 0 then d := d + 86400; end if;
    if d <= 0 or d > 86400 then raise exception 'Gecersiz vardiya saati'; end if;
    new.saat := round(d / 3600.0, 2);
  else
    new.saat := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists p_shifts_saat_trg on public.app_8524c8f4f5_shifts;
create trigger p_shifts_saat_trg before insert or update on public.app_8524c8f4f5_shifts
for each row execute function public.p_shifts_saat();

create or replace function public.p_koru_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.p_is_isveren() then
    if new.rol <> old.rol or new.aktif <> old.aktif or new.kullanici_adi <> old.kullanici_adi then
      raise exception 'Bu alanlari yalnizca isveren degistirebilir';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists p_profiles_koru_trg on public.app_8524c8f4f5_profiles;
create trigger p_profiles_koru_trg before update on public.app_8524c8f4f5_profiles
for each row execute function public.p_koru_profil();

create or replace function public.p_week_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.app_8524c8f4f5_rol;
begin
  if auth.uid() is null then return new; end if;
  r := public.p_rol();
  if r is null or not public.p_can_access_branch(new.branch_id) then
    raise exception 'Bu subeye erisim yetkiniz yok';
  end if;
  if tg_op = 'INSERT' then
    if new.durum <> 'acik' then
      if new.durum = 'kapali' and r in ('sube','bolge','isveren') then return new; end if;
      raise exception 'Hafta bu durumda olusturulamaz';
    end if;
    return new;
  end if;
  if new.durum = old.durum then return new; end if;
  if new.durum = 'kapali' and old.durum = 'acik' then
    if r not in ('sube','bolge','isveren') then raise exception 'Yetkisiz'; end if;
  elsif new.durum = 'onayli' and old.durum in ('acik','kapali') then
    if r not in ('bolge','isveren') then raise exception 'Haftayi yalnizca bolge muduru veya isveren onaylar'; end if;
  elsif new.durum = 'acik' and old.durum in ('kapali','onayli') then
    if r not in ('bolge','isveren') then raise exception 'Haftayi yalnizca bolge muduru veya isveren geri gonderebilir'; end if;
    if new.geri_not is null or length(trim(new.geri_not)) = 0 then raise exception 'Geri gonderme notu gerekli'; end if;
  else
    raise exception 'Gecersiz hafta durum gecisi';
  end if;
  return new;
end;
$$;

drop trigger if exists p_weeks_guard_trg on public.app_8524c8f4f5_weeks;
create trigger p_weeks_guard_trg before insert or update on public.app_8524c8f4f5_weeks
for each row execute function public.p_week_guard();

create or replace function public.p_month_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.app_8524c8f4f5_rol; sonraki public.app_8524c8f4f5_ay_durum;
begin
  if auth.uid() is null then return new; end if;
  r := public.p_rol();
  if r is null or not public.p_can_access_branch(new.branch_id) then
    raise exception 'Bu subeye erisim yetkiniz yok';
  end if;
  if tg_op = 'INSERT' then
    if new.durum = 'acik' then return new; end if;
    if new.durum = 'onayli' and r in ('bolge','isveren') then return new; end if;
    raise exception 'Ay bu durumda olusturulamaz';
  end if;
  if new.durum = old.durum then return new; end if;
  if new.durum = 'onayli' and old.durum in ('acik','kesin') then
    if r <> 'isveren' and not (r = 'bolge' and old.durum = 'acik') then raise exception 'Yetkisiz'; end if;
    if old.durum = 'kesin' then
      select coalesce((select durum from public.app_8524c8f4f5_months
        where branch_id = new.branch_id and ay = (new.ay + interval '1 month')::date), 'acik') into sonraki;
      if sonraki = 'kesin' then raise exception 'Sonraki ay kesinlestirildigi icin bu ay acilamaz'; end if;
    end if;
  elsif new.durum = 'kesin' and old.durum = 'onayli' then
    if r <> 'isveren' then raise exception 'Kesin kapanisi yalnizca isveren yapar'; end if;
  elsif new.durum = 'acik' and old.durum = 'onayli' then
    if r not in ('bolge','isveren') then raise exception 'Yetkisiz'; end if;
    if new.geri_not is null or length(trim(new.geri_not)) = 0 then raise exception 'Geri gonderme notu gerekli'; end if;
  else
    raise exception 'Gecersiz ay durum gecisi';
  end if;
  return new;
end;
$$;

drop trigger if exists p_months_guard_trg on public.app_8524c8f4f5_months;
create trigger p_months_guard_trg before insert or update on public.app_8524c8f4f5_months
for each row execute function public.p_month_guard();

-- ---------------------------------------------------------------------------
-- 5. RLS politikaları
-- ---------------------------------------------------------------------------
alter table public.app_8524c8f4f5_profiles enable row level security;
alter table public.app_8524c8f4f5_branches enable row level security;
alter table public.app_8524c8f4f5_user_branches enable row level security;
alter table public.app_8524c8f4f5_employees enable row level security;
alter table public.app_8524c8f4f5_shifts enable row level security;
alter table public.app_8524c8f4f5_weeks enable row level security;
alter table public.app_8524c8f4f5_months enable row level security;
alter table public.app_8524c8f4f5_audit_log enable row level security;

drop policy if exists p_profiles_select on public.app_8524c8f4f5_profiles;
create policy p_profiles_select on public.app_8524c8f4f5_profiles for select to authenticated
using (id = auth.uid() or public.p_is_isveren() or exists (
  select 1 from public.app_8524c8f4f5_user_branches mine
  join public.app_8524c8f4f5_user_branches theirs on theirs.branch_id = mine.branch_id
  where mine.user_id = auth.uid() and theirs.user_id = app_8524c8f4f5_profiles.id));

drop policy if exists p_profiles_update on public.app_8524c8f4f5_profiles;
create policy p_profiles_update on public.app_8524c8f4f5_profiles for update to authenticated
using (id = auth.uid() or public.p_is_isveren()) with check (id = auth.uid() or public.p_is_isveren());

drop policy if exists p_branches_select on public.app_8524c8f4f5_branches;
create policy p_branches_select on public.app_8524c8f4f5_branches for select to authenticated
using (public.p_is_isveren() or public.p_has_branch(id));

drop policy if exists p_branches_write on public.app_8524c8f4f5_branches;
create policy p_branches_write on public.app_8524c8f4f5_branches for all to authenticated
using (public.p_is_isveren()) with check (public.p_is_isveren());

drop policy if exists p_ub_select on public.app_8524c8f4f5_user_branches;
create policy p_ub_select on public.app_8524c8f4f5_user_branches for select to authenticated
using (public.p_is_isveren() or user_id = auth.uid());

drop policy if exists p_ub_write on public.app_8524c8f4f5_user_branches;
create policy p_ub_write on public.app_8524c8f4f5_user_branches for all to authenticated
using (public.p_is_isveren()) with check (public.p_is_isveren());

drop policy if exists p_emp_select on public.app_8524c8f4f5_employees;
create policy p_emp_select on public.app_8524c8f4f5_employees for select to authenticated
using (public.p_can_access_branch(branch_id));

drop policy if exists p_emp_write on public.app_8524c8f4f5_employees;
create policy p_emp_write on public.app_8524c8f4f5_employees for all to authenticated
using (public.p_is_isveren()) with check (public.p_is_isveren());

drop policy if exists p_shifts_select on public.app_8524c8f4f5_shifts;
create policy p_shifts_select on public.app_8524c8f4f5_shifts for select to authenticated
using (public.p_can_access_branch(branch_id));

drop policy if exists p_shifts_insert on public.app_8524c8f4f5_shifts;
create policy p_shifts_insert on public.app_8524c8f4f5_shifts for insert to authenticated
with check (public.p_can_edit_day(branch_id, tarih));

drop policy if exists p_shifts_update on public.app_8524c8f4f5_shifts;
create policy p_shifts_update on public.app_8524c8f4f5_shifts for update to authenticated
using (public.p_can_edit_day(branch_id, tarih)) with check (public.p_can_edit_day(branch_id, tarih));

drop policy if exists p_shifts_delete on public.app_8524c8f4f5_shifts;
create policy p_shifts_delete on public.app_8524c8f4f5_shifts for delete to authenticated
using (public.p_can_edit_day(branch_id, tarih));

drop policy if exists p_weeks_select on public.app_8524c8f4f5_weeks;
create policy p_weeks_select on public.app_8524c8f4f5_weeks for select to authenticated
using (public.p_can_access_branch(branch_id));

drop policy if exists p_weeks_write on public.app_8524c8f4f5_weeks;
create policy p_weeks_write on public.app_8524c8f4f5_weeks for all to authenticated
using (public.p_can_access_branch(branch_id)) with check (public.p_can_access_branch(branch_id));

drop policy if exists p_months_select on public.app_8524c8f4f5_months;
create policy p_months_select on public.app_8524c8f4f5_months for select to authenticated
using (public.p_can_access_branch(branch_id));

drop policy if exists p_months_write on public.app_8524c8f4f5_months;
create policy p_months_write on public.app_8524c8f4f5_months for all to authenticated
using (public.p_can_access_branch(branch_id)) with check (public.p_can_access_branch(branch_id));

drop policy if exists p_audit_select on public.app_8524c8f4f5_audit_log;
create policy p_audit_select on public.app_8524c8f4f5_audit_log for select to authenticated
using (public.p_is_isveren());

drop policy if exists p_audit_insert on public.app_8524c8f4f5_audit_log;
create policy p_audit_insert on public.app_8524c8f4f5_audit_log for insert to authenticated
with check (kullanici = auth.uid() and public.p_can_access_branch(branch_id));
