-- Mesai Çizelgesi - Puantaj · Aşama B: güvenlik sıkılaştırması
-- Canlı veritabanına uygulanan tanımla birebir aynıdır; tekrar çalıştırılabilir (idempotent).
-- PostgREST upsert'i (INSERT ... ON CONFLICT) önce BEFORE INSERT trigger'ını çalıştırır; bu yüzden
-- hafta/ay guard'ları INSERT'te mevcut satırı bulup geçişi ona göre değerlendirir.

-- ---------------------------------------------------------------------------
-- 1. aktif kontrolü: pasif kullanıcı okuyamaz, yazamaz
-- ---------------------------------------------------------------------------
create or replace function public.p_has_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_8524c8f4f5_user_branches ub
    join public.app_8524c8f4f5_profiles p on p.id = ub.user_id
    where ub.user_id = auth.uid() and p.aktif and ub.branch_id = p_branch);
$$;

create or replace function public.p_can_edit_day(p_branch uuid, p_tarih date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r public.app_8524c8f4f5_rol; hd public.app_8524c8f4f5_hafta_durum; ad public.app_8524c8f4f5_ay_durum;
begin
  if auth.uid() is null or not public.p_can_access_branch(p_branch) then return false; end if;
  r := public.p_rol();
  if r is null then return false; end if;
  ad := public.p_ay_durum(p_branch, p_tarih);
  if ad = 'kesin' then return false; end if;
  hd := public.p_hafta_durum(p_branch, p_tarih);
  if hd = 'onayli' then return r = 'isveren'; end if;
  if hd = 'kapali' then return r in ('bolge','isveren'); end if;
  return true;
end;
$$;

drop policy if exists p_profiles_select on public.app_8524c8f4f5_profiles;
create policy p_profiles_select on public.app_8524c8f4f5_profiles for select to authenticated
using (id = auth.uid() or public.p_is_isveren() or (public.p_rol() is not null and exists (
  select 1 from public.app_8524c8f4f5_user_branches mine
  join public.app_8524c8f4f5_user_branches theirs on theirs.branch_id = mine.branch_id
  where mine.user_id = auth.uid() and theirs.user_id = app_8524c8f4f5_profiles.id)));

drop policy if exists p_profiles_update on public.app_8524c8f4f5_profiles;
create policy p_profiles_update on public.app_8524c8f4f5_profiles for update to authenticated
using (public.p_is_isveren() or (id = auth.uid() and public.p_rol() is not null))
with check (public.p_is_isveren() or (id = auth.uid() and public.p_rol() is not null));

drop policy if exists p_ub_select on public.app_8524c8f4f5_user_branches;
create policy p_ub_select on public.app_8524c8f4f5_user_branches for select to authenticated
using (public.p_is_isveren() or (user_id = auth.uid() and public.p_rol() is not null));

-- ---------------------------------------------------------------------------
-- 2. Hafta: DELETE yok, alanlar sunucuda belirlenir, yalnızca kapali → onayli
-- ---------------------------------------------------------------------------
drop policy if exists p_weeks_write on public.app_8524c8f4f5_weeks;
drop policy if exists p_weeks_insert on public.app_8524c8f4f5_weeks;
drop policy if exists p_weeks_update on public.app_8524c8f4f5_weeks;
create policy p_weeks_insert on public.app_8524c8f4f5_weeks for insert to authenticated
with check (public.p_can_access_branch(branch_id));
create policy p_weeks_update on public.app_8524c8f4f5_weeks for update to authenticated
using (public.p_can_access_branch(branch_id)) with check (public.p_can_access_branch(branch_id));

create or replace function public.p_week_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.app_8524c8f4f5_rol;
  ex public.app_8524c8f4f5_weeks%rowtype;
  var_mi boolean := false;
  o_durum public.app_8524c8f4f5_hafta_durum;
begin
  if auth.uid() is null then return new; end if;
  r := public.p_rol();
  if r is null or not public.p_can_access_branch(new.branch_id) then
    raise exception 'Bu subeye erisim yetkiniz yok';
  end if;
  if tg_op = 'UPDATE' then
    if new.branch_id <> old.branch_id or new.hafta_baslangic <> old.hafta_baslangic then
      raise exception 'Hafta anahtari degistirilemez';
    end if;
    ex := old; var_mi := true;
  else
    select * into ex from public.app_8524c8f4f5_weeks
    where branch_id = new.branch_id and hafta_baslangic = new.hafta_baslangic;
    var_mi := found;
  end if;
  o_durum := case when var_mi then ex.durum else 'acik' end;

  if new.durum = o_durum then
    if var_mi then
      new.kapatan := ex.kapatan; new.kapatma_zamani := ex.kapatma_zamani;
      new.onaylayan := ex.onaylayan; new.onay_zamani := ex.onay_zamani; new.geri_not := ex.geri_not;
    else
      new.kapatan := null; new.kapatma_zamani := null; new.onaylayan := null; new.onay_zamani := null; new.geri_not := null;
    end if;
    return new;
  end if;

  if public.p_ay_durum(new.branch_id, new.hafta_baslangic) <> 'acik'
     or public.p_ay_durum(new.branch_id, new.hafta_baslangic + 6) <> 'acik' then
    raise exception 'Ay onayli veya kesin iken hafta durumu degistirilemez';
  end if;

  if new.durum = 'kapali' and o_durum = 'acik' then
    new.kapatan := auth.uid(); new.kapatma_zamani := now();
    new.onaylayan := null; new.onay_zamani := null; new.geri_not := null;
  elsif new.durum = 'onayli' and o_durum = 'kapali' then
    if r not in ('bolge','isveren') then raise exception 'Haftayi yalnizca bolge muduru veya isveren onaylar'; end if;
    new.kapatan := ex.kapatan; new.kapatma_zamani := ex.kapatma_zamani;
    new.onaylayan := auth.uid(); new.onay_zamani := now(); new.geri_not := null;
  elsif new.durum = 'acik' and o_durum in ('kapali','onayli') then
    if r not in ('bolge','isveren') then raise exception 'Haftayi yalnizca bolge muduru veya isveren geri gonderebilir'; end if;
    if new.geri_not is null or length(trim(new.geri_not)) = 0 then raise exception 'Geri gonderme notu gerekli'; end if;
    new.kapatan := null; new.kapatma_zamani := null; new.onaylayan := null; new.onay_zamani := null;
  else
    raise exception 'Gecersiz hafta durum gecisi';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Ay: DELETE yok, alanlar sunucuda belirlenir, onay için dolu haftalar onaylı olmalı
-- ---------------------------------------------------------------------------
drop policy if exists p_months_write on public.app_8524c8f4f5_months;
drop policy if exists p_months_insert on public.app_8524c8f4f5_months;
drop policy if exists p_months_update on public.app_8524c8f4f5_months;
create policy p_months_insert on public.app_8524c8f4f5_months for insert to authenticated
with check (public.p_can_access_branch(branch_id));
create policy p_months_update on public.app_8524c8f4f5_months for update to authenticated
using (public.p_can_access_branch(branch_id)) with check (public.p_can_access_branch(branch_id));

create or replace function public.p_month_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.app_8524c8f4f5_rol;
  ex public.app_8524c8f4f5_months%rowtype;
  var_mi boolean := false;
  o_durum public.app_8524c8f4f5_ay_durum;
  sonraki public.app_8524c8f4f5_ay_durum;
begin
  if auth.uid() is null then return new; end if;
  r := public.p_rol();
  if r is null or not public.p_can_access_branch(new.branch_id) then
    raise exception 'Bu subeye erisim yetkiniz yok';
  end if;
  if tg_op = 'UPDATE' then
    if new.branch_id <> old.branch_id or new.ay <> old.ay then
      raise exception 'Ay anahtari degistirilemez';
    end if;
    ex := old; var_mi := true;
  else
    select * into ex from public.app_8524c8f4f5_months where branch_id = new.branch_id and ay = new.ay;
    var_mi := found;
  end if;
  o_durum := case when var_mi then ex.durum else 'acik' end;

  if new.durum = o_durum then
    if var_mi then
      new.onaylayan := ex.onaylayan; new.onay_zamani := ex.onay_zamani;
      new.kesin_yapan := ex.kesin_yapan; new.kesin_zamani := ex.kesin_zamani;
      new.geri_not := ex.geri_not; new.kesin_sonuc := ex.kesin_sonuc;
    else
      new.onaylayan := null; new.onay_zamani := null; new.kesin_yapan := null; new.kesin_zamani := null;
      new.geri_not := null; new.kesin_sonuc := null;
    end if;
    return new;
  end if;

  if new.durum = 'onayli' and o_durum = 'acik' then
    if r not in ('bolge','isveren') then raise exception 'Yetkisiz'; end if;
    if exists (
      select 1 from public.app_8524c8f4f5_shifts s
      where s.branch_id = new.branch_id
        and s.tarih >= new.ay and s.tarih < (new.ay + interval '1 month')::date
        and not exists (
          select 1 from public.app_8524c8f4f5_weeks w
          where w.branch_id = s.branch_id and w.durum = 'onayli'
            and w.hafta_baslangic = s.tarih - (extract(isodow from s.tarih)::int - 1))
    ) then
      raise exception 'Ayin dolu haftalarinin tamami onayli olmali';
    end if;
    new.onaylayan := auth.uid(); new.onay_zamani := now(); new.geri_not := null;
    new.kesin_yapan := null; new.kesin_zamani := null; new.kesin_sonuc := null;
  elsif new.durum = 'kesin' and o_durum = 'onayli' then
    if r <> 'isveren' then raise exception 'Kesin kapanisi yalnizca isveren yapar'; end if;
    new.onaylayan := ex.onaylayan; new.onay_zamani := ex.onay_zamani; new.geri_not := ex.geri_not;
    new.kesin_yapan := auth.uid(); new.kesin_zamani := now();
  elsif new.durum = 'onayli' and o_durum = 'kesin' then
    if r <> 'isveren' then raise exception 'Yetkisiz'; end if;
    select coalesce((select durum from public.app_8524c8f4f5_months
      where branch_id = new.branch_id and ay = (new.ay + interval '1 month')::date), 'acik') into sonraki;
    if sonraki = 'kesin' then raise exception 'Sonraki ay kesinlestirildigi icin bu ay acilamaz'; end if;
    new.onaylayan := ex.onaylayan; new.onay_zamani := ex.onay_zamani; new.geri_not := ex.geri_not;
    new.kesin_yapan := null; new.kesin_zamani := null; new.kesin_sonuc := ex.kesin_sonuc;
  elsif new.durum = 'acik' and o_durum = 'onayli' then
    if r not in ('bolge','isveren') then raise exception 'Yetkisiz'; end if;
    if new.geri_not is null or length(trim(new.geri_not)) = 0 then raise exception 'Geri gonderme notu gerekli'; end if;
    new.onaylayan := null; new.onay_zamani := null;
    new.kesin_yapan := ex.kesin_yapan; new.kesin_zamani := ex.kesin_zamani; new.kesin_sonuc := ex.kesin_sonuc;
  else
    raise exception 'Gecersiz ay durum gecisi';
  end if;
  return new;
end;
$$;

-- Kesin ay satırı (ve dolayısıyla şube cascade silmesi) silinemez.
create or replace function public.p_months_sil_koru() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.durum = 'kesin' then raise exception 'Kesinlestirilmis ay silinemez'; end if;
  return old;
end;
$$;
drop trigger if exists p_months_sil_koru_trg on public.app_8524c8f4f5_months;
create trigger p_months_sil_koru_trg before delete on public.app_8524c8f4f5_months
for each row execute function public.p_months_sil_koru();

-- ---------------------------------------------------------------------------
-- 4. Vardiya kilidi: kesin aydaki vardiya eklenemez/değişmez/silinemez (cascade dahil)
-- ---------------------------------------------------------------------------
create or replace function public.p_shifts_kilit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and public.p_ay_durum(old.branch_id, old.tarih) = 'kesin' then
    raise exception 'Kesinlestirilmis aydaki vardiya degistirilemez';
  end if;
  if tg_op in ('INSERT','UPDATE') and public.p_ay_durum(new.branch_id, new.tarih) = 'kesin' then
    raise exception 'Kesinlestirilmis aya vardiya yazilamaz';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists p_shifts_kilit_trg on public.app_8524c8f4f5_shifts;
create trigger p_shifts_kilit_trg before insert or update or delete on public.app_8524c8f4f5_shifts
for each row execute function public.p_shifts_kilit();

-- ---------------------------------------------------------------------------
-- 5. Denetim kaydı sunucuda yazılır (tarayıcıdan doğrudan yazma kalktı)
-- ---------------------------------------------------------------------------
drop policy if exists p_audit_insert on public.app_8524c8f4f5_audit_log;

create or replace function public.p_audit_yaz(p_islem text, p_branch uuid default null, p_detay jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.p_rol() is null then raise exception 'Yetkisiz'; end if;
  if p_branch is null then
    if not public.p_is_isveren() then raise exception 'Sube gerekli'; end if;
  elsif not public.p_can_access_branch(p_branch) then
    raise exception 'Bu subeye erisim yetkiniz yok';
  end if;
  insert into public.app_8524c8f4f5_audit_log (kullanici, branch_id, islem, detay) values (auth.uid(), p_branch, p_islem, p_detay);
end;
$$;

create or replace function public.p_weeks_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.app_8524c8f4f5_hafta_durum; islem text;
begin
  o := case when tg_op = 'INSERT' then 'acik' else old.durum end;
  if new.durum is not distinct from o then return null; end if;
  islem := case new.durum
    when 'kapali' then 'Hafta kapatıldı'
    when 'onayli' then 'Hafta onaylandı'
    else 'Hafta geri gönderildi' end || ' (' || new.hafta_baslangic || ')';
  insert into public.app_8524c8f4f5_audit_log (kullanici, branch_id, islem, detay)
  values (auth.uid(), new.branch_id, islem,
          jsonb_build_object('hafta', new.hafta_baslangic, 'not', new.geri_not, 'onceki', o, 'yeni', new.durum));
  return null;
end;
$$;
drop trigger if exists p_weeks_audit_trg on public.app_8524c8f4f5_weeks;
create trigger p_weeks_audit_trg after insert or update on public.app_8524c8f4f5_weeks
for each row execute function public.p_weeks_audit();

create or replace function public.p_months_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.app_8524c8f4f5_ay_durum; islem text;
begin
  o := case when tg_op = 'INSERT' then 'acik' else old.durum end;
  if new.durum is not distinct from o then return null; end if;
  islem := case
    when new.durum = 'onayli' and o = 'kesin' then 'Kesin kapanış açıldı'
    when new.durum = 'onayli' then 'Ay onaylandı'
    when new.durum = 'kesin' then 'Ay kesinleştirildi'
    else 'Ay geri gönderildi' end || ' (' || to_char(new.ay, 'YYYY-MM') || ')';
  insert into public.app_8524c8f4f5_audit_log (kullanici, branch_id, islem, detay)
  values (auth.uid(), new.branch_id, islem,
          jsonb_build_object('ay', to_char(new.ay, 'YYYY-MM'), 'not', new.geri_not, 'onceki', o, 'yeni', new.durum));
  return null;
end;
$$;
drop trigger if exists p_months_audit_trg on public.app_8524c8f4f5_months;
create trigger p_months_audit_trg after insert or update on public.app_8524c8f4f5_months
for each row execute function public.p_months_audit();

-- Kapalı/onaylı haftadaki (veya onaylı aydaki) vardiya düzeltmeleri
create or replace function public.p_shifts_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  eski jsonb; yeni jsonb; v_branch uuid; v_tarih date; v_emp uuid;
  hd public.app_8524c8f4f5_hafta_durum; ad public.app_8524c8f4f5_ay_durum;
begin
  if tg_op <> 'INSERT' then
    eski := jsonb_build_object('tarih', old.tarih, 'tip', old.tip, 'baslangic', old.baslangic, 'bitis', old.bitis);
  end if;
  if tg_op <> 'DELETE' then
    yeni := jsonb_build_object('tarih', new.tarih, 'tip', new.tip, 'baslangic', new.baslangic, 'bitis', new.bitis);
  end if;
  if tg_op = 'UPDATE' and eski = yeni and old.employee_id = new.employee_id then return null; end if;
  v_branch := case when tg_op = 'DELETE' then old.branch_id else new.branch_id end;
  v_tarih  := case when tg_op = 'DELETE' then old.tarih else new.tarih end;
  v_emp    := case when tg_op = 'DELETE' then old.employee_id else new.employee_id end;
  hd := public.p_hafta_durum(v_branch, v_tarih);
  ad := public.p_ay_durum(v_branch, v_tarih);
  if hd = 'acik' and ad = 'acik' then return null; end if;
  if not exists (select 1 from public.app_8524c8f4f5_branches b where b.id = v_branch) then return null; end if;
  insert into public.app_8524c8f4f5_audit_log (kullanici, branch_id, islem, detay)
  values (auth.uid(), v_branch,
          case tg_op when 'INSERT' then 'Vardiya eklendi' when 'DELETE' then 'Vardiya silindi' else 'Vardiya düzeltildi' end
            || ' (' || hd || ' hafta)',
          jsonb_build_object('employee_id', v_emp, 'tarih', v_tarih, 'eski', eski, 'yeni', yeni,
                             'hafta_durum', hd, 'ay_durum', ad));
  return null;
end;
$$;
drop trigger if exists p_shifts_audit_trg on public.app_8524c8f4f5_shifts;
create trigger p_shifts_audit_trg after insert or update or delete on public.app_8524c8f4f5_shifts
for each row execute function public.p_shifts_audit();

-- ---------------------------------------------------------------------------
-- 6. Profil koruması: sifre_degistirmeli kullanıcı tarafından kapatılamaz; şube müdürü tek şube
-- ---------------------------------------------------------------------------
create or replace function public.p_sifre_degistirildi() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.p_rol() is null then raise exception 'Oturum bulunamadi'; end if;
  perform set_config('puantaj.sifre_rpc', '1', true);
  update public.app_8524c8f4f5_profiles set sifre_degistirmeli = false where id = auth.uid();
  perform set_config('puantaj.sifre_rpc', '', true);
end;
$$;

create or replace function public.p_koru_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if not public.p_is_isveren() then
      if new.rol <> old.rol or new.aktif <> old.aktif or new.kullanici_adi <> old.kullanici_adi then
        raise exception 'Bu alanlari yalnizca isveren degistirebilir';
      end if;
    end if;
    if new.sifre_degistirmeli is distinct from old.sifre_degistirmeli
       and coalesce(current_setting('puantaj.sifre_rpc', true), '') <> '1' then
      if not public.p_is_isveren() or (new.id = auth.uid() and not new.sifre_degistirmeli) then
        raise exception 'Sifre bayragi yalnizca sifre degistirilerek kapanir';
      end if;
    end if;
  end if;
  if new.rol = 'sube' and old.rol <> 'sube'
     and (select count(*) from public.app_8524c8f4f5_user_branches where user_id = new.id) > 1 then
    raise exception 'Sube muduru tek subeye bagli olmali';
  end if;
  return new;
end;
$$;

create or replace function public.p_ub_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select rol from public.app_8524c8f4f5_profiles where id = new.user_id) = 'sube'
     and exists (
       select 1 from public.app_8524c8f4f5_user_branches ub
       where ub.user_id = new.user_id and ub.branch_id <> new.branch_id
         and not (tg_op = 'UPDATE' and ub.user_id = old.user_id and ub.branch_id = old.branch_id)) then
    raise exception 'Sube muduru tek subeye bagli olmali';
  end if;
  return new;
end;
$$;
drop trigger if exists p_ub_guard_trg on public.app_8524c8f4f5_user_branches;
create trigger p_ub_guard_trg before insert or update on public.app_8524c8f4f5_user_branches
for each row execute function public.p_ub_guard();

-- ---------------------------------------------------------------------------
-- 7. Yetkiler: anon tabloya/fonksiyona erişemez; tarayıcı silme/denetim yazma yetkisi almaz
-- ---------------------------------------------------------------------------
revoke all on table
  public.app_8524c8f4f5_profiles, public.app_8524c8f4f5_branches, public.app_8524c8f4f5_user_branches,
  public.app_8524c8f4f5_employees, public.app_8524c8f4f5_employee_private, public.app_8524c8f4f5_shifts,
  public.app_8524c8f4f5_weeks, public.app_8524c8f4f5_months, public.app_8524c8f4f5_audit_log
from anon;

revoke truncate, references, trigger on table
  public.app_8524c8f4f5_profiles, public.app_8524c8f4f5_branches, public.app_8524c8f4f5_user_branches,
  public.app_8524c8f4f5_employees, public.app_8524c8f4f5_employee_private, public.app_8524c8f4f5_shifts,
  public.app_8524c8f4f5_weeks, public.app_8524c8f4f5_months, public.app_8524c8f4f5_audit_log
from authenticated;

revoke delete on table public.app_8524c8f4f5_weeks, public.app_8524c8f4f5_months, public.app_8524c8f4f5_audit_log from authenticated;
revoke insert, update on table public.app_8524c8f4f5_audit_log from authenticated;
revoke insert, delete on table public.app_8524c8f4f5_profiles from authenticated;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'p\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Politikaların ve arayüzün çağırdığı yardımcılar/RPC'ler yalnızca oturum açmış kullanıcıya
grant execute on function
  public.p_is_isveren(), public.p_rol(), public.p_has_branch(uuid), public.p_can_access_branch(uuid),
  public.p_hafta_durum(uuid, date), public.p_ay_durum(uuid, date), public.p_can_edit_day(uuid, date),
  public.p_emp_branch(uuid), public.p_audit_yaz(text, uuid, jsonb), public.p_sifre_degistirildi()
to authenticated;
