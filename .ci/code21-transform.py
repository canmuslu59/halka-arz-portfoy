from pathlib import Path
import math, random, struct, wave


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


def patch_parser():
    p = Path('public/core/parsers.js')
    text = p.read_text(encoding='utf-8')
    old_head = """export function parseAhlatciCalendar(html) {\n  const raw = String(html || '');\n  const rows = raw.match(/<tr\\b[\\s\\S]*?<\\/tr>/gi) || [];\n  const out = [];\n"""
    new_head = r"""export function parseAhlatciCalendar(html) {
  const raw = String(html || '');
  const out = [];

  // Active/upcoming IPOs are rendered as cards above the completed archive table.
  // Scan only that upper scope so a live offer is not missed just because it is not a <tr> yet.
  const completedHeading = raw.search(/<h[1-6]\b[^>]*>[\s\S]{0,180}Tamamlanm(?:ış|is)\s+Halka\s+Arzlar[\s\S]{0,80}<\/h[1-6]>/i);
  const firstTable = raw.search(/<table\b/i);
  const activeEnd = completedHeading >= 0 ? completedHeading : (firstTable >= 0 ? firstTable : raw.length);
  const activeScope = raw.slice(0, activeEnd);
  const detailLinks = [...activeScope.matchAll(/<a\b[^>]*href=["']([^"']*\/halka-arz\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const stopTickers = new Set(['AKTIF','YAKLASAN','YAKLAŞAN','HALKA','ARZ','FIYATI','FİYATI','TALEP','TARIHI','TARİHİ','BUYUKLUK','BÜYÜKLÜK','KONSORSIYUM','KONSORSİYUM','LIDERLERI','LİDERLERİ']);

  for (const link of detailLinks) {
    const index = link.index || 0;
    const windowStart = Math.max(0, index - 1800);
    const windowEnd = Math.min(activeScope.length, index + link[0].length + 2600);
    const cardHtml = activeScope.slice(windowStart, windowEnd);
    const cardText = textFromHtml(cardHtml);
    if (!/Talep\s+Tarih(?:leri|i)/i.test(cardText) || !/(?:Halka\s+Arz\s+Fiyatı|\bFiyat\b)/i.test(cardText)) continue;

    const anchorText = textFromHtml(link[2]);
    let company = /(?:katıl|incele|detay)/i.test(anchorText) ? null : anchorText.trim();
    if (!company || company.length < 5) {
      const headings = [...cardHtml.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi)]
        .map(match => textFromHtml(match[1]))
        .filter(value => value && !/Halka\s+Arzlar/i.test(value));
      company = headings.find(value => /A\.?\s*Ş\.?/i.test(value)) || headings.at(-1) || null;
    }

    let ticker = '';
    if (company) {
      const pos = cardText.indexOf(company);
      const near = pos >= 0 ? cardText.slice(pos + company.length, pos + company.length + 120) : cardText;
      const candidates = near.match(/\b[A-ZÇĞİÖŞÜ0-9]{3,8}\b/g) || [];
      ticker = cleanTicker(candidates.find(value => !stopTickers.has(value)) || '');
    }
    if (!ticker) {
      const candidates = cardText.match(/\b[A-ZÇĞİÖŞÜ0-9]{3,8}\b/g) || [];
      ticker = cleanTicker(candidates.find(value => !stopTickers.has(value)) || '');
    }
    if (!ticker) continue;

    const priceMatch = cardText.match(/Halka\s+Arz\s+Fiyatı\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i)
      || cardText.match(/\bFiyat\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i);
    const dateMatch = cardText.match(/Talep\s+Tarih(?:leri|i)\s*((?:\d{1,2}\s*[-–—]\s*)?\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20\d{2})/i);
    const sizeMatch = cardText.match(/(?:Halka\s+Arz\s+)?Büyüklük\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i);
    const leaderMatch = cardText.match(/Konsorsiyum\s+Liderleri\s+(.+?)(?=\s+(?:Halka\s+Arza\s+Katıl|Halka\s+Arz\s+Fiyatı|Talep\s+Tarih|Büyüklük)|$)/i);
    if (!dateMatch) continue;

    out.push({
      ticker,
      company: company ? company.replace(new RegExp(`\\s*${ticker}\\s*$`, 'i'), '').trim() : null,
      sector: null,
      ipoPrice: priceMatch ? numTR(priceMatch[1]) : null,
      offerDates: dateMatch[1].replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').trim(),
      ipoSizeTRY: sizeMatch ? numTR(sizeMatch[1]) : null,
      consortiumLeaders: splitConsortium(leaderMatch?.[1] || ''),
      detailUrl: new URL(link[1], 'https://www.ahlatciyatirim.com.tr').href,
      source: 'Ahlatcı Yatırım',
    });
  }

  const rows = raw.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
"""
    if text.count(old_head) != 1:
        raise SystemExit('parsers.js: calendar head contract changed')
    text = text.replace(old_head, new_head, 1)
    old_tail = """  return out;\n}\n\nexport function parseAhlatciList"""
    new_tail = r"""  const byTicker = new Map();
  for (const item of out) {
    const ticker = cleanTicker(item?.ticker);
    if (!ticker) continue;
    const existing = byTicker.get(ticker);
    if (!existing) {
      byTicker.set(ticker, { ...item, ticker });
      continue;
    }
    byTicker.set(ticker, {
      ...item,
      ...Object.fromEntries(Object.entries(existing).filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length))),
      ticker,
      consortiumLeaders: existing.consortiumLeaders?.length ? existing.consortiumLeaders : (item.consortiumLeaders || []),
    });
  }
  return [...byTicker.values()];
}

export function parseAhlatciList"""
    if text.count(old_tail) != 1:
        raise SystemExit('parsers.js: calendar tail contract changed')
    p.write_text(text.replace(old_tail, new_tail, 1), encoding='utf-8')


def write_notification_helper():
    p = Path('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java')
    old = p.read_text(encoding='utf-8')
    if 'market_moves_v2' not in old or 'CHANNEL_CEILING' in old:
        raise SystemExit('NotificationHelper.java: unexpected base')
    p.write_text(r'''package com.innative.halkaarz;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.util.Map;

final class NotificationHelper {
    private static final String CHANNEL_MARKET = "market_moves_v2";
    private static final String CHANNEL_RISE = "market_rise_v1";
    private static final String CHANNEL_CEILING = "market_ceiling_coin_v1";
    private static final String CHANNEL_FLOOR = "market_floor_v1";
    private static final String CHANNEL_IPO = "new_ipos";

    private NotificationHelper() {}

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel market = new NotificationChannel(CHANNEL_MARKET, "Borsa hareketleri", NotificationManager.IMPORTANCE_HIGH);
        market.setDescription("Diğer borsa hareket bildirimleri");
        NotificationChannel rise = customSoundChannel(context, CHANNEL_RISE, "Portföy artışları", "Toplam portföy artış bildirimleri", com.innative.halkaarz.R.raw.notification_rise);
        NotificationChannel ceiling = customSoundChannel(context, CHANNEL_CEILING, "Tavan bildirimleri", "Tavan fiyatına ulaşan hisseler", com.innative.halkaarz.R.raw.notification_ceiling_coin);
        NotificationChannel floor = customSoundChannel(context, CHANNEL_FLOOR, "Taban bildirimleri", "Taban fiyatına ulaşan hisseler", com.innative.halkaarz.R.raw.notification_floor);
        NotificationChannel ipo = new NotificationChannel(CHANNEL_IPO, "Yeni halka arzlar", NotificationManager.IMPORTANCE_DEFAULT);
        ipo.setDescription("Yeni açıklanan halka arz bildirimleri");
        manager.createNotificationChannel(market);
        manager.createNotificationChannel(rise);
        manager.createNotificationChannel(ceiling);
        manager.createNotificationChannel(floor);
        manager.createNotificationChannel(ipo);
    }

    private static NotificationChannel customSoundChannel(Context context, String id, String name, String description, int soundRes) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(description);
        String entry = context.getResources().getResourceEntryName(soundRes);
        Uri sound = Uri.parse("android.resource://" + context.getPackageName() + "/raw/" + entry);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(sound, attrs);
        return channel;
    }

    static void show(Context context, Map<String, String> data) {
        ensureChannels(context);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        String kind = value(data, "kind", "portfolio");
        String ticker = value(data, "ticker", "");
        String title = value(data, "title", "Halka Arz Portföyüm");
        String body = value(data, "body", "Portföyünüzde yeni bir hareket var.");
        String channel;
        if ("ipo".equals(kind)) channel = CHANNEL_IPO;
        else if ("ceiling".equals(kind)) channel = CHANNEL_CEILING;
        else if ("floor".equals(kind)) channel = CHANNEL_FLOOR;
        else if ("portfolio".equals(kind)) channel = CHANNEL_RISE;
        else channel = CHANNEL_MARKET;

        Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("push_kind", kind)
                .putExtra("push_ticker", ticker);
        int requestCode = (kind + ":" + ticker + ":" + body).hashCode();
        PendingIntent pending = PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
                .setSmallIcon(com.innative.halkaarz.R.drawable.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pending)
                .setPriority(NotificationCompat.PRIORITY_HIGH);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(requestCode, builder.build());
    }

    private static String value(Map<String, String> data, String key, String fallback) {
        String value = data == null ? null : data.get(key);
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
}
''', encoding='utf-8')


def write_wav(path, samples, rate=22050):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    peak = max(max(abs(x) for x in samples), 1e-9)
    scale = 0.72 * 32767 / peak
    frames = b''.join(struct.pack('<h', max(-32767, min(32767, int(x * scale)))) for x in samples)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames)


def synth_sounds():
    sr = 22050
    def env(t, dur, attack=0.012, release=0.16):
        a = min(1.0, t / attack) if attack > 0 else 1.0
        r = min(1.0, max(0.0, dur - t) / release) if release > 0 else 1.0
        return a * r

    dur = 0.58
    rise=[]
    for i in range(int(sr*dur)):
        t=i/sr
        v=0.0
        for start,freq,amp in ((0.00,660,0.75),(0.20,880,0.70)):
            x=t-start
            if 0 <= x < 0.34:
                e=env(x,0.34,0.01,0.16)*math.exp(-2.0*x)
                v += amp*e*(math.sin(2*math.pi*freq*x)+0.18*math.sin(2*math.pi*2*freq*x))
        rise.append(v)
    write_wav('android/app/src/main/res/raw/notification_rise.wav', rise, sr)

    dur = 0.48
    rng=random.Random(2109)
    coin=[]
    partials=((1850,1.0,11.0),(2760,0.72,12.5),(3920,0.46,14.0),(5170,0.28,16.0))
    for i in range(int(sr*dur)):
        t=i/sr
        v=0.0
        for start,gain in ((0.0,1.0),(0.075,0.32)):
            x=t-start
            if x < 0: continue
            for freq,amp,decay in partials:
                v += gain*amp*math.exp(-decay*x)*math.sin(2*math.pi*freq*x)
            if x < 0.018:
                v += gain*0.32*(1-x/0.018)*(rng.random()*2-1)
        coin.append(v)
    write_wav('android/app/src/main/res/raw/notification_ceiling_coin.wav', coin, sr)

    dur = 0.62
    floor=[]
    for i in range(int(sr*dur)):
        t=i/sr
        v=0.0
        for start,freq,amp in ((0.00,520,0.72),(0.22,330,0.62)):
            x=t-start
            if 0 <= x < 0.36:
                e=env(x,0.36,0.012,0.17)*math.exp(-1.8*x)
                v += amp*e*(math.sin(2*math.pi*freq*x)+0.12*math.sin(2*math.pi*1.5*freq*x))
        floor.append(v)
    write_wav('android/app/src/main/res/raw/notification_floor.wav', floor, sr)


patch_parser()
write_notification_helper()
synth_sounds()

replace_once('public/core/ipo-service.js', "const CALENDAR_KEY = 'halka_arz_calendar_cache_v1';", "const CALENDAR_KEY = 'halka_arz_calendar_cache_v2';")
replace_once('android/app/build.gradle', 'versionCode 20', 'versionCode 21')
replace_once('android/app/build.gradle', "versionName '2.3.8'", "versionName '2.3.9'")
replace_once('public/index.html', 'v2.3.8 • Build 20', 'v2.3.9 • Build 21')

for p in Path('test').glob('*.test.js'):
    text = p.read_text(encoding='utf-8')
    text = text.replace('versionCode 20', 'versionCode 21')
    text = text.replace('versionCode 19', 'versionCode 21')
    text = text.replace('2\\.3\\.7', '2\\.3\\.9').replace('2\\.3\\.8', '2\\.3\\.9')
    text = text.replace('2.3.7', '2.3.9').replace('2.3.8', '2.3.9')
    text = text.replace('Build 20', 'Build 21').replace('Build 19', 'Build 21')
    if p.name == 'android-contract.test.js':
        text = text.replace("test('GitHub Actions workflow builds and uploads the debug APK'", "test('GitHub Actions workflow builds and uploads the Play AAB'")
        text = text.replace('assert.match(yaml, /assembleDebug/);', 'assert.match(yaml, /bundleRelease/);')
    p.write_text(text, encoding='utf-8')
