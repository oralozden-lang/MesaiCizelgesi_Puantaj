# Puantaj — Çalışma Planı

Şartname: `attachments/puantaj.md`. Proje özeti: `.wiki.md`. **İş kuralları (tek doğruluk kaynağı): `docs/kurallar.md`.**

## Hedef

EmrePuantaj (Firebase, tek dosya, `github.com/oralozden-lang/EmrePuantaj`) uygulamasının **mantığını** koruyup Supabase üzerinde daha doğru bir yapıyla yeniden yazmak. Veri taşınmaz (test verisi). Öncelik: **stabil çalışma**.

## Hedef Supabase projesi

- Ad: **Puantaj_yeni**
- Proje kimliği: `gsyhuttsaaebwbkfuemb` (`app/frontend/src/lib/supabase.ts`)
- Tablolar `app_8524c8f4f5_` önekli. Puantaj migration'ları Envanter projesine uygulanmaz.
- Her yazma işleminden önce: proje listesinde "Puantaj_yeni" ve kimliğin eşleştiğini, önekli tabloların orada olduğunu doğrula. Eşleşmezse dur ve sor.
- Veriler test verisidir. Kullanıcı, Supabase'i Claude'un yönetmesini ister (SQL'i kullanıcı çalıştırmaz).
- Canlıya geçerken Pro plan gerekir (ücretsiz projeler duruyor, otomatik yedek yok).

## Yayın ve test

- Vercel projesi `mesai-cizelgesi-puantaj` (root `app/frontend`). Her dal için Preview adresi verir; kullanıcı telefondan test eder.
- Test kullanıcıları: `test_bolge`, `test_sube` (işveren: `oral`). İş bitince test kullanıcıları silinir.

## Tasarım ilkeleri (EmrePuantaj'a göre düzeltmeler)

- Hesaplar **sunucuda** (SQL fonksiyonları); tarayıcı yalnızca gösterir. Her hesap `docs/kurallar.md` numarasına bağlı testle doğrulanır; mümkünse EmrePuantaj fonksiyonlarıyla aynı örnek verilerde karşılaştırılır.
- Tarihçeli bilgiler (görev, maaş şubesi, şube ayarı) JSON haritası değil, **"şu tarihten itibaren" satırları**.
- **Tek kişi + çalışma dönemleri**; "aynı kişi mi" tahmini (TC/isim) yok.
- Kullanıcı yönetimi edge function ile; şifre saklanmaz.
- Kod ekran ekran ve modül modül; tek dev dosya yok.
- Her aşama Preview'da kullanıcı onayından sonra bitmiş sayılır.

## Durum

- Aşama A, B tamam. `0003_guvenlik.sql` canlıda ve repoda; istemci audit yazımı kaldırıldı.
- `docs/kurallar.md` yazıldı, kullanıcı kararları işlendi (kurallar.md §14). Açık: saat listesi aralığı, "elle çıkar" ayrıntısı (§15).
- Aşama C tamam: `0004_paket_ucret.sql` (esnaf paket ücreti `employee_private`'a taşındı), kurulum uyarısı (`InstallBanner`), `index.html` şablon kalıntıları temizlendi. Servis çalışanı zaten vardı.
- Güncel migration'lar: `0001_puantaj_tam_sema.sql`, `0002_faz1_faz2.sql`, `0003_guvenlik.sql`, `0004_paket_ucret.sql`.

## Aşamalar

**C — Küçük tamamlamalar**
- Gerçek servis çalışanı (uygulama kabuğu önbelleği), kurulum uyarısı (`beforeinstallprompt`, iOS yönergesi).
- `employees.paket_basi` yalnızca işveren/bölge görsün (ayrı tabloya).
- İsteğe bağlı: ana paket 1,3 MB, kod bölme.

**D — Çizelge ve hafta akışı** (kurallar §2, §3, §4, §7)
- Tek saat listesi, şube açılış/kapanışı yalnızca renk (S-2…S-7).
- Otomatik haftalık liste + elle ekle/çıkar (`hafta_kadro_istisna`), "çalışmadı → ücretsiz izin" (P-12, W-2).
- Kapalı/onaylı haftayı şube müdürüne gizleme (W-1), kapatma kontrol listesi ve teyitler (W-2, W-3, H-7), düzenleme kilidi (K-1), kopyala-yapıştır.

**E — Personel** (kurallar §9)
- Görev, şekil, SGK şubesi, çalıştığı şube, deneme/giriş/çıkış; çakışma kuralı (P-4).
- Tarihçeli görev ve maaş şubesi satırları (P-5, P-6); pasife geçiş (P-7); TC/IBAN doğrulama.

**F — Hesap motoru (sunucuda)** (kurallar §4, §5, §6)
- Haftalık FM, `fm_donem` hafta/takvim, dönem geçişi ve elle dönem sonu (D-1…D-5), ayar geçmişi.
- SGK/bordro günü (G-2…G-8). EmrePuantaj sonuçlarıyla karşılaştırmalı testler.

**G — Puantaj ve ödemeler** (kurallar §8, §10, §11)
- Muhasebe tarafı, ödemeler, veri girişi, onay öncesi kontrol, çizelgeden gelen FM onayı, ay onayı, kesin kapanışta rakamların dondurulması, devir.

**H — Çok şubeli çalışma** (kurallar S-8, H-1, H-8)

**I — Çıktılar ve yönetim**
- PDF/paylaş, IBAN listesi, yedek, veri kontrolü, kullanıcı yönetimi (edge function).

**J — Sonra:** işçilik raporu, bordro PDF okuma, Excel'den toplu aktarım, çevrimdışı kuyruk.

## Doğrulama (her aşamada)

- Üç rol (isveren, bolge, sube) için canlı test: şube ayrımı, kilit matrisi, silme/güncelleme denemeleri.
- `pnpm run lint`, `tsc --noEmit -p tsconfig.app.json`, `pnpm run build`.
- Migration dosyaları canlı şemayla birebir olsun.

## Çalışma kuralları

- Geliştirme `claude/...` dalında, PR ile `main`'e. Birleşen PR'ın dalı `main`'den yeniden başlatılır.
- PR'ı kullanıcı açar/birleştirir, Claude açmasını isterse açar.
- Başka dosya silinmeden önce kullanıcıya sorulur.
