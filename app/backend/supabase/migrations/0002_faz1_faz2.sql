-- Mesai Çizelgesi - Puantaj · Faz 1 (personel/şube veri modeli) + Faz 2 (izin kodları, saat kuralları)
-- Canlı veritabanındaki tanımlarla birebir aynıdır; tekrar çalıştırılabilir (idempotent).

-- ---------------------------------------------------------------------------
-- 1. Personel alanları
-- ---------------------------------------------------------------------------
alter table public.app_8524c8f4f5_employees
  add column if not exists gorev text not null default 'Mutfak',
  add column if not exists sgk_var boolean not null default true,
  add column if not exists sgk_branch_id uuid references public.app_8524c8f4f5_branches(id) on delete set null,
  add column if not exists baslama date,
  add column if not exists paket_basi numeric,
  add column if not exists sira integer;

do $$ begin
  alter table public.app_8524c8f4f5_employees add column grup text generated always as (
    case when gorev in ('R. Müdür','V. Müdür') then 'M' when gorev = 'Mutfak' then 'K' else 'S' end
  ) stored;
exception when duplicate_column then null; end $$;

alter table public.app_8524c8f4f5_employees drop constraint if exists app_8524c8f4f5_employees_calisma_sekli_check;
alter table public.app_8524c8f4f5_employees drop constraint if exists p_emp_sekli_chk;
alter table public.app_8524c8f4f5_employees drop constraint if exists p_emp_gorev_chk;
alter table public.app_8524c8f4f5_employees drop constraint if exists p_emp_esnaf_chk;
alter table public.app_8524c8f4f5_employees drop constraint if exists p_emp_tarih_chk;
alter table public.app_8524c8f4f5_employees
  add constraint p_emp_sekli_chk check (calisma_sekli in ('tam','part','esnaf')),
  add constraint p_emp_gorev_chk check (gorev in ('R. Müdür','V. Müdür','Mutfak','Kurye','Esnaf Kurye')),
  add constraint p_emp_esnaf_chk check ((gorev = 'Esnaf Kurye') = (calisma_sekli = 'esnaf')),
  add constraint p_emp_tarih_chk check (isten_cikis is null or isten_cikis >= least(baslama, ise_giris));

-- ---------------------------------------------------------------------------
-- 2. Hassas personel bilgisi (TC, IBAN) — ayrı tablo, dar RLS
-- ---------------------------------------------------------------------------
create table if not exists public.app_8524c8f4f5_employee_private (
  employee_id uuid primary key references public.app_8524c8f4f5_employees(id) on delete cascade,
  tc text check (tc is null or tc ~ '^[1-9][0-9]{10}$'),
  iban text check (iban is null or iban ~ '^TR[0-9]{24}$'),
  iban_eski text,
  iban_degisim timestamptz,
  iban_degistiren uuid references public.app_8524c8f4f5_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.p_emp_branch(p_emp uuid) returns uuid
language sql stable security definer set search_path to 'public' as $$
  select branch_id from public.app_8524c8f4f5_employees where id = p_emp;
$$;

create or replace function public.p_private_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.iban_eski := null; new.iban_degisim := null; new.iban_degistiren := null;
  elsif new.iban is distinct from old.iban then
    new.iban_eski := old.iban;
    new.iban_degisim := now();
    new.iban_degistiren := auth.uid();
    insert into public.app_8524c8f4f5_audit_log (kullanici, branch_id, islem, detay)
    values (auth.uid(), public.p_emp_branch(new.employee_id), 'IBAN değiştirildi',
            jsonb_build_object('employee_id', new.employee_id));
  else
    new.iban_eski := old.iban_eski; new.iban_degisim := old.iban_degisim; new.iban_degistiren := old.iban_degistiren;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists p_private_guard_trg on public.app_8524c8f4f5_employee_private;
create trigger p_private_guard_trg before insert or update on public.app_8524c8f4f5_employee_private
  for each row execute function public.p_private_guard();

alter table public.app_8524c8f4f5_employee_private enable row level security;
drop policy if exists p_private_all on public.app_8524c8f4f5_employee_private;
create policy p_private_all on public.app_8524c8f4f5_employee_private for all to authenticated
  using (public.p_is_isveren() or (public.p_rol() = 'bolge' and public.p_can_access_branch(public.p_emp_branch(employee_id))))
  with check (public.p_is_isveren() or (public.p_rol() = 'bolge' and public.p_can_access_branch(public.p_emp_branch(employee_id))));

-- ---------------------------------------------------------------------------
-- 3. Şube ayarları ve ayar geçmişi (haftalık = günlük × 6)
-- ---------------------------------------------------------------------------
alter table public.app_8524c8f4f5_branches
  add column if not exists fm_donem text not null default 'hafta',
  add column if not exists fm_yontem text not null default 'sabit',
  add column if not exists fm_ucret numeric not null default 165,
  add column if not exists ayar_gecmis jsonb not null default '{}'::jsonb;
alter table public.app_8524c8f4f5_branches alter column gunluk_saat set default 8.5;
alter table public.app_8524c8f4f5_branches alter column haftalik_saat set default 51;
alter table public.app_8524c8f4f5_branches drop constraint if exists p_br_donem_chk;
alter table public.app_8524c8f4f5_branches drop constraint if exists p_br_yontem_chk;
alter table public.app_8524c8f4f5_branches
  add constraint p_br_donem_chk check (fm_donem in ('hafta','takvim')),
  add constraint p_br_yontem_chk check (fm_yontem in ('sabit','yuzde'));

create or replace function public.p_branch_ayar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare g jsonb; ak text;
begin
  new.haftalik_saat := round(new.gunluk_saat * 6, 2);
  if tg_op = 'INSERT' then
    new.ayar_gecmis := '{}'::jsonb;
    return new;
  end if;
  if (new.gunluk_saat, new.fm_donem, new.fm_yontem, new.fm_ucret)
     is distinct from (old.gunluk_saat, old.fm_donem, old.fm_yontem, old.fm_ucret) then
    g := coalesce(old.ayar_gecmis, '{}'::jsonb);
    if g = '{}'::jsonb then
      g := jsonb_build_object('2000-01', jsonb_build_object(
        'gunluk_saat', old.gunluk_saat, 'haftalik_saat', old.haftalik_saat,
        'fm_donem', old.fm_donem, 'fm_yontem', old.fm_yontem, 'fm_ucret', old.fm_ucret));
    end if;
    ak := to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM');
    g := g || jsonb_build_object(ak, jsonb_build_object(
        'gunluk_saat', new.gunluk_saat, 'haftalik_saat', new.haftalik_saat,
        'fm_donem', new.fm_donem, 'fm_yontem', new.fm_yontem, 'fm_ucret', new.fm_ucret));
    new.ayar_gecmis := g;
  else
    new.ayar_gecmis := old.ayar_gecmis;
  end if;
  return new;
end;
$$;

drop trigger if exists p_branch_ayar_trg on public.app_8524c8f4f5_branches;
create trigger p_branch_ayar_trg before insert or update on public.app_8524c8f4f5_branches
  for each row execute function public.p_branch_ayar();

-- ---------------------------------------------------------------------------
-- 4. Gün kaydı kuralları (şube bağlılığı, çalışma aralığı, part boş, yarım saat)
-- ---------------------------------------------------------------------------
create or replace function public.p_shift_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare e record;
begin
  select calisma_sekli, ise_giris, baslama, isten_cikis, branch_id into e
  from public.app_8524c8f4f5_employees where id = new.employee_id;
  if not found then raise exception 'Personel bulunamadı'; end if;
  if new.branch_id <> e.branch_id then raise exception 'Personel bu şubeye bağlı değil'; end if;
  if new.tarih < least(e.baslama, e.ise_giris) or (e.isten_cikis is not null and new.tarih > e.isten_cikis) then
    raise exception 'Personel bu tarihte çalışmıyor';
  end if;
  if new.tip = 'part_bos' and e.calisma_sekli <> 'part' then
    raise exception 'Part boş kodu yalnızca part personelde kullanılır';
  end if;
  if new.tip = 'vardiya' and (extract(minute from new.baslangic) not in (0, 30) or extract(minute from new.bitis) not in (0, 30)) then
    raise exception 'Vardiya saatleri yarım saatlik olmalı';
  end if;
  return new;
end;
$$;

drop trigger if exists p_shift_guard_trg on public.app_8524c8f4f5_shifts;
create trigger p_shift_guard_trg before insert or update on public.app_8524c8f4f5_shifts
  for each row execute function public.p_shift_guard();
