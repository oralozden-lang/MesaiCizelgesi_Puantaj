# Puantaj PWA — Şartname (v1)

## 1. Amaç
Şubelerde haftalık mesai çizelgesi (vardiya) girilir. Bu çizelgelerden aylık puantaj ve fazla mesai otomatik oluşur. Uygulama **telefonda PWA olarak** kullanılacak. Önce mobil tasarlanır, masaüstü ikinci planda.

## 2. Teknik yapı
- **Arayüz:** React + Vite + Tailwind, `vite-plugin-pwa` ile PWA (ana ekrana eklenebilir, tam ekran, simge).
- **Veritabanı ve giriş:** Supabase (Postgres + Auth + RLS). Yetkiler **veritabanında RLS ile** uygulanır, sadece arayüzde gizlenmez.
- **Yayın:** GitHub → Vercel.
- **Dil:** Arayüz Türkçe. Tarih/saat formatı Türkiye, hafta **Pazartesi** başlar.
- **Bağlantı:** v1'de yazma işlemleri için internet gerekir. Bağlantı yoksa net uyarı gösterilir, veri kaybolmaz. Çevrimdışı kuyruk sonraki aşamadır.

## 3. Roller
| Rol | Kimdir | Erişim |
|---|---|---|
| `isveren` | Sahip | Tüm şubeler, tüm işlemler |
| `bolge` | Bölge müdürü | Kendisine atanan şubeler |
| `sube` | Şube müdürü | Sadece kendi şubesi |

Giriş: kullanıcı adı + şifre. Kullanıcı adı arka planda `kullaniciadi@puantaj-merkezi.app` e-postasına çevrilir (gerçek e-posta gerekmez).

**Şifre kuralı:** Şifreler hiçbir yerde okunabilir biçimde saklanmaz ve kimseye gösterilmez. Kullanıcı oluşturma ve şifre sıfırlama, işverenin çağırdığı bir **Supabase Edge Function** ile yapılır (service key arayüzde asla bulunmaz). İşveren geçici şifre belirler, kullanıcı ilk girişte değiştirir.

## 4. Durum akışları

### Hafta (`weeks.durum`)
`acik` → `kapali` → `onayli`
- Şube müdürü haftayı **kapatır** (`acik → kapali`).
- Bölge müdürü veya işveren haftayı **onaylar** (`kapali → onayli`).
- Bölge/işveren, haftayı **notla geri gönderir** (`kapali/onayli → acik`, `geri_not` dolar).

### Ay (`months.durum`)
`acik` → `onayli` → `kesin`
- Bölge müdürü veya işveren ayı **onaylar** (`acik → onayli`). Şart: ayın bütün dolu haftaları `onayli` olmalı.
- Sadece **işveren** `kesin` yapar (`onayli → kesin`).
- Ay notla geri gönderilebilir (`onayli → acik`). Sadece işveren `kesin`'i açabilir (`kesin → onayli`), sonraki ay `kesin` ise açılamaz.

## 5. Düzenleme kilidi
| Durum | Şube müdürü | Bölge müdürü | İşveren |
|---|---|---|---|
| Hafta `acik` | düzenler | düzenler | düzenler |
| Hafta `kapali` | düzenleyemez | düzenler | düzenler |
| Hafta `onayli` | düzenleyemez | düzenleyemez | düzenler |
| Ay `kesin` (o aya değen günler) | hiç kimse düzenleyemez, önce işveren kesini açar | | |

Kilit **gün/tarih bazındadır**: bir gün, ait olduğu haftanın ve ayın durumuna bakılarak kontrol edilir. Bu kural veritabanında (RLS + trigger) uygulanır.
Her durum değişikliği ve onaylı/kapalı haftadaki düzeltme `audit_log`'a yazılır (kim, ne zaman, ne).

## 6. Veri modeli (Supabase)
```sql
create type rol         as enum ('isveren','bolge','sube');
create type hafta_durum as enum ('acik','kapali','onayli');
create type ay_durum    as enum ('acik','onayli','kesin');
create type gun_tip     as enum ('vardiya','haftalik_izin','ucretsiz_izin','yillik_izin','rapor','bayram','part_bos');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  kullanici_adi text unique not null,
  ad_soyad text not null,
  rol rol not null,
  aktif boolean not null default true,
  sifre_degistirmeli boolean not null default true
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  acilis time not null default '11:00',
  kapanis time not null default '00:30',
  gunluk_saat numeric(4,2) not null,
  haftalik_saat numeric(4,2) not null,
  aktif boolean not null default true
);

create table user_branches (          -- bolge ve sube mudurlerinin erisebildigi subeler
  user_id uuid references profiles on delete cascade,
  branch_id uuid references branches on delete cascade,
  primary key (user_id, branch_id)
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches,
  ad_soyad text not null,
  calisma_sekli text not null default 'tam' check (calisma_sekli in ('tam','part')),
  ise_giris date not null,
  isten_cikis date
);

create table shifts (                 -- kisi basina gunde 1 kayit
  employee_id uuid references employees on delete cascade,
  tarih date,
  branch_id uuid not null references branches,
  tip gun_tip not null,
  baslangic time,
  bitis time,
  saat numeric(4,2),                  -- vardiyada hesaplanir (bkz. 7)
  updated_by uuid references profiles,
  updated_at timestamptz not null default now(),
  primary key (employee_id, tarih),
  check (tip <> 'vardiya' or (baslangic is not null and bitis is not null))
);

create table weeks (
  branch_id uuid references branches,
  hafta_baslangic date check (extract(isodow from hafta_baslangic) = 1),
  durum hafta_durum not null default 'acik',
  kapatan uuid references profiles, kapatma_zamani timestamptz,
  onaylayan uuid references profiles, onay_zamani timestamptz,
  geri_not text,
  primary key (branch_id, hafta_baslangic)
);

create table months (
  branch_id uuid references branches,
  ay date check (extract(day from ay) = 1),
  durum ay_durum not null default 'acik',
  onaylayan uuid references profiles, onay_zamani timestamptz,
  kesin_yapan uuid references profiles, kesin_zamani timestamptz,
  geri_not text,
  kesin_sonuc jsonb,                  -- kesinlesme aninda puantaj sonucu dondurulur
  primary key (branch_id, ay)
);

create table audit_log (
  id bigint generated always as identity primary key,
  zaman timestamptz not null default now(),
  kullanici uuid references profiles,
  branch_id uuid references branches,
  islem text not null,
  detay jsonb
);
```
Not: Haftalık kadro tablosu **yok**. Bir kişi, `ise_giris` ve `isten_cikis` tarihleri arasındaki her günde çizelgede görünür. Bir kişi tek şubeye bağlıdır (v1).

## 7. Hesaplama kuralları
- **Vardiya saati:** `bitis <= baslangic` ise gece vardiyasıdır, süre `bitis + 24 − baslangic`. Örn. `18:00-02:30` = 8,5 saat.
- **Saat girişi:** Şubenin açılış–kapanış aralığında yarım saatlik seçim. Kapanıştan 30 dk sonrasına kadar izin verilir.
- **Haftalık özet (kişi başına):** toplam saat, çalışılan gün, izin/rapor/bayram günleri, fazla mesai.
- **Fazla mesai (eski sistemden alınan formül, DOĞRULANACAK):**
  `fm = toplam_saat − (çalışılan_gün + sayılan_boş_gün) × gunluk_saat + bonus`
  `bonus = 7 gün de vardiyalıysa 7 × gunluk_saat − haftalik_saat, değilse 0`
- **Aylık puantaj:** Her kişi için çalışılan gün, toplam saat, fazla mesai saati, izin/rapor/bayram gün sayıları.
  Gün ve saat sayıları takvim ayına göre tarih bazlı toplanır. Haftalık fazla mesai, haftanın **Pazartesi gününün ayına** yazılır (eski sistemdeki davranış, DOĞRULANACAK).
- **Dışa aktarma:** Aylık puantaj Excel (.xlsx) olarak indirilir.

## 8. Ekranlar (mobil öncelikli)
1. **Giriş** (kullanıcı adı + şifre, ilk girişte şifre değiştirme).
2. **Şube seçimi** (sadece birden fazla şubesi olan roller).
3. **Çizelge:** Üstte hafta seçici (◀ ▶), kişi listesi. Kişiye dokununca 7 günlük kart açılır. Güne dokununca saat seçici ve hızlı kod butonları (İzin, Rapor, Yıllık izin, Bayram…). "Önceki haftadan kopyala" düğmesi. Haftalık toplamlar ve fazla mesai canlı görünür.
4. **Hafta işlemleri:** Haftayı kapat / onayla / notla geri gönder. Kapatmadan önce kontrol listesi (boş hücre uyarısı).
5. **Aylık puantaj:** Kişi satırları, toplamlar, ay onayı ve kesin kapanış, Excel indir.
6. **Yönetim** (işveren): Şubeler (saatler, günlük/haftalık saat), personel, kullanıcılar ve şube atamaları, şifre sıfırlama.
7. **Günlük/İşlem kaydı:** işveren değişiklik geçmişini görür.

Tasarım: büyük dokunma alanları (en az 44 px), alt sekme çubuğu, tek elle kullanım, koyu/açık tema.

## 9. v1 dışında (sonraki aşamalar)
Maaş ve IBAN yönetimi, çok şubeli personel, SGK şube devri, esnaf/paket başı ücret, bordro/pusula OCR, Excel'den toplu aktarım, çevrimdışı yazma kuyruğu, bildirimler.

## 10. Geliştirme aşamaları (her aşama bitince test edilir)
1. Supabase tabloları, RLS, giriş, 3 rol, kullanıcı oluşturma/şifre sıfırlama (Edge Function).
2. Şube ve personel yönetimi.
3. Haftalık çizelge ekranı ve hesaplama.
4. Hafta kapat / onayla / geri gönder ve kilit kuralları.
5. Aylık puantaj, ay onayı, kesin kapanış, Excel çıktısı.
6. PWA cilası: simge, tam ekran, kurulum uyarısı, hata/yükleniyor durumları.

## 11. Doğrulanacaklar (eski uygulamayla)
- Fazla mesai formülündeki "sayılan boş gün" kuralı.
- Eski uygulamadaki izin kodlarının tam listesi (kodda `UI` ve `CG` görüldü).
- Haftanın hangi aya yazıldığı (Pazartesi kuralı).
- Şube bazlı özel ayarlar (örn. `sonSaat`) v1'de gerekli mi.
