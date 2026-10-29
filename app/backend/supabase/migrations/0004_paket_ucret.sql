-- Mesai Çizelgesi - Puantaj · Aşama C: esnaf paket ücreti ayrı (dar yetkili) tabloda
-- Ücret bilgisi TC / IBAN gibi sadece işveren ve şubenin bölge müdürüne açıktır (employee_private RLS).
-- Canlı veritabanına uygulanan tanımla birebir aynıdır; tekrar çalıştırılabilir (idempotent).

alter table public.app_8524c8f4f5_employee_private
  add column if not exists paket_ucret numeric check (paket_ucret is null or paket_ucret >= 0);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_8524c8f4f5_employees' and column_name = 'paket_basi'
  ) then
    insert into public.app_8524c8f4f5_employee_private (employee_id, paket_ucret)
    select id, paket_basi from public.app_8524c8f4f5_employees where paket_basi is not null
    on conflict (employee_id) do update set paket_ucret = excluded.paket_ucret;
    alter table public.app_8524c8f4f5_employees drop column paket_basi;
  end if;
end $$;
