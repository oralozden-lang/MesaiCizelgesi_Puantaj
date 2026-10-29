---
last_updated: 2026-10-28T20:57:27Z
---

# Requirements & Progress

## Requirements Overview

## User Stories

## Task Breakdown
| ID | Task | Assignee | Status | Deps |
|----|------|----------|--------|------|
| 1 | Supabase şeması, enum tipleri, RLS ve kilit trigger'ları | Alex | done | - |
| 2 | Kullanıcı oluşturma/şifre sıfırlama Edge Function | Alex | done | 1 |
| 3 | Kullanıcı adı + şifre girişi, ilk girişte şifre değiştirme | Alex | done | 1,2 |
| 4 | Şube ve personel yönetimi | Alex | done | 1 |
| 5 | Haftalık çizelge ekranı ve hesaplama motoru | Alex | done | 1,4 |
| 6 | Hafta kapat/onayla/geri gönder ve kilit kuralları | Alex | done | 5 |
| 7 | Aylık puantaj, ay onayı, kesin kapanış, Excel | Alex | done | 5,6 |
| 8 | İşlem kaydı (audit_log) ekranı | Alex | done | 6,7 |
| 9 | PWA kurulumu (manifest, simge, tam ekran) | Alex | done | - |
| 10 | Doğrulama: lint, tsc, build, RLS canlı testleri | Alex | done | 1-9 |
| 11 | Faz 1: personel/şube veri modeli (görev, SGK, TC/IBAN ayrı tablo, ayar geçmişi) | Alex | done | 1 |
| 12 | Faz 2: izin kodları ve renkleri, Excel renkli çizelge, saat payları | Alex | done | 11 |
| 13 | Faz 1-2 doğrulama: lint, tsc, build | Alex | done | 11,12 |

## Progress Log
- Plan onaylandı (14 madde).
- Supabase şeması kuruldu: 8 tablo, 4 enum, RLS politikaları, `p_can_edit_day`, hafta/ay durum guard trigger'ları.
- `app_8524c8f4f5_kullanici` Edge Function deploy edildi (bootstrap/create/reset/sil, service key istemcide yok).
- Arayüz sıfırdan yazıldı: Login, Setup, ChangePassword, Cizelge, Puantaj, Yonetim.
- Canlı test: üç rolün şube görünürlüğü, kapalı haftada düzenleme engeli, onay yetkisi reddi doğrulandı; test hesapları silindi.
- `pnpm run lint`, `tsc --noEmit`, `pnpm run build` temiz.
- Örnek veri: 2 şube, 6 personel, 58 vardiya kaydı (Merkez/Sahil).
- Faz 1: employees'a gorev/sgk_var/sgk_branch_id/baslama/paket_basi/sira/grup eklendi; employee_private (TC, IBAN, IBAN geçmişi + audit trigger) açıldı; branches'a fm_donem/fm_yontem/fm_ucret/ayar_gecmis ve haftalık=günlük×6 trigger'ı geldi; shifts'e p_shift_guard (şube/tarih/part boş/yarım saat) eklendi.
- Faz 2: FM formülü eski sisteme çekildi; izin kodları GUN_KOD + KOD_RENK ile hem arayüzde hem Excel'de renkli; saat listesinde bugün/geçmiş için ±1 saat pay (turuncu); StaffTab, ShiftSheet, Cizelge, Puantaj, Yonetim, excel.ts yeni tiplere göre yenilendi.
- excel.ts exceljs'e taşındı (xlsx kaldırıldı); Puantaj + renkli Günlük çizelge sayfaları üretiliyor.
- Migration: 0002_faz1_faz2.sql yazıldı (canlı şema ile birebir).
- Doğrulama: lint, tsc --noEmit, build temiz.

