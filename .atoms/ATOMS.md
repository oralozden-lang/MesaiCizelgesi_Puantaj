---
last_updated: 2026-10-28T20:57:27Z
status: active
---

# Project Context

## Project Overview

## Key Decisions
| Date | Decision | By | Rationale |
|------|----------|-----|-----------|
| 2026-10-29 | FM formülü eski sistemle aynı: saat − (vardiya+boş gün)×günlük + 7 gün bonusu; part/esnafta FM yok | Alex | Eski kararlı sistemle tutarlılık |
| 2026-10-29 | Haftalık saat = günlük × 6 (DB trigger); ayar değişikliği o aydan itibaren geçerli (ayar_gecmis) | Alex | Geçmiş ayların hesabı korunur |
| 2026-10-29 | TC/IBAN ayrı tabloda; yalnızca işveren ve bölge müdürü görür; IBAN değişimi audit'e yazılır | Alex | Hassas veri ayrımı |
| 2026-10-29 | Varsayılanlar: şifreler hash'li (yalnızca sıfırlama), ay onayına şube müdürü katılmaz, fm_donem=hafta | Alex | Kullanıcı yanıtlamadı; eski sistem varsayılanları |
| 2026-10-29 | Takvim dönemi FM, geçiş günleri Faz 3'e bırakıldı | Alex | Kapsam ayrımı |

## Constraints


