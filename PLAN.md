# Puantaj — Çalışma Planı

Şartname: `attachments/puantaj.md`. Proje özeti: `.wiki.md`.

## Hedef Supabase projesi

- Ad: **Puantaj_yeni**
- Proje kimliği: `gsyhuttsaaebwbkfuemb` (`app/frontend/src/lib/supabase.ts`)
- Tablolar `app_8524c8f4f5_` önekli. Puantaj migration'ları Envanter projesine uygulanmaz.
- Her yazma işleminden önce: proje listesinde "Puantaj_yeni" ve kimliğin eşleştiğini, önekli tabloların orada olduğunu doğrula. Eşleşmezse dur ve sor.
- Veriler test verisidir, gerçek değildir. Kullanıcı, Supabase'i Claude'un yönetmesini ister (SQL'i kullanıcı çalıştırmaz).

## Durum

- Zip açıldı, `.gitignore` eklendi, eski `0001_faz1_sema_ve_rls.sql` kaldırıldı (PR #1 birleşti).
- Güncel migration'lar: `0001_puantaj_tam_sema.sql`, `0002_faz1_faz2.sql`.
- lint, tsc, build temiz; dev sunucusu açılıyor.

## Aşama A — Bağlantı (kullanıcıda)

- Supabase bağlayıcısında yazma araçları izinli, yeni oturum açıldı.
- Yeni oturumda ilk iş: Execute SQL / Apply migration / Deploy Edge Function araçlarının geldiğini kontrol et.

## Aşama B — Güvenlik, `0003_guvenlik.sql`

Önce canlı şemayı (tablolar, politikalar, fonksiyon yetkileri) migration dosyalarıyla karşılaştır. Sonra:

1. `weeks` ve `months`: DELETE'i engelle (politikayı ayır). Durum değişmese de yetkisiz alan değişimini (`onaylayan`, `kesin_yapan`, `kesin_sonuc`, `geri_not`) guard'a al.
2. `aktif` kontrolünü `p_has_branch` ve `p_can_edit_day` içine ekle. Pasif kullanıcı okuyamaz, yazamaz.
3. `p_audit_yaz`: public yetkisini kaldır, şube yetkisi kontrolü ekle. `audit_log` insert politikasını daralt.
4. Hafta/ay durum geçişleri ve kapalı/onaylı haftadaki vardiya düzeltmeleri `audit_log`'a trigger ile yazılsın (tarayıcıdan yazma kalksın).
5. Ay onayı: ayın dolu haftaları `onayli` değilse reddet. Ay INSERT ile doğrudan `onayli` açılmasını kontrol et.
6. Hafta onayı yalnızca `kapali → onayli`. INSERT ile `onayli` mantığını düzelt.
7. `p_koru_profil`: `sifre_degistirmeli` bayrağını kullanıcı kendi kendine `false` yapamasın (şifre değişikliği `p_sifre_degistirildi` ile).
8. `kesin` aydaki vardiyalar cascade ile (personel/şube silme) silinemesin. Vardiya için kilit trigger'ı ekle.
9. Şube müdürü (`sube`) tek şubeye bağlansın.
10. İsteğe bağlı: `employees.paket_basi` yalnızca işveren/bölge görsün (ayrı tabloya veya kolon yetkisi).

## Aşama C — Şartname boşlukları

- Kurulum (install) uyarısı (`beforeinstallprompt`, iOS yönergesi).
- İstemci tarafı audit yazımını kaldır (4. maddeyle birlikte).
- Takvim ayı fazla mesai hesabı (Faz 3, kullanıcıyla netleştir).
- Şartname §11 "doğrulanacaklar" listesi (boş gün kuralı, izin kodları, Pazartesi kuralı, `sonSaat`).
- İsteğe bağlı: ana paket 1,3 MB, kod bölme.

## Aşama D — Doğrulama

- Üç rol (isveren, bolge, sube) için canlı test: şube ayrımı, kilit matrisi, silme/güncelleme denemeleri. Test kullanıcıları işi bitince silinir.
- `pnpm run lint`, `tsc --noEmit -p tsconfig.app.json`, `pnpm run build`.
- Migration dosyaları canlı şemayla birebir olsun (`0003` repoya da eklenir).

## Çalışma kuralları

- Geliştirme `claude/...` dalında, PR ile `main`'e. Birleşen PR'ın dalı `main`'den yeniden başlatılır.
- PR'ı kullanıcı açar/birleştirir, Claude açmasını isterse açar.
- Başka dosya silinmeden önce kullanıcıya sorulur.
