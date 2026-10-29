# İş kuralları (EmrePuantaj'dan çıkarılan, Supabase sürümü için)

Bu belge **tek doğruluk kaynağıdır**. Kaynak: EmrePuantaj `app.js` (v180), `firestore.rules`, `KURULUM.md`.
Hesap kurallarının her biri bir numara taşır (`H-`, `S-`, ...); testler bu numaralara göre yazılır.

**Durum işaretleri:** ✅ mevcut uygulamada var · ◐ kısmen var · ⬜ yok · ❓ onayınız gerekiyor

> Okuma notu: Bordro PDF/OCR okuma, Excel aktarma ve işçilik raporunun ayrıntıları bu belgeye alınmadı (sonraki aşama).
> Ödeme formülleri ve ay akışı kodun kendisinden çıkarıldı; yanlış gördüğünüz yeri işaretleyin.

---

## 1. Temel kavramlar

| Kavram | Kural |
|---|---|
| Hafta | **Pazartesi** başlar, Pazar biter. |
| Çalışan gün | Kişi, `ilkGun ≤ tarih ≤ çıkış` aralığında çizelgede görünür. `ilkGun` = deneme başlangıcı ile SGK girişinden **önce olanı**. Çıkış yoksa süresiz. |
| Gün kaydı | Bir kişinin bir günü: **vardiya** (`11:00-19:30`) ya da bir kod. Hücre boşsa kayıt yok. |
| Günlük saat | Şube ayarı, varsayılan **8,5**. |
| Haftalık saat | **Günlük × 6** (ayrı ayar yok, otomatik). Varsayılan 51. |

### Gün kodları
| Kod | Anlam | Not |
|---|---|---|
| `HT` | Haftalık izin | |
| `R` | Rapor | |
| `UI` | Ücretsiz izin | |
| `YI` | Yıllık izin | |
| `B` | Bayram | |
| `CG` | Part boş ("çalışma günü değil") | **Yalnızca part personelde** seçilir. Ücrete, SGK gününe, fazla mesaiye etkisi yok; sadece günün "boş" sayılmasını önler. |
| `D` | Diğer | **Kaldırıldı.** Yeni seçilemez. (Şartname §11 sorusunun cevabı.) |

Kural **G-1:** Vardiya olmayan kodlar "dolu hücre" sayılır; boş gün değildir ve beklenen gün sayısına girmez.

---

## 2. Saat kuralları

- **S-1 Yarım saat.** Başlangıç ve bitiş dakikası yalnızca `00` veya `30`.
- **S-2 Tek saat listesi (KARAR).** Saat listesi **bütün şubeler için ortak, tek bir yarım saatlik listedir**. Şubeye göre liste değişmez. **Aralık (ilk ve son saat) işveren tarafından Yönetim panelinde belirlenir ve istendiğinde değiştirilebilir** (varsayılan 10:00 – 03:30). Son saat ilk saatten küçük/eşitse ertesi güne taşar. Mevcut vardiyalar değişmez; aralık daraltılırsa dışarıda kalan eski kayıtlar çizelgede uyarı rengiyle görünür ve düzeltilene kadar kapatmayı engellemez (❓ ayrıntı D aşamasında). *(EmrePuantaj'da liste şubenin açılış/kapanışına göre üretiliyordu; bu kalktı.)*
  - **Veri:** tek satırlık genel ayar tablosu (`sistem_ayar`: `saat_ilk`, `saat_son`); yalnızca işveren yazar, tüm giriş yapmış kullanıcılar okur.
- **S-3 Pay / ileri tarih sınırı kalktı (KARAR).** EmrePuantaj'daki "bugün ve geçmişte ±1 saat pay, ileri tarihte pay yok" ayrımı ve "erken/geç" turuncu işareti **yoktur**; tek liste her gün geçerlidir.
- **S-4 Gece vardiyası.** `bitiş ≤ başlangıç` ise süre `bitiş + 24 − başlangıç`. Örnek: `18:00-02:30` = 8,5 saat.
- **S-5 Azami süre.** Bir vardiya en çok **16 saat** olabilir.
- **S-6 Şube açılış/kapanış saati yalnızca renklendirme içindir (KARAR).** Şube ayarında yalnızca `açılış` ve `kapanış` tutulur ve değiştirilir. Çizelgede: başlangıç ≤ açılış → **açılış vardiyası** rengi; bitiş ≥ kapanış → **kapanış vardiyası** rengi. Saat seçimini kısıtlamaz.
- **S-7 `sonSaat` kaldırıldı (KARAR).** Tek liste olduğu için gerekmez.
- **S-8 Aynı gün tek şube.** Bir kişi aynı günde iki şubede vardiyalı olamaz; vardiya ile başka şubedeki rapor/ücretsiz/yıllık izin de çakışır. (Bizde `shifts` anahtarı `(kişi, tarih)` olduğu için veritabanı bunu kendiliğinden sağlar.)

Durum: S-1, S-4, S-5 ✅ · S-2, S-3, S-7 ⬜ (mevcut uygulama şube saatine göre liste üretiyor, değişecek) · S-6 ◐ · S-8 ✅ (anahtarla).

---

## 3. Boş gün (eksi mesai) — *Şartname §11 cevabı*

**H-1 Boş gün tanımı (fazla mesai hesabı için).** Bir gün **boş gün** sayılır ancak ve ancak:
1. Kişi o gün **çalışan gün** ise (madde 1), **ve**
2. hücre boşsa, **ve**
3. o hafta kişinin **en az bir dolu hücresi** varsa (kaydı olmayan hafta hiç hesaba girmez, fazla mesai 0).

Esnaf kuryede boş gün sayılmaz (FM zaten yok).

Ek koşul (çok şubeli, sonraki aşama): kişi o gün başka şubede kayıtlıysa boş sayılmaz; boş gün yalnızca **maaşının ödendiği şubede** beklenir.

**H-2** Boş gün, haftalık hesapta `günlük saat` kadar **eksi mesai** üretir (aşağıda formül).

**H-3 Hafta kapatma engeli.** Kapanış kontrolünde boş gün varsa hafta **kapatılamaz**. Burada kural H-1'den **daha sıkıdır**: esnaf olmayan bir kişinin satırı tamamen boş olsa bile (hiç dolu hücre yok) çalışan günleri boş gün sayılır ve hafta kapanmaz; böylece listeye eklenip unutulan kişi fark edilir. Esnaf kuryede yalnızca satırında en az bir dolu hücre varsa boş gün sayılır.

**H-4 Hiç açılmamış hafta** (örn. sistemin başladığı haftadan önceki günler): ay kontrolünde o ay günleri de boş sayılır, esnaf hariç.

Durum: H-1/H-2 ✅ · H-3 ◐ (bizde esnaf ve çok şubeli istisnası yok) · H-4 ⬜.

---

## 4. Haftalık fazla mesai (FM)

```
fm = toplam_çalışılan_saat − (vardiyalı_gün + boş_gün) × günlük + bonus
bonus = (haftanın 7 günü de vardiyalı ise)  7 × günlük − haftalık   ;  değilse 0
```
Varsayılan: günlük 8,5 · haftalık 51 · bonus = 59,5 − 51 = **8,5**.

**Örnekler (günlük 8,5):**
| Hafta | Hesap | FM |
|---|---|---|
| 6 gün × 8,5 sa, 1 gün `HT` | 51 − 6×8,5 | **0** |
| 7 gün × 8,5 sa (izin yok) | 59,5 − 7×8,5 + 8,5 | **+8,5** |
| 6 gün × 9,5 sa, 1 gün `HT` | 57 − 6×8,5 | **+6** |
| 5 gün × 8,5 sa, 1 gün boş, 1 gün `HT` | 42,5 − 6×8,5 | **−8,5** |
| Hiç dolu hücre yok | — | **0** (hafta kaydı yok) |

- **H-5** İzin/rapor/bayram/yıllık/ücretsiz/`CG` günleri **ne artı ne eksi**: beklenen gün sayısına girmez.
- **H-6 Part ve esnaf kuryede FM yoktur** (0). Part'ta çalışılan saat gösterilir.
- **H-7 Bonus şartı:** kişi o hafta 7 günün hepsinde çalışan günde ve her gün vardiyalı olmalı (başka şubedeki vardiya da sayılır). Kapatmadan önce şube müdürü **teyit eder** ("İzin kullanmadan 7 gün çalışanlar"); teyitsiz hafta kapanmaz.
- **H-8 Bonus hangi şubeye yazılır:** 7 günün hepsi bu şubedeyse bu şube; değilse maaş şubesi dışında çalışılan **son günün** şubesi; yoksa maaş şubesi.
- **H-9 Kişi başı eksi FM** hafta kapatma sırasında bilgi olarak gösterilir (engel değildir).

Durum: H-5, H-6 ✅ · H-7 ◐ (bizde teyit yok; sayım `calisilanGun === 7`) · H-8 ⬜ · H-9 ⬜.

---

## 5. Fazla mesai dönemi — *Şartname §11 "Pazartesi kuralı" cevabı*

Şube ayarı `fm_donem`: **`hafta`** (haftalık dönem) ya da **`takvim`** (takvim ayı).

**D-1 Haftalık dönem.** Ayın FM'i, **pazartesisi o ayda olan haftalar**dan oluşur. Örnek: Eylül 2026 = 7 Eylül – 4 Ekim. Her hafta **Pazartesi gününün ayına** yazılır. (Şartnamedeki "Pazartesi kuralı" budur.) Çizelgedeki başlıkta gösterilen ay ise haftanın **Perşembe**sinin ayıdır (yalnızca görüntü).

**D-2 Takvim ayı.** FM **gün gün** hesaplanır: ayın 1'inden son gününe. Günlük kural (vardiya saati − günlük, boş gün − günlük) uygulanır; haftanın 7. gün bonusu **Pazar gününün** ayına yazılır (hafta iki aya bölünse de).

**D-3 Dönem geçişi:** dönem, **önceki ayın döneminin bittiği günün ertesinden** başlar; hiçbir gün iki kez ödenmez ya da boşta kalmaz.
- Haftalık → takvim (Eylül haftalık 7 Eyl–4 Eki; Ekim takvim): Ekim FM'i **5 Ekim'den** başlar (1–4 Ekim Eylül'de ödendi).
- Takvim → haftalık: aradaki günler (örn. **1 Kasım** Pazar) yeni aya **eklenir**, günlük hesaplanır.

**D-4 Ayar zamanla değişir.** `günlük saat`, `fm_donem`, `fm_yontem`, `fm_ucret` değişince **o aydan itibaren** geçerlidir; önceki aylar eski ayarla hesaplanır (ayar geçmişi satırları). Ay bitmeden değiştirilmelidir.

**D-5 Elle dönem sonu (KARAR: kalsın).** İşveren, haftalık dönemde ayın kaç hafta ödeneceğini seçebilir (varsayılandan en çok ±3 hafta; sistemin ilk ayı için başlangıç da). Ay ya da sonraki ay onaylıysa kilitli. Seçilen sınır hafta sınırına oturtulur (başlangıç Pazartesi, bitiş Pazar); sonraki ay, bu ayın bittiği günün ertesinden başlar.

Durum: D-1 ✅ (`calc.ts` yalnızca bunu yapar) · D-2 ⬜ (`fm_donem` kolonu var, hesap yok sayıyor) · D-3 ⬜ · D-4 ◐ · D-5 ⬜.

---

## 6. SGK / bordro günü

**G-2 Gün sayısı** (`ist` = ay içinde SGK'lı takvim günü, `takvim` = ayın gün sayısı, `eksik` = rapor + ücretsiz izin):
```
tam   = (ist == takvim)
taban = tam ? (eksik > 0 ? takvim : 30) : min(30, ist)
gün   = max(0, min(30, taban − eksik))
```
| Durum | Gün |
|---|---|
| Tam ay, 31 çeker, eksik yok | **30** |
| 31 çeken ay, tam çalışma, 1 gün rapor | 31 − 1 = **30** |
| Şubat (28), 1 gün rapor | 28 − 1 = **27** |
| Ay ortasında girdi, 11 gün çalıştı | **11** |
| Ay ortasında girdi, 11 gün, 2 gün rapor | 11 − 2 = **9** |

- **G-3 Part:** gün sayısı = **part gün** (veri girişinden); girilmemişse tam zamanlı gibi (ay − rapor − ücretsiz izin).
- **G-4 Hak edilen gün** (`hakGun`): ücret için; deneme (SGK öncesi fiili çalışma) günleri dahildir. SGK günü (`gun`) yalnızca SGK'lı günlere göre; ikisi farklı olabilir.
- **G-5 Rapor gerçektir:** hem muhasebe gününü hem hak edilen günü düşürür. **Ücretsiz izin** yalnızca bordro (SGK) gününü düşürür.
- **G-6 Bayram:** bayramda çalışılan her gün için hak edilen tutara **+1 gün ücret** eklenir.
- **G-7 Aynı gün, aynı tür izin** iki şubede yazılsa da **1 gün** sayılır.
- **G-8 Mantık uyarısı:** rapor + ücretsiz + yıllık izin toplamı, kişinin o ay çalışılabilir günlerinden fazlaysa uyarı (engel değil).

Durum: tamamı ⬜.

---

## 7. Hafta akışı

```
acik ──kapat──▶ kapali ──onayla──▶ onayli
 ▲                │                  │
 └──── geri gönder (not zorunlu) ────┘      (bölge/işveren)
```
| İşlem | Kim | Not |
|---|---|---|
| Kapat (`acik→kapali`) | şube müdürü, bölge, işveren | Hafta **Pazar gününden itibaren** kapatılabilir. Son gün: Pazar + **2 gün**; sonrası "gecikti". |
| Onayla (`kapali→onayli`) | bölge, işveren | Yalnızca `kapali`'dan. |
| Kapat ve onayla | bölge, işveren | Tek adım. |
| Geri gönder | bölge, işveren | **Not zorunlu.** Hafta şubeye yeniden açılır. |
| Kilidi aç (`kapali/onayli→acik`) | bölge, işveren | Onay sorulur. |

- **W-1 Şube müdürü kapalı/onaylı haftayı göremez.** (Şu an bizde görebiliyor, ⬜.) Kapalı haftanın kişi bazında toplamları, "ay başından bu haftaya kadar" sütunu için hafta kapanırken ayrı bir özete yazılır.
- **W-2 Kapatma kontrol listesi** (şube müdürü):
  - Boş gün → **engel**.
  - 7 gün çalışan teyidi → **engel**.
  - Rapor/ücretsiz/yıllık izin teyidi → **engel**.
  - **Çalışmayan kişi (KARAR: kural devam):** haftanın listesindeki bir kişi o hafta hiç çalışmadıysa şube müdürü "çalışmadı" işaretler; hafta kapanırken **o haftanın çalışan günleri ücretsiz izin yazılır** (günleri tek tek doldurmak gerekmez). İşaretlenmeden hafta kapanmaz. (Bkz. P-12.)
  - Eksi FM → bilgi.
- **W-3 Bölge/işveren onayında:** şube müdürünün işaretlediği maddeler ✓ görünür. **Giriş/çıkış teyidi zorunlu** (SGK tarihi ile çizelgedeki ilk/son çalışılan gün karşılaştırılır).
- **W-4 Kilit matrisi:** `acik`: herkes · `kapali`: bölge+işveren · `onayli`: yalnızca işveren · `kesin` aya değen gün: kimse (önce işveren kesini açar). Kilit **gün bazlıdır** (günün haftası ve ayı kontrol edilir).
- **W-5 Onaylı aya değen açık haftada** şube müdürü haftayı **kapatabilir** (hücreler değişmez).
- **W-6 Kesin kapanmış aya değen haftaya kimse yazamaz.**
- **W-7 Kayıt:** her hafta işlemi (kim, ne, ne zaman, not) haftanın kaydına ve denetim kaydına yazılır.
- **W-8 Hafta onayı** ay özetini günceller (başka şubenin maaş hesabı bunu kullanır).

Durum: temel akış ✅ (`0003`), W-1 ⬜, W-2 ⬜ (yalnızca boş hücre listesi var), W-3 ⬜, W-5 ✅, W-6 ✅, W-7 ✅.

---

## 8. Ay akışı ve kesin kapanış

```
acik ──onayla──▶ onayli ──kesin kapat──▶ kesin
  ▲                │  ▲                    │
  └─ geri gönder ──┘  └──── kesin aç ──────┘
```
- **M-1 Aylık şube kapatması yok.** (EmrePuantaj'daki `sube_onay` durumu ve "Ay sonu" ekranı kullanılmıyor; sade bırakıyoruz.) Şube müdürleri yalnızca **haftayı** kapatır.
- **M-2 Ay onayı** (bölge/işveren): ayın **bütün dolu haftaları `onayli`** olmalı. ✅
- **M-3 Önceki ay** onaylanmadan sonraki ay onaylanamaz; önceki ay **kesin** olmadan sonraki ay kesin kapatılamaz (devir ondan gelir).
- **M-4 Onay öncesi kontrol** (bölge): rapor, yıllık izin, ücretsiz izin, bayram, SGK giriş, SGK çıkış maddeleri **muhasebe grubundaki bilgiyle** karşılaştırılıp tek tek işaretlenir; hepsi işaretlenmeden onay yok.
- **M-5 Çizelgeden gelen FM ve saatlik çalışma saati** açık ayda **onay bekler** ("Onay bekliyor / Onaylandı / Reddedildi"); bekleyen varken ay onaylanamaz. Çizelge değişip saat farklılaşırsa onay düşer. Kilitli ayda karar verilmemişler onaylı sayılır; açıkça reddedilen ödenmez.
- **M-6 Onayda muhasebe tarafı dondurulur** (snapshot). Ödemeler ve veri girişi devam eder (gün türleri hariç).
- **M-7 Kesin kapanış** (yalnızca işveren): ayın **bütün haftaları** (sonraki aya taşan dahil) onaylı, bekleyen yazma yok, düzenleme kilidi başkasında değil. O anki **bütün rakamlar** (muhasebe + ödemeler + kalan) saklanır; sonradan çizelge, ayar, maaş, program değişse de ay aynı kalır.
- **M-8 Kesin aç** (yalnızca işveren): sonraki ay kesin değilse; kayda geçer; ay `onayli`ya döner.
- **M-9 Saklanan fark uyarısı:** onaylı/kesin ayda, saklanan rakamlar bugünkü hesaptan farklıysa işverene kişi bazında gösterilir (saklananlara dokunulmaz).

Durum: M-2 ✅ (`0003`) · M-1 ✅ · M-3 ⬜ · M-4…M-9 ⬜.

---

## 9. Personel

- **P-1 Görev listesi (seçmeli):** `R. Müdür`, `V. Müdür` (grup **M**), `Mutfak` (grup **K**), `Kurye`, `Esnaf Kurye` (grup **S**). Çizelge sırası: M, K, S. Esnaf Kurye ⇒ şekil otomatik `Esnaf`.
- **P-2 Şekil:** `Tam`, `Part`, `Esnaf`.
- **P-3 Tarihler:** `giriş` (SGK), `deneme başlangıcı` (≤ giriş; boşsa SGK girişi), `çıkış` (≥ giriş).
- **P-4 SGK şubesi** bir şube ya da `Yok`. **Aynı kişi aynı tarihlerde iki şubede SGK'lı olamaz**; tarihler ayrılmalı (çıkış 1 Eylül, yeni giriş 2 Eylül).
- **P-5 Maaş şubesi** tarihçelidir ("şu aydan itibaren"); önceki aylar eski şubede kalır. Muhasebe her zaman **SGK şubesinde**.
- **P-6 Görev/şekil geçmişi** de tarihçelidir; ay hesabı kişinin **o ayki** görevini kullanır.
- **P-7 Pasif:** çıkış yapan kişi, son çalıştığı ayın maaşı ödendikten sonra (**ertesi ayın 10'undan sonra**) pasife geçer.
- **P-8 Silme:** çizelge kaydı olan kişi silinmez; çıkış tarihi girilir.
- **P-9 Yetki:** şube müdürü SGK şubesi, çalıştığı şube, giriş, çıkış ve maaş şubesini **değiştiremez** (görür); yeni kişiyi SGK bilgisi boş ekler.
- **P-10 İsim:** büyük harf (Türkçe). Eşleştirmede Türkçe karakter farkı yok sayılır.
- **P-11 TC** 11 hane + kontrol algoritması; **IBAN** `TR` + 24 hane + mod-97. **IBAN değişince** eski IBAN, değişim tarihi ve değiştiren sunucuda saklanır; denetim kaydına düşer. TC/IBAN yalnızca işveren ve bölge müdürü (✅ `employee_private`).
- **P-12 Haftanın listesi (KARAR: otomatik + elle ekle/çıkar).**
  - **Otomatik:** şubeye bağlı (çalıştığı şube ya da diğer şube) ve o hafta çalışan günü olan her kişi, haftanın listesinde kendiliğinden görünür. Her hafta liste kurmak gerekmez.
  - **Elle çıkar:** kişi o hafta başka şubede çalışıyorsa vb. şube müdürü onu **o haftanın listesinden çıkarır**. Çıkarılan kişinin o haftada bu şubede boş günü sayılmaz, hiçbir şey yazılmaz.
  - **Elle ekle:** başka şubenin kişisi o hafta bu şubede çalışacaksa **haftaya eklenir** (çok şubeli çalışma).
  - **Çalışmadı:** listedeki kişi hiç çalışmadıysa W-2'deki kural: günler **ücretsiz izin** yazılır.
  - **Veri:** `hafta_kadro_istisna(şube, hafta, kişi, tür: 'ekle' | 'cikar')`. Otomatik liste hesaplanır, yalnızca istisnalar saklanır.
  - Kapalı/onaylı haftanın listesi, hafta kapanırken dondurulur (sonradan çıkış/giriş tarihi değişse de o haftanın satırları aynı kalır).

**Yeni yapıda düzelttiğimiz tasarım hatası:** EmrePuantaj aynı gerçek kişiyi şube/dönem başına **ayrı kayıt** olarak tutuyor ve "aynı kişi mi" sorusunu TC/isimle tahmin ediyor (`ayniKisi`). Bizde **tek kişi + çalışma dönemleri/görevlendirmeler** tablosu olacak.

---

## 10. Ödemeler (puantaj sağ tarafı) — ay içinde kişi başına

**Girdiler:** anlaşılan **net maaş** (aya göre), bankaya yatan, avans, ara ödeme, maaş farkı (±), fazla mesai tutarı, paket sayısı/primi, ciro primi, ek ödeme, kesinti. Ücret biçimi kişi başına: `maas` (varsayılan), `saat`, `paket`, `esnaf`.

**O-1 Maaşlı (varsayılan):**
```
hak        = net × (hakGun + bayram) / 30
maaşFarkı  = hak − bankayaYatan
FM TL      = FM saat × FM saat ücreti          (eksi FM de düşülür)
kalanHam   = maaşFarkı + FM TL + paketPrimi + ciroPrimi + (ek − kesinti) − avans − araÖdeme
kalan      = kalanHam, en yakın 5 TL'ye yuvarlanır
```
**O-2 FM saat ücreti:** şube `fm_yontem`:
- `sabit`: `fm_ucret` (varsayılan **165 ₺/sa**); kişiye özel saat ücreti varsa o geçerli.
- `maas`: `net / 30 / 9`; **Eylül 2026'dan itibaren küsurat atılır** (37.000 → 137), eski aylar kuruşlu.

**O-3 Devir:** önceki ayın `kalan`'ı **eksi** ise bu aya **avans olarak** düşer (`devirAvans = −kalan`). Artı kalan devretmez.

**O-4 Saatlik:** `hak = çalışılan saat × saat ücreti`; FM yok.
**O-5 Paket başı:** hak 0, FM yok; kazanç paket primidir; bankaya yatan düşülür.
**O-6 Esnaf kurye:** `hak = paket sayısı × paket ücreti`; `maaşFarkı = hak − bankaya`. Esnaf muhasebede görünmez, yalnızca Ödemeler'de.
**O-7 Maaşı başka şubede olan kişi:** bu şubede yalnızca **FM** ödenir; maaş farkı o şubenin puantajında.
**O-8 Muhasebe listesine girmeyenler:** esnaf kurye, SGK'sı başka şubede olanlar, SGK'sız çalışanlar, ay içinde hiç SGK günü olmayanlar. (Yalnızca Ödemeler'de.) Muhasebede kurye görevi **"Sürücü"** yazılır.

Durum: tamamı ⬜.

---

## 11. Veri girişi (Excel gibi satır satır)

| Kod | Tür | Birim | Taraf |
|---|---|---|---|
| `R` `UI` `YI` `B` `PG` | Rapor, ücretsiz izin, yıllık izin, bayram, part gün | gün | **Muhasebe (sol)** |
| `FM` | Fazla mesai saati (otomatik) | saat | sol |
| `BY` | Bankaya yatan | ₺ | **Ödeme (sağ)** |
| `MF` `SA` `FMT` `AV` `AO` `PS` `PP` `CP` `EK` `KS` | Maaş farkı, çalışılan saat, FM tutarı, avans, ara ödeme, paket sayısı/primi, ciro primi, ek ödeme, kesinti | ₺ / saat / adet | sağ |

**V-1** Satır kırmızı (hesaba girmez): isim yok/eşleşmiyor, tür yok, miktar yok, tarih başka ayda, **onaylı ayda sol taraf türü** (kilitli), onaydan sonra eklenen kişi.
**V-2** `BY` maaşı başka şubede olan kişiye girilirse tutar **maaş şubesine** gönderilir (yetki varsa), yoksa engellenir.
**V-3** Sarı uyarı: aynı gün aynı rapor/izin çizelgede ya da başka şubede de yazılı (çift sayım); rapor/izin toplamı çalışılabilir günü aşıyor.
**V-4** Gün türleri (`R UI YI B PG`) hangi şubede girilirse girilsin kişinin SGK ve maaş şubesinde sayılır.

Durum: tamamı ⬜.

---

## 12. Diğer sistem kuralları

- **K-1 Düzenleme kilidi** (aynı anda tek kişi düzenler): çizelgede *şube + hafta*, puantajda *şube + ay*. İlk değişiklikte alınır, **2 dakika** işlem yoksa ya da sayfadan çıkılırsa düşer. İşveren her kilidi, bölge müdürü şube müdürününkini **devralır**. Bakmak serbest.
- **K-2 Sürüm kapısı:** eski sürümle açık kalan cihaz kayıt yapamaz; "Güncellendi, yenile" ekranı.
- **K-3 Çevrimdışı:** yazılanlar cihazda bekler, internet gelince gönderilir; bekleyen varken uyarı ve sayfa kapatma uyarısı.
- **K-4 Kullanıcı yönetimi:** işveren kullanıcı ekler/siler/pasife alır; bölge müdürü kendi şubelerindeki şube müdürlerini yönetir. Şifre **saklanmaz** (edge function).
- **K-5 Yedek:** işveren tüm veriyi tek dosya (JSON) indirir; okunamayan bölüm olursa yedek iptal. **Veri kontrolü** şubeyle bağı olmayan ya da silinmiş kişilerin hücrelerini listeler (değiştirmez).
- **K-6 İşçilik (işveren):** kişi maliyeti = **resmi** (SGK günü × 40.874,63 ÷ 30; bankaya yatan net bunun içinde) + **elden** (maaş farkı + FM + ciro primi + ek − kesinti) + **paket primi**. Avans/ara ödeme ayrıca eklenmez; eksi devir maliyet değildir. Maaş, SGK ve başka şubedeki FM maaş şubesine yazılır. Lojman ve ciro (KDV dahil) şube başına elle girilir.

---

## 13. Şartname §11 "Doğrulanacaklar" — cevaplar

| Soru | Cevap |
|---|---|
| "Sayılan boş gün" kuralı | **H-1:** çalışan gün + boş hücre + o hafta en az bir dolu hücre + esnaf değil (+ çok şubelide maaş şubesi). Her boş gün `günlük saat` eksi. |
| İzin kodları listesi | `HT R UI YI B CG` (+ eski `D`, kaldırıldı). `CG` yalnızca part. |
| Pazartesi kuralı | **Haftalık dönemde** hafta Pazartesi'nin ayına yazılır. **Takvim ayında** gün gün; 7. gün bonusu Pazar'ın ayına. |
| `sonSaat` | **Kaldırıldı.** Saat listesi tüm şubeler için tek (S-2, S-7). |

---

## 14. Kararlar

| # | Konu | Karar |
|---|---|---|
| 1 | Elle fazla mesai dönem sonu (D-5) | **Kalsın.** |
| 2 | Haftalık kadro (P-12) | **Otomatik gelsin, gerekirse elle ekle/çıkar.** Çalışmayan kişi → ücretsiz izin kuralı devam. |
| 3 | Devir (O-3) | **Kalsın**, sonra değerlendirilecek. |
| 4 | Onay öncesi muhasebe teyit listesi (M-4) | **Kalsın.** |
| 5 | Saat listesi (S-2, S-3, S-6, S-7) | **Bütün şubeler için tek liste.** Şubede yalnızca açılış/kapanış tutulur, çizelge rengi içindir. `sonSaat` ve pay kuralı yok. |
| 6 | Küsurat atma (O-2) | **Sabit kalsın** (Eylül 2026'dan itibaren). |

| 7 | Saat listesi aralığı (S-2) | **Yönetici panelinde belirlenir, esnek.** Varsayılan 10:00 – 03:30. |
| 8 | "Elle çıkar" (P-12) | Kişinin o hafta bu şubede **yazılmış vardiyası/kodu varsa çıkarmaya izin verilmez**; önce o günler temizlenir. |

## 15. Hâlâ açık ❓

1. **Saat aralığı daraltılırsa** dışarıda kalan eski vardiyaların kapatmayı engelleyip engellemeyeceği (D aşamasında netleşecek; önerim: engellemesin, kırmızı gösterilsin).
