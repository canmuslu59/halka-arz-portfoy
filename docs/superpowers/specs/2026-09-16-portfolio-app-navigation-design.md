# Portföy Uygulaması Navigasyon ve Ana Sayfa Tasarımı

Tarih: 2026-09-16
Kapsam: Yalnız ayrı Test APK (`com.innative.halkaarz.test`). Main/canlı sürüm değişmeyecek.

## Amaç

Uygulamayı yalnız halka arz takibi yapan bir yapıdan genel portföy uygulaması hissine yaklaştırmak. Mevcut çalışan hesaplama, bildirim, hisse ekleme/satış, veri kaynakları, görsel paylaşım ve test imza zinciri korunacak.

## Alt Navigasyon

Alt menü şu sıraya dönüşecek:

1. Performans
2. Piyasalar
3. Cüzdan (ortada, büyük ve yuvarlak; ana sayfa)
4. Gelişmiş
5. Ayarlar

Mevcut Portföy ve Takvim sekmeleri alt menüden kaldırılacak. Cüzdan butonu mevcut ana sayfa/portföy görünümüne yönlendirmeye devam edecek.

## Cüzdan / Ana Sayfa

Açılış ekranı iki ana karttan oluşacak:

### 1. Cüzdan kartı

Mevcut çalışan Cüzdan kartı korunacak. Bugün, Günlük Değişim ve Yatırılan göstergeleri ile PNG görsel paylaşım davranışı değişmeyecek.

### 2. Karşılaştırma kartı

Mevcut küçük günlük karşılaştırma kartı büyütülecek ve ana sayfanın ikinci ana kartı haline getirilecek.

Kartta yalnız gerekli içerik bulunacak; karşılaştırma dışındaki açıklama metinleri kaldırılacak.

Üstte üç zaman seçeneği olacak:

- Günlük
- Haftalık
- Aylık

Altında aynı dönem için şu dört karşılaştırma satırı gösterilecek:

- Portföy
- Altın (TL)
- BIST 100
- Dolar

Değerler yüzdesel değişim olarak gösterilecek. Veri alınamazsa `—` gösterilecek; `%0` gibi yanıltıcı bir fallback kullanılmayacak.

Portföy karşılaştırma değeri mevcut portföy verilerinden okunacak; Altın/BIST/Dolar karşılaştırmaları yalnız gösterim amacıyla mevcut Yahoo erişim yolundan alınacak. Bu referans veriler portföy hesaplama, bildirim veya alım-satım mantığını etkilemeyecek.

## Performans Sekmesi

Ana sayfanın aşağısında bulunan mevcut analitik içerikler ayrı Performans görünümüne taşınacak:

- Portföy geçmişi grafiği
- Gün gün kâr / zarar
- Sektör dağılımı

Mevcut grafik aralıkları ve hesaplama kaynakları aynen korunacak. Bu işte yeni performans hesabı yazılmayacak; mevcut içerik yalnız yeni bir görünüm altında yeniden konumlandırılacak.

## Piyasalar Sekmesi

Bu sürümde Piyasalar görünümü iki bölüm içerecek:

### Piyasa Özeti

- BIST 100
- Altın (TL)
- Dolar

Kompakt kartlar/satırlar halinde güncel yüzde hareketleri gösterilecek. Ana sayfadaki karşılaştırma verisi ile aynı gösterim kaynağı kullanılabilir.

### Halka Arz Takvimi

Mevcut çalışan Halka Arz Takvimi kaldırılmayacak. Alt menüde ayrı sekme olmak yerine Piyasalar ekranının içinde ayrı bir bölüm olarak yaşayacak. Mevcut filtreleme, yenileme ve detay davranışları korunacak.

## Takip Listesi

Takip Listesi bu sürümün kapsamı dışındadır. Bir sonraki bağımsız adım olarak eklenecek.

## Hisselerim Listesi

Mevcut hisseler/halka arz pozisyon listesi Cüzdan ekranında iki ana kartın altında kalacak. Bu işte hisse kartlarının yapısı, sıralama, detay, satış veya ekleme davranışı değiştirilmeyecek.

## İzolasyon ve Canlıya Taşıma

Değişiklikler ayrı feature branch üzerinde tutulacak. Test APK için mevcut overlay yaklaşımı mümkün olduğunca korunacak. Canlıya geçişte kör merge yapılmayacak; ilgili HTML/CSS/JS/navigasyon parçaları canlı kaynak ile karşılaştırılarak taşınacak.

Ayrıca `changes/portfolio-app-navigation-20260916/README.md` altında taşınabilir değişiklik notu bırakılacak.

## Test ve Kabul Kriterleri

- Mevcut tüm regresyon testleri geçmeli.
- Yeni navigasyon için ek testler önce RED sonra GREEN görülmeli.
- Açılış ekranında Cüzdan + kapsamlı Karşılaştırma görünmeli.
- Performans içerikleri ayrı Performans sekmesinde görünmeli.
- Piyasalar sekmesinde piyasa özeti ve mevcut Halka Arz Takvimi bulunmalı.
- Takip Listesi bulunmamalı.
- Ortadaki Cüzdan butonu ana sayfaya dönmeli.
- Mevcut PNG paylaşım özelliği korunmalı.
- Paket `com.innative.halkaarz.test` olarak kalmalı.
- Önceki test APK ile aynı AOSP test signer kullanılmalı.
- Main/canlı branch değişmemeli.
