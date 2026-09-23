# SAFE RELEASES

Bu dosya, geri dönüş için güvenli kabul edilen sürümleri kalıcı olarak kaydeder.

## Last Known Good — Code32 / v2.4.9

- Durum: **GÜVENLİ GERİ DÖNÜŞ NOKTASI — SİLME**
- Branch: `safe/v2.4.9-code32-last-known-good`
- Commit: `620210de531dab7502ae55552edb63adbdd8dfe4`
- Production package: `com.innative.halkaarz`
- Version: `2.4.9`
- Version code: `32`
- Play AAB adı: `Hisse-Portfoyum-v2.4.9-Code32-Play(1).aab`
- Bilinen AAB SHA-256: `5a0b77251aaeb4464fc16213892bf8ac9a2633081705152e02b44cb0decc8b8d`
- Not: Bu sürüm, Code33 canlıya alınmadan önce çalışan production sürümüdür. Özellikle market bildirim sistemi için güvenli referans kabul edilmelidir.
- Geri dönüş gerektiğinde bu branch'teki kaynak kullanılmalı; market bildirim çekirdeği yeniden yazılmamalıdır.

## Current Production Source — Code33 / v2.5.0

- Main'e taşınan release branch: `release/v2.5.0-code33`
- Release source commit: `889cde6155e567b259d25a51c744ea59f99ef864`
- Production package: `com.innative.halkaarz`
- Version: `2.5.0`
- Version code: `33`
- Final Play AAB: `Hisse-Portfoyum-v2.5.0-Code33-Play.aab`
- Final AAB SHA-256: `5e0a4fa958f6567c961b55e04bfa2daf4f19c84ad0fee7ab7e8f5f55b6054503`
- Code33 release doğrulaması: 465/465 test PASS.
- Canlı market notification core, Code32/main referansıyla build öncesi ve dönüşüm sonrası karşılaştırıldı.
- Fake haber preview production'da kapalıdır.

## Kural

Yeni bir production sürümü güvenli kabul edilmeden önce bu dosyadaki "Last Known Good" satırı değiştirilmemelidir.
