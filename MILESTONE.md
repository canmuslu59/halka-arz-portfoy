# HALKA ARZ PORTFÖYÜM — MİLAT 1

Bu dosya, bundan sonraki geliştirmeler için tek başlangıç noktasıdır.

## Kanonik başlangıç

- Sürüm: **v2.4.4**
- versionCode: **26**
- Paket: `com.innative.halkaarz`
- targetSdk: **36**
- Kanonik branch: `milestone/v2.4.4-code26`
- Kanonik AAB adı: `halka-arz-portfoyum-v2.4.4-code26-play.aab`
- Kanonik kaynak paketi: `halka-arz-portfoyum-v2.4.4-code26-source.zip`

## Yeni sohbet kuralı — ÇOK ÖNEMLİ

Yeni bir ChatGPT sohbetinde bu proje devam ettirilecekse:

1. **Bu Milat kaynak paketinden devam et.**
2. **Bu sürümden önceki Git commitlerini, eski branchleri, eski handoff dosyalarını, eski APK/AAB'leri ve önceki sohbetleri inceleme.**
3. Önceki geçmişi yalnız kullanıcı açıkça “eski sürümlere/commitlere bak” derse aç.
4. Bir hata araştırılırken önce Milat kaynağında hatayı yeniden üret; eski implementasyonlardan çözüm kopyalama.
5. Yeni sürümler bu Milat'ın üzerine artımlı olarak yapılmalı.
6. Paket adı ve Play upload imza zinciri kullanıcı açıkça istemedikçe değiştirilmemeli.

Yeni sohbet için önerilen ilk mesaj:

> `MILESTONE.md dosyasını oku. Bu proje için Milat 1 v2.4.4 / code26 sürümüdür. Eski commitleri, branchleri, handoffları ve önceki sohbetleri inceleme. Yalnız bu source snapshot'tan devam et.`

## İmza zinciri

Google Play upload key **yeniden üretilmemeli**.

- Alias: `halkaarz-upload`
- Beklenen upload sertifikası SHA-256:
  `02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72`
- Güvenli yedek arşiv adı: `google-play-upload-key-backup-v2.1.0.zip`
- Parolalar ve private key değerleri bu dosyaya yazılmamıştır.

## Milat 1'de bilerek dokunulmayan konular

Kullanıcının açık talebi nedeniyle şu iki konu bu Milat çalışmasında değiştirilmedi:

- Gerçek Pro satın alma / Google Play Billing akışı.
- 2028 ve sonrası hareketli BIST dini tatil takvimi.

Bunlar gelecekte ancak kullanıcı özellikle isterse ele alınmalı.

## Milat 1 release davranışı

- Test APK'da kullanılan **“Test bildirimi gönder”** butonu production AAB arayüzünde yoktur.
- Gerçek Android bildirim izin/kanal kontrolü ve arka plan bildirim altyapısı korunmuştur.
- Takvim parserındaki sahte `LEM` kaydı düzeltmesi Milat kaynağındadır.
- Portföy toplamlarının eksik veriyle yanıltıcı tam toplam göstermemesi düzeltmesi Milat kaynağındadır.

## Doğrulama

Final AAB'nin SHA-256 değeri, signer doğrulaması ve final commit kimliği release ile birlikte verilen `MILESTONE_VERIFICATION.txt` dosyasında yer alır.

Bu dosyanın amacı geçmişi taşımak değil, **geçmişi kapatıp bu noktadan temiz şekilde devam etmektir.**
