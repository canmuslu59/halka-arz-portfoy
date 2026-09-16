import { BOTTOM_NAV, normalizeRoute, routeBackTarget, routeMeta } from './router.js';
import { buildPremiumAnalytics, buildPremiumSeries } from '../core/premium-analytics.js';
import { createPremiumRuleStore, validatePremiumRule } from '../core/premium-alerts.js';
import { createWatchlistStore } from '../core/premium-watchlist.js';
import { parseBackupPayload, serializeBackupPayload } from '../core/premium-backup.js';

const fmtMoney = new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtNumber = new Intl.NumberFormat('tr-TR', { maximumFractionDigits:2 });
const fmtPct = new Intl.NumberFormat('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2, signDisplay:'always' });
const DEFAULT_ALERT = () => ({ id:null, step:1, target:'stock', type:null, ticker:'', value:'' });
const VALUE_ALERT_TYPES = new Set(['price_above','price_below','stock_daily_rise','stock_daily_fall','stock_daily_pct','portfolio_positive','portfolio_negative']);
const STOCK_ALERT_TYPES = new Set(['price_above','price_below','stock_daily_rise','stock_daily_fall','stock_daily_pct','ceiling','floor']);

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function money(value) { const n = finite(value); return n == null ? '—' : fmtMoney.format(n); }
function percent(value) { const n = finite(value); return n == null ? '—' : `${fmtPct.format(n)}%`; }
function signClass(value) { const n = finite(value); return n > 0 ? 'positive' : n < 0 ? 'negative' : 'neutral'; }
function esc(value='') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function displayDate(value) {
  if (!value) return '—';
  const d = new Date(String(value).length === 10 ? `${value}T12:00:00+03:00` : value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('tr-TR', { day:'numeric', month:'short', year:'numeric', timeZone:'Europe/Istanbul' }).format(d);
}
function holdings(context) { return Array.isArray(context?.portfolio?.holdings) ? context.portfolio.holdings : []; }
function historyRows(context) {
  if (Array.isArray(context?.history) && context.history.length) return context.history;
  return Array.isArray(context?.portfolio?.history) ? context.portfolio.history : [];
}
function calendarItems(context) { return Array.isArray(context?.calendar?.items) ? context.calendar.items : []; }
function hasPortfolio(context) { return holdings(context).length > 0; }
function safeStorageGet(storage, key) { try { return storage?.getItem?.(key); } catch { return null; } }
function safeStorageSet(storage, key, value) { try { storage?.setItem?.(key, value); return true; } catch { return false; } }

function ensureStylesheet() {
  if (document.querySelector('link[data-premium-mini-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./premium.css', import.meta.url).href;
  link.dataset.premiumMiniStyle = 'true';
  document.head.appendChild(link);
}

function chartSvg(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return '<div class="premium-empty compact">Bu aralık için yeterli geçmiş veri yok.</div>';
  const values = rows.map(row => finite(row.y)).filter(v => v != null);
  if (values.length < 2) return '<div class="premium-empty compact">Bu aralık için yeterli geçmiş veri yok.</div>';
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { const pad = Math.max(1, Math.abs(min) * .01); min -= pad; max += pad; }
  const width = 360, height = 178, px = 8, py = 14;
  const x = i => px + (i / Math.max(1, rows.length - 1)) * (width - px * 2);
  const y = v => py + ((max - v) / (max - min)) * (height - py * 2);
  const points = rows.map((row, i) => `${x(i).toFixed(2)},${y(row.y).toFixed(2)}`).join(' ');
  const area = `${px},${height - py} ${points} ${width - px},${height - py}`;
  return `<div class="premium-chart-wrap">
    <svg class="premium-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Portföy grafiği">
      <defs><linearGradient id="premiumChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7b61ff" stop-opacity=".34"/><stop offset="1" stop-color="#3f8cff" stop-opacity="0"/></linearGradient></defs>
      <polygon points="${area}" fill="url(#premiumChartFill)"/>
      <polyline points="${points}" fill="none" stroke="#8f7cff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="premium-chart-axis"><span>${esc(displayDate(rows[0].date))}</span><span>${esc(displayDate(rows.at(-1).date))}</span></div>
  </div>`;
}

function allocationVisual(analytics) {
  const rows = analytics.allocationByHolding || [];
  if (!rows.length) return '<div class="premium-empty compact">Dağılım için aktif hisse verisi yok.</div>';
  const palette = ['#8a6cff','#448dff','#3cd6a0','#ffb55e','#d577ff','#ff7485','#67cad8'];
  let cursor = 0;
  const slices = rows.map((row, i) => {
    const start = cursor;
    cursor += Number(row.pct || 0);
    return `${palette[i % palette.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  const legend = rows.slice(0, 5).map((row, i) => `<div class="premium-legend-row"><i style="--legend:${palette[i % palette.length]}"></i><strong>${esc(row.ticker)}</strong><span>%${fmtNumber.format(row.pct)}</span></div>`).join('');
  return `<div class="premium-allocation"><div class="premium-donut" style="background:conic-gradient(${slices.join(',')})"><span>${rows.length}<small>hisse</small></span></div><div class="premium-legend">${legend}</div></div>`;
}

function homeScreen(state) {
  const context = state.context;
  const portfolio = context.portfolio;
  const totals = portfolio?.totals || {};
  const analytics = buildPremiumAnalytics({ portfolio, history:historyRows(context) });
  if (!hasPortfolio(context)) {
    return `<section class="premium-hero premium-hero-empty">
      <span class="premium-status-pill">👑 PREMIUM TEST AKTİF</span>
      <h1>Premium’u Keşfet</h1>
      <p>Portföyünü eklediğinde analizler gerçek verilerinle oluşur.</p>
      <div class="premium-symbol-strip"><span>ASELS</span><span>THYAO</span><span>TUPRS</span><span>BIMAS</span><span>KCHOL</span></div>
    </section>
    <section class="premium-action-grid">
      ${homeAction('analytics','▥','Analiz','Portföyünü derinlemesine gör')}
      ${homeAction('alerts','◉','Akıllı Alarmlar','Kurallarını tek yerde yönet')}
      ${homeAction('ipo','◆','Halka Arz Pro','Gerçek arz verilerini incele')}
      ${homeAction('watchlist','★','Takip','İzlemek istediklerini ayır')}
    </section>`;
  }
  return `<section class="premium-hero">
    <div class="premium-hero-top"><span class="premium-status-pill">👑 PREMIUM TEST AKTİF</span><span class="premium-subtle">${holdings(context).length} hisse</span></div>
    <span class="premium-kicker">PORTFÖY DEĞERİ</span>
    <strong class="premium-big-value">${money(finite(totals.totalWealth) ?? finite(totals.activeValue))}</strong>
    <div class="premium-performance-line">
      <span class="${signClass(analytics.dailyProfit)}">Bugün ${money(analytics.dailyProfit)} · ${percent(analytics.dailyPct)}</span>
      <span class="${signClass(analytics.totalProfit)}">Toplam ${money(analytics.totalProfit)} · ${percent(analytics.totalProfitPct)}</span>
    </div>
    <div class="premium-symbol-strip"><span>ASELS</span><span>THYAO</span><span>TUPRS</span><span>BIMAS</span><span>KCHOL</span></div>
  </section>
  <section class="premium-action-grid">
    ${homeAction('analytics','▥','Analiz','Getiri, K/Z ve drawdown')}
    ${homeAction('alerts','◉','Akıllı Alarmlar','${state.ruleStore.list().filter(rule => rule.enabled).length} aktif kural')}
    ${homeAction('ipo','◆','Halka Arz Pro','Arz detayları ve senaryolar')}
    ${homeAction('watchlist','★','Takip','${state.watchlist.all().length} kayıt')}
  </section>
  <section class="premium-card premium-home-allocation"><div class="premium-section-head"><div><span class="premium-kicker">DAĞILIM</span><h2>Portföy dengesi</h2></div><button data-route="analytics" class="premium-text-btn">Detay</button></div>${allocationVisual(analytics)}</section>`;
}

function homeAction(route, icon, title, text) {
  return `<button class="premium-action-card" data-route="${route}" type="button"><span class="premium-action-icon">${icon}</span><span><strong>${title}</strong><small>${text}</small></span><b>›</b></button>`;
}

function analyticsScreen(state) {
  const context = state.context;
  if (!hasPortfolio(context)) return emptyScreen('▥','Henüz portföy verisi yok','Analizler gerçek portföyünle otomatik oluşur.');
  const analytics = buildPremiumAnalytics({ portfolio:context.portfolio, history:historyRows(context) });
  const series = buildPremiumSeries({ history:historyRows(context), metric:state.metric, range:state.range });
  const metricLabels = { value:'Portföy Değeri', returnPct:'Getiri', profit:'K/Z', drawdown:'Drawdown' };
  const best = analytics.holdingContributions?.[0] || null;
  const worst = analytics.holdingContributions?.at(-1) || null;
  return `<section class="premium-screen-intro"><span class="premium-kicker">ANALİZ</span><h1>Portföyün tek bakışta</h1></section>
  <section class="premium-card premium-chart-card">
    <div class="premium-metric-tabs">${Object.entries(metricLabels).map(([id,label]) => `<button data-metric="${id}" class="${state.metric === id ? 'active' : ''}">${label}</button>`).join('')}</div>
    <div class="premium-chart-value"><strong>${metricValue(state.metric, analytics, context)}</strong><span>${metricLabels[state.metric]}</span></div>
    ${chartSvg(series)}
    <div class="premium-range-tabs">${['1H','1A','3A','1Y','ALL'].map(id => `<button data-range="${id}" class="${state.range === id ? 'active' : ''}">${id === 'ALL' ? 'Tümü' : id}</button>`).join('')}</div>
  </section>
  <section class="premium-card"><div class="premium-section-head"><div><span class="premium-kicker">DAĞILIM</span><h2>Varlık ağırlıkları</h2></div></div>${allocationVisual(analytics)}</section>
  <section class="premium-summary-grid">
    ${summaryTile('En çok katkı', best?.ticker || '—', best ? money(best.totalProfit) : '—', best?.totalProfit)}
    ${summaryTile('En çok geri çeken', worst?.ticker || '—', worst ? money(worst.totalProfit) : '—', worst?.totalProfit)}
    ${summaryTile('Yoğunlaşma', 'İlk 3 hisse', `%${fmtNumber.format(analytics.topThreeSharePct || 0)}`, null)}
  </section>`;
}

function metricValue(metric, analytics, context) {
  if (metric === 'returnPct') return percent(analytics.totalProfitPct);
  if (metric === 'profit') return money(analytics.totalProfit);
  if (metric === 'drawdown') return percent(analytics.currentDrawdownPct);
  return money(finite(context?.portfolio?.totals?.totalWealth) ?? finite(context?.portfolio?.totals?.activeValue));
}
function summaryTile(label, title, value, sign) {
  return `<article class="premium-summary-tile"><span>${label}</span><strong>${esc(title)}</strong><b class="${sign == null ? 'neutral' : signClass(sign)}">${esc(value)}</b></article>`;
}

const ALERT_LABELS = {
  price_above:'Fiyat üstüne çıkınca', price_below:'Fiyat altına inince', stock_daily_rise:'Günlük yükseliş', stock_daily_fall:'Günlük düşüş', stock_daily_pct:'Günlük hareket', ceiling:'Tavan olunca', floor:'Taban olunca', portfolio_positive:'Portföy yükselince', portfolio_negative:'Portföy düşünce',
};
function alertRuleText(rule) {
  const label = ALERT_LABELS[rule.type] || rule.type;
  const ticker = rule.ticker ? `${rule.ticker} · ` : '';
  const value = rule.value == null ? '' : (rule.type.startsWith('price_') ? ` ${money(rule.value)}` : ` %${fmtNumber.format(rule.value)}`);
  return `${ticker}${label}${value}`;
}

function alertsScreen(state) {
  const rules = state.ruleStore.list();
  return `<section class="premium-screen-intro premium-intro-row"><div><span class="premium-kicker">AKILLI ALARMLAR</span><h1>Fırsatı kaçırma</h1></div><button class="premium-primary compact" data-action="new-alert">+ Alarm</button></section>
    <button class="premium-test-notification" data-action="test-notification"><span>◉</span><strong>Test Bildirimi Gönder</strong><b>›</b></button>
    <section class="premium-list">${rules.length ? rules.map(rule => `<article class="premium-list-card"><button class="premium-card-main" data-action="edit-rule" data-rule-id="${esc(rule.id)}"><span class="premium-list-icon">${rule.ticker ? '↗' : '▥'}</span><span><strong>${esc(rule.ticker || 'Portföy')}</strong><small>${esc(alertRuleText(rule))}</small></span></button><label class="premium-switch"><input type="checkbox" data-action="toggle-rule" data-rule-id="${esc(rule.id)}" ${rule.enabled ? 'checked' : ''}><i></i></label><button class="premium-icon-danger" data-action="delete-rule" data-rule-id="${esc(rule.id)}" aria-label="Alarmı sil">×</button></article>`).join('') : '<div class="premium-empty"><span>◉</span><strong>Henüz alarm yok</strong><small>İlk kuralını birkaç adımda oluştur.</small></div>'}</section>`;
}

function alertEditorScreen(state) {
  const draft = state.alertDraft;
  const step = Math.max(1, Math.min(4, Number(draft.step || 1)));
  return `<section class="premium-screen-intro"><span class="premium-kicker">ALARM OLUŞTUR</span><h1>${step}/4 · ${alertStepTitle(step)}</h1></section>
  <div class="premium-stepper">${[1,2,3,4].map(n => `<i class="${n <= step ? 'active' : ''}"></i>`).join('')}</div>
  <section class="premium-card premium-editor">${alertStepBody(state)}</section>`;
}
function alertStepTitle(step) { return ['','Hedef','Kural','Değer','Kontrol'][step]; }
function alertStepBody(state) {
  const d = state.alertDraft;
  if (d.step === 1) return `<div class="premium-choice-grid"><button data-alert-target="stock" class="${d.target === 'stock' ? 'active' : ''}"><span>↗</span><strong>Hisse</strong><small>Tek bir hisseyi izle</small></button><button data-alert-target="portfolio" class="${d.target === 'portfolio' ? 'active' : ''}"><span>▥</span><strong>Portföy</strong><small>Toplam hareketi izle</small></button></div>`;
  if (d.step === 2) {
    const options = d.target === 'portfolio' ? ['portfolio_positive','portfolio_negative'] : ['price_above','price_below','stock_daily_rise','stock_daily_fall','ceiling','floor'];
    return `<div class="premium-rule-grid">${options.map(type => `<button data-alert-type="${type}" class="${d.type === type ? 'active' : ''}"><strong>${ALERT_LABELS[type]}</strong></button>`).join('')}</div>`;
  }
  if (d.step === 3) {
    const tickerInput = STOCK_ALERT_TYPES.has(d.type) ? `<label class="premium-field"><span>Hisse kodu</span><input id="premiumAlertTicker" data-draft-field="ticker" value="${esc(d.ticker)}" placeholder="Örn. ASELS" maxlength="8" autocapitalize="characters"><small>${holdings(state.context).map(h => esc(h.ticker)).slice(0,5).join(' · ') || 'Portföyündeki hisse kodunu yaz'}</small></label>` : '';
    const valueInput = VALUE_ALERT_TYPES.has(d.type) ? `<label class="premium-field"><span>${d.type.startsWith('price_') ? 'Hedef fiyat' : 'Yüzde eşiği'}</span><input id="premiumAlertValue" data-draft-field="value" type="number" min="0.01" step="0.01" value="${esc(d.value)}" placeholder="${d.type.startsWith('price_') ? '0,00' : '3'}"></label>` : '<div class="premium-note">Bu alarm tavan/taban referans değeri doğrulandığında çalışır.</div>';
    return `${tickerInput}${valueInput}<button class="premium-primary" data-action="alert-review">Devam</button>`;
  }
  const preview = { id:d.id, type:d.type, ticker:d.target === 'stock' ? d.ticker : null, value:VALUE_ALERT_TYPES.has(d.type) ? d.value : null };
  return `<div class="premium-review"><span class="premium-list-icon">✓</span><strong>${esc(preview.ticker || 'Portföy')}</strong><p>${esc(alertRuleText(preview))}</p></div><button class="premium-primary" data-action="save-alert">Alarmı Kaydet</button>`;
}

function ipoScreen(state) {
  const items = calendarItems(state.context);
  if (state.calendarLoading) return emptyScreen('◆','Halka arzlar yükleniyor','Güncel kaynak kontrol ediliyor.');
  return `<section class="premium-screen-intro premium-intro-row"><div><span class="premium-kicker">HALKA ARZ PRO</span><h1>Arzları araştır</h1></div><button class="premium-icon-button" data-action="refresh-calendar" aria-label="Takvimi yenile">↻</button></section>
  <section class="premium-list">${items.length ? items.map(item => `<button class="premium-ipo-card" data-action="ipo-detail" data-ticker="${esc(item.ticker)}"><span><strong>${esc(item.ticker || '—')}</strong><small>${esc(item.company || 'Şirket bilgisi bekleniyor')}</small></span><span class="premium-ipo-side"><b>${money(item.ipoPrice)}</b><small>${esc(item.status === 'active' ? 'Talepte' : item.status === 'upcoming' ? 'Yaklaşan' : item.status === 'completed' ? 'Tamamlandı' : 'Durum bekleniyor')}</small></span><i>›</i></button>`).join('') : '<div class="premium-empty"><span>◆</span><strong>Gösterilecek halka arz bulunamadı</strong><small>Kaynakta yeni veri olduğunda burada görünür.</small></div>'}</section>`;
}

function ipoDetailScreen(state) {
  const item = state.selectedIpoDetail || calendarItems(state.context).find(x => String(x.ticker).toUpperCase() === state.selectedIpo) || null;
  if (!item) return emptyScreen('◆','Detay bulunamadı','Takvim ekranına dönüp tekrar deneyebilirsin.');
  const price = finite(item.ipoPrice);
  const scenarios = price == null ? '' : `<section class="premium-card"><div class="premium-section-head"><div><span class="premium-kicker">SENARYO</span><h2>Teorik tavan tablosu</h2></div></div><div class="premium-scenario-list">${Array.from({length:5}, (_,i) => { const day=i+1; return `<div><span>${day}. gün</span><strong>${money(price * (1.10 ** day))}</strong></div>`; }).join('')}</div><small class="premium-disclaimer">Yalnız %10 günlük fiyat limiti varsayımıyla matematiksel senaryodur; gelecek fiyat tahmini değildir.</small></section>`;
  return `<section class="premium-screen-intro"><span class="premium-kicker">HALKA ARZ PRO</span><h1>${esc(item.ticker || '—')}</h1><p>${esc(item.company || '')}</p></section>
  <section class="premium-detail-grid">${detailTile('Arz fiyatı', money(item.ipoPrice))}${detailTile('Talep tarihleri', item.offerDates || '—')}${detailTile('Dağıtım', item.distributionMethod || '—')}${detailTile('Sektör', item.sector || '—')}</section>
  <button class="premium-secondary full" data-action="toggle-watch" data-ticker="${esc(item.ticker)}">${state.watchlist.has(item.ticker) ? '★ Takipten Çıkar' : '☆ Takibe Ekle'}</button>${scenarios}`;
}
function detailTile(label, value) { return `<article class="premium-detail-tile"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`; }

function watchlistScreen(state) {
  const values = state.watchlist.all();
  const hs = holdings(state.context);
  const cis = calendarItems(state.context);
  return `<section class="premium-screen-intro premium-intro-row"><div><span class="premium-kicker">TAKİP</span><h1>İzleme listesi</h1></div><span class="premium-count">${values.length}</span></section>
  <form class="premium-inline-form" data-form="watchlist"><input name="ticker" placeholder="Hisse kodu" maxlength="8" autocapitalize="characters"><button class="premium-primary compact">Ekle</button></form>
  <section class="premium-list">${values.length ? values.map(ticker => { const h=hs.find(x => String(x.ticker).toUpperCase()===ticker); const ipo=cis.find(x => String(x.ticker).toUpperCase()===ticker); return `<article class="premium-watch-card"><span><strong>${esc(ticker)}</strong><small>${esc(h?.company || ipo?.company || 'Takip edilen kayıt')}</small></span><span><b>${h && finite(h.currentPrice) != null ? money(h.currentPrice) : 'Fiyat yok'}</b>${h && finite(h.dailyPct) != null ? `<small class="${signClass(h.dailyPct)}">${percent(h.dailyPct)}</small>` : ''}</span><button data-action="remove-watch" data-ticker="${esc(ticker)}" aria-label="Takipten çıkar">×</button></article>`; }).join('') : '<div class="premium-empty"><span>★</span><strong>Takip listen boş</strong><small>İzlemek istediğin hisse veya arzı ekle.</small></div>'}</section>`;
}

function calendarScreen(state) {
  const items = calendarItems(state.context);
  if (state.calendarLoading) return emptyScreen('◫','Takvim yükleniyor','Güncel halka arz tarihleri getiriliyor.');
  return `<section class="premium-screen-intro"><span class="premium-kicker">PREMIUM TAKVİM</span><h1>Yaklaşan tarihler</h1></section><section class="premium-timeline">${items.length ? items.map(item => `<button data-action="ipo-detail" data-ticker="${esc(item.ticker)}"><time>${esc(item.offerDates || 'Tarih bekleniyor')}</time><span><strong>${esc(item.ticker || '—')}</strong><small>${esc(item.company || '')}</small></span><b>${esc(item.status === 'active' ? 'Talepte' : item.status === 'upcoming' ? 'Yaklaşan' : 'Tamamlandı')}</b></button>`).join('') : '<div class="premium-empty"><span>◫</span><strong>Gösterilecek halka arz bulunamadı</strong><small>Yeni takvim verisi olduğunda burada görünür.</small></div>'}</section>`;
}

function backupScreen() {
  return `<section class="premium-screen-intro"><span class="premium-kicker">VERİLERİN</span><h1>Yedekle & taşı</h1><p>Portföy, Premium alarmları, takip listesi ve desteklenen ayarlar.</p></section>
    <section class="premium-backup-actions"><button class="premium-action-card large" data-action="export-backup"><span class="premium-action-icon">⇩</span><span><strong>Yedeği Dışa Aktar</strong><small>Doğrulanabilir JSON dosyası</small></span><b>›</b></button><label class="premium-action-card large"><span class="premium-action-icon">⇧</span><span><strong>Yedeği İçe Aktar</strong><small>Önce doğrula, sonra geri yükle</small></span><b>›</b><input id="premiumBackupInput" type="file" accept="application/json,.json" hidden></label></section>
    <section class="premium-card premium-cloud"><span>☁</span><div><strong>Bulut Yedekleme</strong><small>Yakında</small></div></section><div class="premium-note">Geçersiz veya bozuk dosyalar mevcut verinin üzerine yazılmaz.</div>`;
}

function membershipScreen() {
  return `<section class="premium-membership-hero"><span class="premium-crown">♛</span><span class="premium-status-pill">Premium Test Aktif</span><h1>Daha az gürültü.<br>Daha güçlü araçlar.</h1></section>
  <section class="premium-benefits"><span>✓ Gelişmiş portföy analizi</span><span>✓ Akıllı hisse ve portföy alarmları</span><span>✓ Halka Arz Pro araştırma ekranı</span><span>✓ Yerel yedekleme ve aktarım</span></section>
  <section class="premium-plan-grid"><article><span>Aylık</span><strong>₺49,99</strong><small>Örnek fiyat</small></article><article class="featured"><span>Yıllık</span><strong>₺299,99</strong><b>%40 avantaj</b><small>Örnek fiyat</small></article></section>
  <button class="premium-test-active" type="button" disabled>Premium Test Aktif</button><p class="premium-disclaimer centered">Bu test sürümünde gerçek satın alma veya Play Billing işlemi yapılmaz.</p>`;
}

function menuScreen(state) {
  const items = [
    ['watchlist','★','Takip Listesi',`${state.watchlist.all().length} kayıt`],
    ['calendar','◫','Premium Takvim','Halka arz tarihleri'],
    ['backup','⇅','Yedekleme & Aktarım','JSON ile güvenli taşı'],
    ['membership','♛','Premium Üyelik','Premium Test Aktif'],
  ];
  return `<section class="premium-screen-intro"><span class="premium-kicker">MENÜ</span><h1>Premium araçları</h1></section><section class="premium-menu-list">${items.map(([route,icon,title,sub]) => `<button data-route="${route}"><span>${icon}</span><div><strong>${title}</strong><small>${sub}</small></div><b>›</b></button>`).join('')}</section><section class="premium-version"><span>Halka Arz Premium Test</span><small>v2.4.7 · ayrı test paketi</small></section>`;
}

function emptyScreen(icon, title, text) { return `<div class="premium-empty premium-empty-large"><span>${icon}</span><strong>${title}</strong><small>${text}</small></div>`; }

function screenFor(state) {
  switch (state.route) {
    case 'analytics': return analyticsScreen(state);
    case 'alerts': return alertsScreen(state);
    case 'alert-editor': return alertEditorScreen(state);
    case 'ipo': return ipoScreen(state);
    case 'ipo-detail': return ipoDetailScreen(state);
    case 'watchlist': return watchlistScreen(state);
    case 'calendar': return calendarScreen(state);
    case 'backup': return backupScreen(state);
    case 'membership': return membershipScreen(state);
    case 'menu': return menuScreen(state);
    default: return homeScreen(state);
  }
}

function shellTemplate(state) {
  const meta = routeMeta(state.route);
  const back = routeBackTarget(state.route);
  return `<div class="premium-mini-shell" role="dialog" aria-modal="true" aria-label="Halka Arz Premium">
    <header class="premium-mini-header"><button class="premium-back-btn" data-action="back" aria-label="${back ? 'Geri' : 'Premium’dan çık'}">${back ? '‹' : '×'}</button><div><span>HALKA ARZ</span><strong>${esc(meta.title)}</strong></div><span class="premium-header-mark">♛</span></header>
    <main class="premium-mini-content" id="premiumMiniContent">${screenFor(state)}</main>
    <nav class="premium-bottom-nav" aria-label="Premium menüsü">${BOTTOM_NAV.map(item => `<button data-route="${item.id}" class="${meta.nav === item.id ? 'active' : ''}" aria-current="${meta.nav === item.id ? 'page' : 'false'}"><span>${item.icon}</span><b>${item.label}</b></button>`).join('')}</nav>
    <div class="premium-mini-toast" role="status" aria-live="polite"></div>
  </div>`;
}

export function createPremiumApp({ storage = globalThis.localStorage, bridge = {} } = {}) {
  const ruleStore = createPremiumRuleStore(storage);
  const watchlist = createWatchlistStore(storage);
  const state = {
    route:'home', context:{ portfolio:null, history:[], calendar:null }, metric:'value', range:'1A',
    alertDraft:DEFAULT_ALERT(), selectedIpo:null, selectedIpoDetail:null, calendarLoading:false,
    ruleStore, watchlist,
  };
  let root = null;
  let mounted = false;
  let previousBackHandler = null;
  let installedBackHandler = null;
  let toastTimer = null;

  const notify = message => {
    const el = root?.querySelector('.premium-mini-toast');
    if (el) { el.textContent = String(message || ''); el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
    try { bridge.showToast?.(message); } catch {}
  };

  function refresh() {
    if (!root) return;
    root.innerHTML = shellTemplate(state);
    root.querySelector('#premiumMiniContent')?.scrollTo?.({ top:0, behavior:'instant' });
  }

  async function ensureCalendar({ force = false } = {}) {
    if (state.calendarLoading || typeof bridge.loadCalendar !== 'function') return;
    state.calendarLoading = true;
    refresh();
    try {
      const calendar = await bridge.loadCalendar({ force });
      if (calendar) state.context.calendar = calendar;
    } catch (error) { notify(error?.message || 'Takvim verisi alınamadı.'); }
    finally { state.calendarLoading = false; refresh(); }
  }

  function navigate(route) {
    const next = normalizeRoute(route);
    state.route = next;
    if (next !== 'ipo-detail') { state.selectedIpo = null; state.selectedIpoDetail = null; }
    refresh();
    if ((next === 'ipo' || next === 'calendar') && !calendarItems(state.context).length) ensureCalendar();
  }

  function exitPremium() {
    close();
    try {
      if (typeof bridge.onExit === 'function') bridge.onExit();
      else if (window.history.state?.view === 'pro' && window.history.length > 1) window.history.back();
    } catch {}
  }

  function handleBack() {
    const target = routeBackTarget(state.route);
    if (target) { navigate(target); return true; }
    exitPremium();
    return true;
  }

  function installBackHandler() {
    if (installedBackHandler) return;
    previousBackHandler = window.__handleAndroidBack;
    installedBackHandler = () => handleBack();
    window.__handleAndroidBack = installedBackHandler;
  }

  function restoreBackHandler() {
    if (installedBackHandler && window.__handleAndroidBack === installedBackHandler) window.__handleAndroidBack = previousBackHandler;
    installedBackHandler = null;
    previousBackHandler = null;
  }

  function beginAlert(rule = null) {
    if (rule) {
      const target = STOCK_ALERT_TYPES.has(rule.type) ? 'stock' : 'portfolio';
      state.alertDraft = { id:rule.id, step:3, target, type:rule.type, ticker:rule.ticker || '', value:rule.value ?? '' };
    } else state.alertDraft = DEFAULT_ALERT();
    navigate('alert-editor');
  }

  function validateDraft() {
    const d = state.alertDraft;
    return validatePremiumRule({ id:d.id, type:d.type, ticker:d.target === 'stock' ? d.ticker : null, value:VALUE_ALERT_TYPES.has(d.type) ? d.value : null, enabled:true });
  }

  async function openIpo(ticker) {
    const value = String(ticker || '').toUpperCase();
    const base = calendarItems(state.context).find(item => String(item.ticker || '').toUpperCase() === value) || { ticker:value };
    state.selectedIpo = value;
    state.selectedIpoDetail = base;
    state.route = 'ipo-detail';
    refresh();
    if (typeof bridge.loadIpoDetail === 'function') {
      try {
        const detail = await bridge.loadIpoDetail(base);
        if (detail && state.selectedIpo === value) { state.selectedIpoDetail = { ...base, ...detail }; refresh(); }
      } catch {}
    }
  }

  async function exportBackup() {
    try {
      const portfolio = typeof bridge.loadPortfolioData === 'function' ? await bridge.loadPortfolioData() : state.context.portfolio;
      const text = serializeBackupPayload({
        portfolio,
        premiumRules:ruleStore.list(),
        watchlist:watchlist.all(),
        settings:{ themePreference:safeStorageGet(storage,'themePreference'), holdingSort:safeStorageGet(storage,'holdingSort') },
      });
      const blob = new Blob([text], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `halka-arz-premium-yedek-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Yedek dosyası hazırlandı.');
    } catch (error) { notify(error?.message || 'Yedek oluşturulamadı.'); }
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const parsed = parseBackupPayload(await file.text());
      const validatedRules = parsed.premiumRules.map(rule => validatePremiumRule(rule));
      if (typeof bridge.savePortfolioData !== 'function') throw new Error('Portföy geri yükleme köprüsü kullanılamıyor.');
      await bridge.savePortfolioData(parsed.portfolio);
      safeStorageSet(storage, ruleStore.storageKey, JSON.stringify(validatedRules));
      safeStorageSet(storage, watchlist.storageKey, JSON.stringify(parsed.watchlist));
      if (parsed.settings.themePreference) safeStorageSet(storage, 'themePreference', parsed.settings.themePreference);
      if (parsed.settings.holdingSort) safeStorageSet(storage, 'holdingSort', parsed.settings.holdingSort);
      if (typeof bridge.loadPortfolioData === 'function') state.context.portfolio = await bridge.loadPortfolioData();
      notify(`Yedek geri yüklendi: ${parsed.portfolio.holdings.length} portföy kaydı.`);
      refresh();
    } catch (error) { notify(error?.message || 'Yedek içe aktarılamadı.'); }
  }

  async function handleClick(event) {
    const routeButton = event.target.closest('[data-route]');
    if (routeButton) { navigate(routeButton.dataset.route); return; }
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'back') { handleBack(); return; }
    if (action === 'new-alert') { beginAlert(); return; }
    if (action === 'edit-rule') { const rule=ruleStore.list().find(x => x.id===el.dataset.ruleId); if (rule) beginAlert(rule); return; }
    if (action === 'delete-rule') { if (ruleStore.remove(el.dataset.ruleId)) { notify('Alarm silindi.'); refresh(); } return; }
    if (action === 'test-notification') {
      let sent = false;
      try { sent = Boolean(await bridge.showLocalNotification?.({ title:'Premium Test', body:'Akıllı alarm bildirimleri hazır.', kind:'premium_test' })); } catch {}
      notify(sent ? 'Test bildirimi gönderildi.' : 'Bildirim gönderilemedi. Bildirim iznini kontrol et.'); return;
    }
    if (action === 'alert-review') {
      try { validateDraft(); state.alertDraft.step=4; refresh(); } catch (error) { notify(error.message); } return;
    }
    if (action === 'save-alert') {
      try { ruleStore.upsert(validateDraft()); notify(state.alertDraft.id ? 'Alarm güncellendi.' : 'Alarm oluşturuldu.'); state.alertDraft=DEFAULT_ALERT(); navigate('alerts'); } catch (error) { notify(error.message); } return;
    }
    if (action === 'ipo-detail') { await openIpo(el.dataset.ticker); return; }
    if (action === 'refresh-calendar') { await ensureCalendar({ force:true }); return; }
    if (action === 'toggle-watch') { const added=watchlist.toggle(el.dataset.ticker); notify(added ? 'Takibe eklendi.' : 'Takipten çıkarıldı.'); refresh(); return; }
    if (action === 'remove-watch') { if (watchlist.remove(el.dataset.ticker)) { notify('Takipten çıkarıldı.'); refresh(); } return; }
    if (action === 'export-backup') { await exportBackup(); }
  }

  function handleChange(event) {
    const target = event.target;
    if (target.matches('[data-action="toggle-rule"]')) { ruleStore.setEnabled(target.dataset.ruleId, target.checked); notify(target.checked ? 'Alarm açıldı.' : 'Alarm duraklatıldı.'); return; }
    if (target.matches('[data-draft-field]')) { const key=target.dataset.draftField; state.alertDraft[key] = key === 'ticker' ? target.value.toUpperCase().replace(/[^A-Z0-9]/g,'') : target.value; }
    if (target.id === 'premiumBackupInput' && target.files?.[0]) importBackup(target.files[0]);
  }

  function handleSubmit(event) {
    const form = event.target.closest('form');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.form === 'watchlist') {
      const ticker = String(new FormData(form).get('ticker') || '').toUpperCase();
      if (watchlist.add(ticker)) { form.reset(); notify('Takibe eklendi.'); refresh(); }
      else notify('Geçerli ve yeni bir hisse kodu gir.');
    }
  }

  function handleRouteChoice(event) {
    const metric = event.target.closest('[data-metric]');
    if (metric) { state.metric=metric.dataset.metric; refresh(); return true; }
    const range = event.target.closest('[data-range]');
    if (range) { state.range=range.dataset.range; refresh(); return true; }
    const target = event.target.closest('[data-alert-target]');
    if (target) { state.alertDraft.target=target.dataset.alertTarget; state.alertDraft.type=null; state.alertDraft.step=2; refresh(); return true; }
    const type = event.target.closest('[data-alert-type]');
    if (type) { state.alertDraft.type=type.dataset.alertType; state.alertDraft.step=3; refresh(); return true; }
    return false;
  }

  function clickListener(event) { if (!handleRouteChoice(event)) handleClick(event); }
  function popStateListener() { if (mounted && window.history.state?.view !== 'pro') close(); }

  function ensureRoot() {
    ensureStylesheet();
    if (root?.isConnected) return;
    root = document.createElement('div');
    root.id = 'premiumMiniApp';
    root.className = 'premium-mini-root';
    root.addEventListener('click', clickListener);
    root.addEventListener('change', handleChange);
    root.addEventListener('input', handleChange);
    root.addEventListener('submit', handleSubmit);
    document.body.appendChild(root);
  }

  function mount(context = {}) {
    state.context = { ...state.context, ...context };
    ensureRoot();
    document.body.classList.add('premium-mini-active');
    mounted = true;
    installBackHandler();
    refresh();
    if (!calendarItems(state.context).length && (state.route === 'ipo' || state.route === 'calendar')) ensureCalendar();
    return api;
  }

  function update(context = {}) {
    state.context = { ...state.context, ...context };
    if (!mounted || !root?.isConnected) return mount(state.context);
    refresh();
    return api;
  }

  function close() {
    mounted = false;
    document.body.classList.remove('premium-mini-active');
    restoreBackHandler();
    if (root) { root.removeEventListener('click', clickListener); root.removeEventListener('change', handleChange); root.removeEventListener('input', handleChange); root.removeEventListener('submit', handleSubmit); root.remove(); root=null; }
    state.route='home'; state.alertDraft=DEFAULT_ALERT(); state.selectedIpo=null; state.selectedIpoDetail=null;
  }

  function destroy() { close(); window.removeEventListener('popstate', popStateListener); clearTimeout(toastTimer); }
  window.addEventListener('popstate', popStateListener);

  const api = { mount, update, close, destroy, navigate, getState:() => ({ route:state.route, metric:state.metric, range:state.range }) };
  return api;
}
