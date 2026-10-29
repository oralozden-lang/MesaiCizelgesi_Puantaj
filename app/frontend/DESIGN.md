# Puantaj Merkezi — Tasarım Sistemi

## Direction & Layout

**Ürün ve ruh hali:** Şube müdürlerinin telefondan haftalık vardiya çizelgesi girip aylık puantaj ürettiği operasyonel bir araç. İlk bakışta "kâğıt puantaj defterinin yerini alan, sahada tek elle kullanılan" bir his vermeli. Sakin, tok, güvenilir; dekoratif değil. Kesinlikle "AI ürünü dashboard" hissi (mor/mavi gradyanlar, cam efektli kartlar, ikon ızgaraları) verilmemeli.

**Tanımlayıcı görsel fikir:** "Vardiya şeridi" — ekranın üstünde ince, yatay bir gün şeridi; gün hücreleri hafta durumunu (açık/kapalı/onaylı) renk koduyla gösterir. Bu şerit, alt sekme çubuğuyla birlikte ürünün imzası. Giriş ekranında ise sol üstte dikey "saat çizgisi" çentiği + büyük tipografik başlık kullanılır.

**Hiyerarşi ve odak:** Her ekranda tek baskın öğe. Girişte başlık + form; ana ekranda "bugünün haftası" özet kartı; yönetimde kullanıcı listesi. Marka yüzeyleri (giriş, boş durumlar) kimlik taşır; tablo/form yüzeyleri nötr ve öngörülebilir kalır.

**Yerleşim:** Mobil tek kolon, yatay padding 20px, dikey blok aralığı 20px, kart içi padding 18px. İçerik maksimum genişlik 480px; masaüstünde (≥1024px) ortalanmış 480px "telefon kolonu" + sağda 320px ikincil panel alanı, böylece PWA mobil karakterini korur. 768–1023px arası 560px kolon. Alt sekme çubuğu sabit, yüksekliği 64px + `env(safe-area-inset-bottom)`.

**Yapılacaklar:** 44px altı olmayan dokunma alanları; tek elle erişim için birincil eylemler ekranın altına yakın; durum bilgisini her zaman renk + metin birlikte ver.
**Yapılmayacaklar:** Gölgeli "glow" kartlar, gradyan butonlar, 12px altı gövde metni, ikon-only birincil eylemler, masaüstü tablo yoğunluğunu mobile taşımak.

## Tokens

**Renkler (açık tema, varsayılan):**
- `--bg` `#F5F3EE` — sayfa zemini (sıcak kırık beyaz, gözü yormaz)
- `--surface` `#FFFFFF`, `--surface-2` `#EDEAE3` — kart ve ikincil yüzeyler
- `--ink` `#141D1B` — ana metin; `--ink-soft` `#5A6360` — ikincil metin; `--line` `#DFDBD2` — kenarlık
- `--primary` `#0E5A4E` (derin petrol yeşili), `--primary-press` `#0A463C`, `--primary-soft` `#E3EFEA`
- `--accent` `#D9852B` (amber) — yalnızca "kapalı/dikkat" durumu ve tek vurgu
- Durumlar: `acik` `#6B716D`, `kapali` `#D9852B`, `onayli` `#2C7A5B`, `kesin` `#274C77`, `hata` `#B23A34`
- Metin/arka plan kontrastı her yerde ≥ 4.5:1; `--primary` üzerine yalnızca beyaz metin.

**Koyu tema:** `--bg` `#101614`, `--surface` `#19211F`, `--surface-2` `#222B29`, `--ink` `#EDEFEA`, `--line` `#2E3835`, primary `#3FA08D`, accent `#E0A257`.

**Tipografi:** Başlıklar **Manrope** (700/800, sıkı harf aralığı `-0.02em`), gövde **Figtree** (400/500/600). Her ikisi de latin-ext ile Türkçe karakterleri destekler.
- Ekran başlığı 26px/1.15/800; bölüm başlığı 17px/1.3/700; gövde 15px/1.55/400; etiket 13px/1.2/600 (harf aralığı `0.04em`, büyük harf); ipucu 13px/1.45/400 `--ink-soft`; sayısal özet 30px/1.05/800 (`font-variant-numeric: tabular-nums`).
- Form alanları 16px (iOS zoom'unu engeller).

**Boşluk ve biçim:** Ölçek 4/8/12/16/20/24/32. Buton yüksekliği 48px (radius 14px), input 48px (12px), kart 20px radius + 1px `--line` kenarlık, alt sekme 64px, avatar/rozet tam yuvarlak.

**Derinlik:** Gölge yerine kenarlık + yüzey farkı. Yalnızca yüzen katmanlarda (`--shadow-float`: `0 12px 32px rgba(20,29,27,.14)`) gölge. Alt sekme çubuğu üst kenarlık + `backdrop-filter: blur(12px)` (yalnızca burada).

## Shared Patterns & States

- **Buton:** `primary` (dolu petrol yeşili/beyaz metin), `secondary` (`--surface` + kenarlık + `--ink`), `ghost` (metin), `danger` (hata rengi). Yükleniyor durumunda etiket "…" ile spinner; devre dışı %45 opaklık ve `not-allowed`.
- **Alan (input/select):** 48px, etiket üstte, hata durumunda `--hata` kenarlık + altta 13px açıklama; odak halkası `2px var(--primary)` + 2px offset.
- **Durum rozeti:** hap biçimli, `--surface-2` zemin, renkli nokta + Türkçe etiket (Açık/Kapalı/Onaylı/Kesin). Asla yalnızca renk.
- **Bilgi kartı:** beyaz yüzey, 1px kenarlık, 18px padding; başlık + tek satır açıklama + sağda eylem.
- **Alt sekme çubuğu:** 4 sekme (Ana, Çizelge, Puantaj, Yönetim), 24px ikon + 11px etiket, aktif sekmede `--primary` ve 2px üst gösterge. Rol yetkisi olmayan sekme gizlenir.
- **Uyarı bandı (çevrimdışı/bağlantı hatası):** `--accent` %12 zemin, amber metin, ikon + kısa Türkçe mesaj, kapatılamaz.
- **Boş durum:** küçük ikon, tek cümle başlık, bir cümle açıklama, varsa tek eylem.
- **Hareket:** 160ms `ease-out` geçişler; yalnızca basma (`scale .98`), sekme içeriği geçişi ve toast. Veri tablolarında animasyon yok. Hareket kapalıysa tüm içerik görünür kalır.
- **Erişilebilirlik:** tüm dokunma hedefleri ≥44px, ikon butonlarda `aria-label`, form hatalarında `aria-invalid` + metinsel açıklama, `:focus-visible` her zaman görünür, klavye sırası DOM sırasıyla aynı.

## Media

Bu ürün bir operasyon aracıdır; ekranlarda fotoğraf kullanılmaz ve dekoratif illüstrasyon yer almaz. Görsel kimlik tipografi, yüzey dokusu ve vardiya şeridiyle kurulur. Tek görsel öğe, giriş ekranındaki ince SVG saat çizgisi ve PWA simgesidir. Soyut gradyanlar kabul edilmez.
