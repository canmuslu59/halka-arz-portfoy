from pathlib import Path
import sys

root = Path(sys.argv[1])


def req_replace(rel, old, new, count=1):
    p = root / rel
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'missing pattern in {rel}: {old[:120]!r}')
    p.write_text(s.replace(old, new, count))


def append_once(rel, marker, text):
    p = root / rel
    s = p.read_text()
    if marker not in s:
        p.write_text(s.rstrip() + '\n\n' + text.strip() + '\n')


# v2.3.6 / code18 identity.
req_replace('android/app/build.gradle', 'versionCode 17', 'versionCode 18')
req_replace('android/app/build.gradle', "versionName '2.3.5'", "versionName '2.3.6'")
req_replace('android/app/src/main/assets/www/index.html', 'v2.3.5 • Build 17', 'v2.3.6 • Build 18')

# BIST floor helper, mirrored in web source and Android packaged assets.
ceiling_block = """export function ceilingPrice(basePrice) {
  const base = finitePositive(basePrice);
  if (base == null) return null;
  const theoretical = base * 1.10;
  const step = bistTickSize(theoretical);
  if (step == null) return null;
  const floored = Math.floor((theoretical + 1e-9) / step) * step;
  return roundForStep(floored, step);
}
"""
floor_block = """
export function floorPrice(basePrice) {
  const base = finitePositive(basePrice);
  if (base == null) return null;
  const theoretical = base * 0.90;
  const step = bistTickSize(theoretical);
  if (step == null) return null;
  const ceiled = Math.ceil((theoretical - 1e-9) / step) * step;
  return roundForStep(ceiled, step);
}
"""
for rel in ('public/core/ipo-analytics.js', 'android/app/src/main/assets/www/core/ipo-analytics.js'):
    p = root / rel
    s = p.read_text()
    if 'export function floorPrice' not in s:
        if ceiling_block not in s:
            raise SystemExit(f'ceilingPrice anchor missing in {rel}')
        s = s.replace(ceiling_block, ceiling_block + floor_block, 1)
    p.write_text(s)


def patch_notification_rules(rel):
    p = root / rel
    s = p.read_text()
    import_line = "import { bistTickSize, ceilingPrice, floorPrice } from './ipo-analytics.js';"
    if import_line not in s:
        s = import_line + '\n\n' + s

    old_state = """  const state = previousState?.day === day
    ? {
        day:String(day || ''),
        stocks:{ ...(previousState.stocks || {}) },
        portfolio:cleanDelivered(previousState.portfolio),
      }
    : freshState(day);
"""
    new_state = """  const state = previousState?.day === day
    ? {
        day:String(day || ''),
        stocks:{ ...(previousState.stocks || {}) },
        portfolio:cleanDelivered(previousState.portfolio),
        limits:{ ...(previousState.limits || {}) },
      }
    : { ...freshState(day), limits:{} };
"""
    if 'limits:{ ...(previousState.limits || {}) }' not in s:
        if old_state not in s:
            raise SystemExit(f'notification state anchor missing in {rel}')
        s = s.replace(old_state, new_state, 1)

    old_hold = """    state.stocks[ticker] = delivered;
  }

  const portfolioDelivered = cleanDelivered(state.portfolio);
"""
    new_hold = """    state.stocks[ticker] = delivered;

    if (holding?.dailySessionActive === false) continue;
    const currentPrice = finite(holding?.currentPrice, NaN);
    const previousClose = finite(holding?.previousClose, NaN);
    if (!(currentPrice > 0) || !(previousClose > 0)) continue;
    const ceiling = ceilingPrice(previousClose);
    const floor = floorPrice(previousClose);
    const ceilingStep = bistTickSize(ceiling) || 0.01;
    const floorStep = bistTickSize(floor) || 0.01;
    const limitState = { ...(state.limits[ticker] || {}) };
    if (ceiling != null && currentPrice >= ceiling - Math.max(0.005, ceilingStep / 2 + 1e-8) && !limitState.ceiling) {
      limitState.ceiling = true;
      events.push({ kind:'ceiling', ticker, currentPrice, limitPrice:ceiling, day:String(day || '') });
    }
    if (floor != null && currentPrice <= floor + Math.max(0.005, floorStep / 2 + 1e-8) && !limitState.floor) {
      limitState.floor = true;
      events.push({ kind:'floor', ticker, currentPrice, limitPrice:floor, day:String(day || '') });
    }
    state.limits[ticker] = limitState;
  }

  const portfolioDelivered = cleanDelivered(state.portfolio);
"""
    if "kind:'ceiling'" not in s:
        if old_hold not in s:
            raise SystemExit(f'notification holding anchor missing in {rel}')
        s = s.replace(old_hold, new_hold, 1)

    if 'export function notificationPayloadForEvent' not in s:
        s = s.rstrip() + """

export function notificationPayloadForEvent(event = {}) {
  const kind = String(event?.kind || 'portfolio');
  const ticker = String(event?.ticker || '').trim().toUpperCase();
  if (kind === 'ceiling') {
    return { kind, ticker, title:`${ticker} tavan yaptı`, body:`${ticker} bugün tavan fiyatına ulaştı.` };
  }
  if (kind === 'floor') {
    return { kind, ticker, title:`${ticker} taban yaptı`, body:`${ticker} bugün taban fiyatına ulaştı.` };
  }
  const level = finite(event?.level, 0);
  const sign = level >= 0 ? '+' : '-';
  const levelText = `${sign}%${Math.abs(level)}`;
  if (kind === 'stock') {
    return { kind, ticker, title:`${ticker} ${level >= 0 ? 'yükseliyor' : 'düşüyor'}`, body:`${ticker} bugün ${levelText} seviyesini geçti.` };
  }
  return { kind:'portfolio', ticker:'', title:'Portföy hareketi', body:`Toplam portföy bugün ${levelText} seviyesini geçti.` };
}
"""
    p.write_text(s)


for rel in ('public/core/notification-rules.js', 'android/app/src/main/assets/www/core/notification-rules.js'):
    patch_notification_rules(rel)

# On-device fallback alert evaluation for fresh quotes only. Do not consume daily
# delivery state before Android notification permission is actually granted.
p = root / 'android/app/src/main/assets/www/app.js'
s = p.read_text()
old_import = "import { normalizeAlertSettings } from './core/notification-rules.js';"
new_import = "import { normalizeAlertSettings, evaluateDailyAlerts, notificationPayloadForEvent } from './core/notification-rules.js';"
if new_import not in s:
    if old_import not in s:
        raise SystemExit('notification-rules app import anchor missing')
    s = s.replace(old_import, new_import, 1)

safe_anchor = "function safeSetLocal(key, value) { try { localStorage.setItem(key, value); } catch {} }\n"
if 'function safeParseLocalJson' not in s:
    if safe_anchor not in s:
        raise SystemExit('safeSetLocal anchor missing')
    s = s.replace(safe_anchor, safe_anchor + "function safeParseLocalJson(key) { try { const raw = safeGetLocal(key); return raw ? JSON.parse(raw) : null; } catch { return null; } }\n", 1)

local_alerts = """const LOCAL_ALERT_STATE_KEY = 'localAlertStateV1';

function evaluateLocalAlerts(portfolio) {
  if (!portfolio || !state.alertSettings?.enabled) return;
  const permission = readNativeNotificationPermission();
  if (permission !== 'granted' && permission !== 'not_required') return;
  const previousState = safeParseLocalJson(LOCAL_ALERT_STATE_KEY);
  const result = evaluateDailyAlerts({
    day:todayIstanbul(),
    threshold:state.alertSettings.threshold,
    enabled:state.alertSettings.enabled,
    holdings:(portfolio.holdings || []).filter(item => Number(item.currentLots || 0) > 0),
    portfolioPct:Number(portfolio.totals?.dailyPct || 0),
    previousState,
  });
  safeSetLocal(LOCAL_ALERT_STATE_KEY, JSON.stringify(result.state));
  for (const event of result.events) {
    const payload = notificationPayloadForEvent(event);
    try { window.AndroidBridge?.showLocalNotification?.(JSON.stringify(payload)); } catch {}
  }
}

"""
if 'function evaluateLocalAlerts' not in s:
    anchor = 'function pushPayload() {'
    if anchor not in s:
        raise SystemExit('pushPayload anchor missing')
    s = s.replace(anchor, local_alerts + anchor, 1)

if 'evaluateLocalAlerts(fresh);' not in s:
    anchor = '      renderPortfolio(fresh);\n'
    if anchor not in s:
        anchor = '    renderPortfolio(fresh);\n'
    if anchor not in s:
        raise SystemExit('fresh render anchor missing')
    s = s.replace(anchor, anchor + anchor[:len(anchor)-len(anchor.lstrip())] + 'evaluateLocalAlerts(fresh);\n', 1)

old_callback = 'window.__notificationPermissionChanged = () => renderSettings();'
new_callback = 'window.__notificationPermissionChanged = () => { renderSettings(); loadPortfolio({ quiet:true, force:true }); };'
if new_callback not in s:
    if old_callback not in s:
        raise SystemExit('permission callback anchor missing')
    s = s.replace(old_callback, new_callback, 1)

old_route = "  if (kind === 'stock' && ticker) {"
new_route = "  if (['stock','ceiling','floor'].includes(kind) && ticker) {"
if new_route not in s:
    if old_route not in s:
        raise SystemExit('push stock route anchor missing')
    s = s.replace(old_route, new_route, 1)

dock_js = """let dockLastScrollY = Math.max(0, window.scrollY || 0);
let dockScrollFrame = 0;
function updateDockVisibility() {
  dockScrollFrame = 0;
  const scrollY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const atTop = scrollY <= 8;
  const atBottom = maxY - scrollY <= 8;
  const movingDown = scrollY > dockLastScrollY + 3;
  const movingUp = scrollY < dockLastScrollY - 3;
  const dock = $('#bottomNav');
  if (dock) {
    if (atTop || atBottom || movingUp) dock.classList.remove('dock-hidden');
    else if (movingDown && scrollY > 40) dock.classList.add('dock-hidden');
  }
  dockLastScrollY = scrollY;
}
function scheduleDockVisibilityUpdate() {
  if (dockScrollFrame) return;
  dockScrollFrame = requestAnimationFrame(updateDockVisibility);
}
window.addEventListener('scroll', scheduleDockVisibilityUpdate, { passive:true });

"""
if 'function updateDockVisibility' not in s:
    anchor = "$('#addFab').addEventListener('click', () => openAddSheet());"
    if anchor not in s:
        raise SystemExit('addFab anchor missing')
    s = s.replace(anchor, dock_js + anchor, 1)
p.write_text(s)

append_once('android/app/src/main/assets/www/styles.css', '/* v2.3.6 scroll-aware floating dock */', """
/* v2.3.6 scroll-aware floating dock */
.bottom-nav{
  transition:opacity .30s ease,transform .30s cubic-bezier(.2,.75,.25,1);
  will-change:opacity,transform;
}
.bottom-nav.dock-hidden{
  opacity:0;
  transform:translate(-50%,calc(100% + 28px));
  pointer-events:none;
}
@media(prefers-reduced-motion:reduce){
  .bottom-nav{transition:opacity .01ms linear,transform .01ms linear}
}
""")

# Native bridge for local alerts.
p = root / 'android/app/src/main/java/com/innative/halkaarz/MainActivity.java'
s = p.read_text()
if 'import java.util.HashMap;' not in s:
    anchor = 'import java.net.URL;\n'
    if anchor not in s:
        raise SystemExit('MainActivity URL import anchor missing')
    s = s.replace(anchor, anchor + 'import java.util.HashMap;\nimport java.util.Map;\n', 1)
bridge = """        @JavascriptInterface
        public void showLocalNotification(String json) {
            try {
                JSONObject parsed = new JSONObject(json == null ? "{}" : json);
                Map<String, String> data = new HashMap<>();
                data.put("kind", parsed.optString("kind", "portfolio"));
                data.put("ticker", parsed.optString("ticker", ""));
                data.put("title", parsed.optString("title", "Halka Arz Portföyüm"));
                data.put("body", parsed.optString("body", "Portföyünüzde yeni bir hareket var."));
                activity.runOnUiThread(() -> NotificationHelper.show(activity, data));
            } catch (Exception ignored) {}
        }

"""
if 'public void showLocalNotification(String json)' not in s:
    anchor = """        @JavascriptInterface
        public void syncPushConfig(String json) {
"""
    if anchor not in s:
        raise SystemExit('syncPushConfig anchor missing')
    s = s.replace(anchor, bridge + anchor, 1)
p.write_text(s)

# Fresh high-importance channel id: Android will not increase importance of an existing
# channel on an app update.
p = root / 'android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java'
s = p.read_text()
s = s.replace('private static final String CHANNEL_MARKET = "market_moves";', 'private static final String CHANNEL_MARKET = "market_moves_v2";', 1)
s = s.replace('new NotificationChannel(CHANNEL_MARKET, "Borsa hareketleri", NotificationManager.IMPORTANCE_DEFAULT)', 'new NotificationChannel(CHANNEL_MARKET, "Borsa hareketleri", NotificationManager.IMPORTANCE_HIGH)', 1)
s = s.replace('.setPriority(NotificationCompat.PRIORITY_DEFAULT);', '.setPriority(NotificationCompat.PRIORITY_HIGH);', 1)
p.write_text(s)
