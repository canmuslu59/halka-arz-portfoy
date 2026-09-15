import { createPremiumEntitlement } from './core/premium-entitlement.js';
import { buildPremiumAnalytics, buildPremiumSeries } from './core/premium-analytics.js';
import { createPremiumRuleStore, validatePremiumRule } from './core/premium-alerts.js';
import { createWatchlistStore } from './core/premium-watchlist.js';
import { serializeBackupPayload, parseBackupPayload } from './core/premium-backup.js';
import { renderStockLogoHtml } from './core/logo-resolver.js';
import { createPremiumChart } from './premium-charts.js';

export const PREMIUM_SECTIONS = [
  { id:'home', label:'Genel Bakış', icon:'✦' },
  { id:'analytics', label:'Analiz', icon:'▥' },
  { id:'charts', label:'Grafikler', icon:'⌁' },
  { id:'alerts', label:'Alarmlar', icon:'◎' },
  { id:'ipo', label:'IPO Pro', icon:'◈' },
  { id:'watchlist', label:'Takip', icon:'★' },
  { id:'backup', label:'Yedek', icon:'⇅' },
  { id:'membership', label:'Üyelik', icon:'♛' },
];

const RULE_LABELS = {
  price_above:'Fiyat hedefinin üzerine çıkınca',
  price_below:'Fiyat hedefinin altına düşünce',
  stock_daily_pct:'Hisse günlük hareket eşiği',
  portfolio_positive:'Portföy yükseliş eşiği',
  portfolio_negative:'Portföy düşüş eşiği',
  ceiling:'Doğrulanmış tavana ulaşınca',
  floor:'Doğrulanmış tabana ulaşınca',
};

const METRIC_LABELS = {
  value:'Portföy Değeri',
  returnPct:'Toplam Getiri',
  profit:'Kâr / Zarar',
  drawdown:'Drawdown',
};

const RANGE_LABELS = {
  '1H':'1H', '1A':'1A', '3A':'3A', '1Y':'1Y', ALL:'Tümü',
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}

function money(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', maximumFractionDigits:2 }).format(Number(value));
}

function numberText(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits:2 }).format(Number(value));
}

function percentage(value, { sign = true } = {}) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const formatter = new Intl.NumberFormat('tr-TR', { maximumFractionDigits:2, minimumFractionDigits:0, signDisplay:sign ? 'exceptZero' : 'never' });
  return `%${formatter.format(Number(value))}`;
}

function signClass(value) {
  return Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : 'neutral';
}

function safeDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('tr-TR', { day:'numeric', month:'short', year:'numeric', timeZone:'Europe/Istanbul' }).format(date);
}

function totalWealthOf(portfolio) {
  const totals = portfolio?.totals || {};
  if (Number.isFinite(Number(totals.totalWealth))) return Number(totals.totalWealth);
  return finite(totals.activeValue) + finite(totals.salesProceeds);
}

export function buildPremiumHomeModel({ portfolio = null, history = [] } = {}) {
  const analytics = buildPremiumAnalytics({ portfolio, history });
  const holdings = analytics.holdingContributions || [];
  const strongest = holdings.length ? holdings[0] : null;
  const weakest = holdings.length ? holdings[holdings.length - 1] : null;
  const insights = [];

  if (strongest) insights.push({
    tone:'positive',
    title:'En güçlü katkı',
    value:strongest.ticker,
    detail:`Toplam katkı ${money(strongest.totalProfit)}`,
  });
  if (weakest) insights.push({
    tone:weakest.totalProfit < 0 ? 'negative' : 'neutral',
    title:'En düşük katkı',
    value:weakest.ticker,
    detail:`Toplam katkı ${money(weakest.totalProfit)}`,
  });
  insights.push({
    tone:analytics.currentDrawdownPct < -5 ? 'negative' : 'neutral',
    title:'Zirveden uzaklık',
    value:percentage(analytics.currentDrawdownPct),
    detail:`Gözlenen zirve ${money(analytics.peakValue)}`,
  });
  insights.push({
    tone:analytics.topHoldingSharePct > 50 ? 'negative' : 'neutral',
    title:'En büyük pozisyon',
    value:percentage(analytics.topHoldingSharePct, { sign:false }),
    detail:`İlk 3 pozisyon ${percentage(analytics.topThreeSharePct, { sign:false })}`,
  });

  return {
    totalWealth:totalWealthOf(portfolio),
    dailyProfit:finite(portfolio?.totals?.dailyProfit),
    dailyPct:finite(portfolio?.totals?.dailyPct),
    totalProfit:finite(portfolio?.totals?.totalProfit, analytics.totalProfit),
    totalProfitPct:finite(portfolio?.totals?.totalProfitPct),
    realizedProfit:analytics.realizedProfit,
    unrealizedProfit:analytics.unrealizedProfit,
    strongest,
    weakest,
    insights,
    analytics,
  };
}

export function premiumMembershipModel() {
  return {
    demo:true,
    monthly:{ price:'₺49,90', label:'Aylık • örnek fiyat' },
    yearly:{ price:'₺399,90', label:'Yıllık • örnek fiyat', badge:'Örnek yıllık avantaj' },
    cta:'Test sürümünde Premium açık',
    free:[
      'Temel portföy takibi',
      'Halka arz takvimi',
      'Temel piyasa bildirimleri',
    ],
    premium:[
      'Gelişmiş portföy analizleri',
      'Etkileşimli performans ve drawdown grafikleri',
      'Hisse ve portföy bazlı özel alarmlar',
      'Detaylı halka arz Pro analizi',
      'Takip listesi ve gelişmiş takvim',
      'Yerel yedekleme ve veri aktarımı',
    ],
  };
}

function premiumHeader(entitlement) {
  return `<section class="premium-status-card">
    <div class="premium-crown">✦</div>
    <div class="premium-status-copy"><span class="premium-kicker">HALKA ARZ PORTFÖYÜM</span><strong>${escapeHtml(entitlement.label)}</strong><p>Tüm Premium özellikleri bu test sürümünde açık.</p></div>
    <span class="premium-demo-pill">DEMO</span>
  </section>`;
}

function sectionTabs(active) {
  return `<div class="premium-section-tabs" role="navigation" aria-label="Premium bölümleri">${PREMIUM_SECTIONS.map(section => `
    <button type="button" class="premium-section-tab ${section.id === active ? 'active' : ''}" data-premium-section="${section.id}">
      <span>${section.icon}</span><b>${section.label}</b>
    </button>`).join('')}</div>`;
}

function metricCard(label, value, note = '', tone = '') {
  return `<article class="premium-metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</article>`;
}

function emptyCard(text) {
  return `<div class="premium-empty">${escapeHtml(text)}</div>`;
}

function holdingIdentity(holding, size = 'md') {
  return `<div class="premium-holding-id">${renderStockLogoHtml(holding?.ticker, { size })}<div><strong>${escapeHtml(holding?.ticker || '—')}</strong><span>${escapeHtml(holding?.company || holding?.sector || 'BIST')}</span></div></div>`;
}

function renderHome(model) {
  const a = model.analytics;
  return `<div class="premium-page premium-home">
    <section class="premium-hero-card">
      <span class="premium-kicker">PORTFÖYÜNÜN TAM RESMİ</span>
      <div class="premium-hero-value">${money(model.totalWealth)}</div>
      <div class="premium-hero-pills">
        <span class="${signClass(model.dailyProfit)}">Bugün ${money(model.dailyProfit)} · ${percentage(model.dailyPct)}</span>
        <span class="${signClass(model.totalProfit)}">Toplam ${money(model.totalProfit)}</span>
      </div>
      <div class="premium-hero-grid">
        ${metricCard('Gerçekleşen', money(model.realizedProfit), 'Satışlardan')}
        ${metricCard('Gerçekleşmemiş', money(model.unrealizedProfit), 'Aktif pozisyonlar')}
        ${metricCard('Zirveden', percentage(a.currentDrawdownPct), 'Drawdown')}
        ${metricCard('En büyük pozisyon', percentage(a.topHoldingSharePct, { sign:false }), 'Portföy payı')}
      </div>
    </section>

    <section class="premium-block">
      <div class="premium-block-head"><div><span class="premium-kicker">HIZLI ERİŞİM</span><h3>Daha derine in</h3></div></div>
      <div class="premium-quick-grid">
        <button data-premium-section="analytics"><span>▥</span><strong>Portföy Analizi</strong><small>Katkı, yoğunlaşma, gerçekleşen kâr</small></button>
        <button data-premium-section="charts"><span>⌁</span><strong>Gelişmiş Grafikler</strong><small>Getiri, P/L ve drawdown</small></button>
        <button data-premium-section="alerts"><span>◎</span><strong>Akıllı Alarmlar</strong><small>Kendi kurallarını oluştur</small></button>
        <button data-premium-section="ipo"><span>◈</span><strong>IPO Pro</strong><small>Halka arzı derinlemesine incele</small></button>
        <button data-premium-section="watchlist"><span>★</span><strong>Takip Listesi</strong><small>İlgilendiklerini tek yerde izle</small></button>
        <button data-premium-section="backup"><span>⇅</span><strong>Yedekleme</strong><small>Verini dışa aktar ve geri yükle</small></button>
      </div>
    </section>

    <section class="premium-block">
      <div class="premium-block-head"><div><span class="premium-kicker">ÖNE ÇIKANLAR</span><h3>Portföy içgörüleri</h3></div><span>Yatırım tavsiyesi değildir</span></div>
      <div class="premium-insight-grid">${model.insights.map(item => `<article class="premium-insight ${item.tone}"><span>${escapeHtml(item.title)}</span><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.detail)}</small></article>`).join('')}</div>
    </section>
  </div>`;
}

function renderAnalytics(model) {
  const a = model.analytics;
  const contributions = a.holdingContributions || [];
  const maxContribution = Math.max(1, ...contributions.map(row => Math.abs(finite(row.totalProfit))));
  return `<div class="premium-page">
    <section class="premium-title-row"><div><span class="premium-kicker">GELİŞMİŞ ANALİZ</span><h2>Portföyünün anatomisi</h2><p>Kârın nereden geliyor, risk nerede yoğunlaşıyor?</p></div></section>
    <div class="premium-metrics-grid">
      ${metricCard('Yatırılan', money(a.invested))}
      ${metricCard('Aktif değer', money(a.activeValue))}
      ${metricCard('Satış nakdi', money(a.salesProceeds))}
      ${metricCard('Gerçekleşen P/L', money(a.realizedProfit), '', signClass(a.realizedProfit))}
      ${metricCard('Gerçekleşmemiş P/L', money(a.unrealizedProfit), '', signClass(a.unrealizedProfit))}
      ${metricCard('Maks. drawdown', percentage(a.maxDrawdownPct), '', a.maxDrawdownPct < 0 ? 'negative' : '')}
    </div>

    <section class="premium-block">
      <div class="premium-block-head"><div><span class="premium-kicker">KATKI ANALİZİ</span><h3>Hangi hisseler portföyü taşıyor?</h3></div></div>
      <div class="premium-contribution-list">${contributions.length ? contributions.map(row => {
        const width = Math.max(4, Math.abs(row.totalProfit) / maxContribution * 100);
        return `<article class="premium-contribution-row">${holdingIdentity(row, 'sm')}<div class="premium-contribution-body"><div><span>Portföy payı ${percentage(row.weightPct, { sign:false })}</span><b class="${signClass(row.totalProfit)}">${money(row.totalProfit)}</b></div><div class="premium-contribution-track"><i class="${row.totalProfit < 0 ? 'negative' : 'positive'}" style="width:${width.toFixed(2)}%"></i></div><small>Bugün ${money(row.dailyProfit)} · Gerçekleşen ${money(row.realizedProfit)} · Açık ${money(row.unrealizedProfit)}</small></div></article>`;
      }).join('') : emptyCard('Analiz için portföyünde hisse bulunmuyor.')}</div>
    </section>

    <section class="premium-block premium-two-column">
      <article><span class="premium-kicker">YOĞUNLAŞMA</span><h3>Risk dağılımı</h3><div class="premium-risk-gauge"><strong>${percentage(a.topHoldingSharePct, { sign:false })}</strong><span>en büyük pozisyon</span></div><p>İlk üç pozisyon portföyün ${percentage(a.topThreeSharePct, { sign:false })} bölümünü oluşturuyor.</p></article>
      <article><span class="premium-kicker">GÜN PERFORMANSI</span><h3>En iyi / en zayıf</h3><div class="premium-day-pair"><div><span>En iyi gün</span><strong class="positive">${a.bestDay ? money(a.bestDay.dailyProfit) : '—'}</strong><small>${a.bestDay ? safeDate(a.bestDay.date) : 'Yeterli veri yok'}</small></div><div><span>En zayıf gün</span><strong class="negative">${a.worstDay ? money(a.worstDay.dailyProfit) : '—'}</strong><small>${a.worstDay ? safeDate(a.worstDay.date) : 'Yeterli veri yok'}</small></div></div></article>
    </section>
  </div>`;
}

function chartTooltipHtml(row, metric) {
  if (!row) return '<span>Grafiğe dokunarak günü incele</span>';
  const metricValue = metric === 'value' ? money(row.y) : metric === 'profit' ? money(row.y) : percentage(row.y);
  return `<strong>${safeDate(row.date)}</strong><b>${metricValue}</b><span>Günlük ${money(row.dailyProfit)} · ${percentage(row.dailyPct)}</span><span>Toplam P/L ${money(row.profit)} · Drawdown ${percentage(row.drawdownPct)}</span>`;
}

function renderCharts(model, chartMetric, chartRange) {
  const a = model.analytics;
  const contributions = a.holdingContributions || [];
  const maxAbs = Math.max(1, ...contributions.map(row => Math.abs(finite(row.totalProfit))));
  const allocation = a.allocationByHolding || [];
  const maxAllocation = Math.max(1, ...allocation.map(row => finite(row.value)));
  return `<div class="premium-page premium-chart-page">
    <section class="premium-title-row"><div><span class="premium-kicker">PREMIUM GRAFİKLER</span><h2>Performansı gerçekten gör</h2><p>Grafiğe dokunup sürükleyerek her işlem gününü okuyabilirsin.</p></div></section>

    <section class="premium-chart-card">
      <div class="premium-chart-controls">
        <div class="premium-segmented premium-metric-tabs">${Object.entries(METRIC_LABELS).map(([key,label]) => `<button class="${key === chartMetric ? 'active' : ''}" data-premium-metric="${key}">${label}</button>`).join('')}</div>
        <div class="premium-segmented premium-range-tabs">${Object.entries(RANGE_LABELS).map(([key,label]) => `<button class="${key === chartRange ? 'active' : ''}" data-premium-range="${key}">${label}</button>`).join('')}</div>
      </div>
      <div id="premiumChartTooltip" class="premium-chart-tooltip">${chartTooltipHtml(null, chartMetric)}</div>
      <div class="premium-chart-canvas-wrap"><canvas id="premiumMainChart" aria-label="Premium portföy performans grafiği"></canvas></div>
      <div class="premium-chart-foot"><span>● Maksimum / minimum noktaları</span><span>Dokun-sürükle aktif</span></div>
    </section>

    <div class="premium-chart-summary-grid">
      ${metricCard('Gözlenen zirve', money(a.peakValue))}
      ${metricCard('Mevcut drawdown', percentage(a.currentDrawdownPct), '', a.currentDrawdownPct < 0 ? 'negative' : '')}
      ${metricCard('Maks. drawdown', percentage(a.maxDrawdownPct), '', a.maxDrawdownPct < 0 ? 'negative' : '')}
      ${metricCard('Toplam P/L', money(a.totalProfit), '', signClass(a.totalProfit))}
    </div>

    <section class="premium-block">
      <div class="premium-block-head"><div><span class="premium-kicker">KÂRIN YAPISI</span><h3>Gerçekleşen / açık pozisyon</h3></div></div>
      <div class="premium-split-profit">
        <article><span>Gerçekleşen</span><strong class="${signClass(a.realizedProfit)}">${money(a.realizedProfit)}</strong><div><i style="width:${Math.min(100, Math.abs(a.realizedProfit) / Math.max(1, Math.abs(a.realizedProfit) + Math.abs(a.unrealizedProfit)) * 100)}%"></i></div></article>
        <article><span>Gerçekleşmemiş</span><strong class="${signClass(a.unrealizedProfit)}">${money(a.unrealizedProfit)}</strong><div><i style="width:${Math.min(100, Math.abs(a.unrealizedProfit) / Math.max(1, Math.abs(a.realizedProfit) + Math.abs(a.unrealizedProfit)) * 100)}%"></i></div></article>
      </div>
    </section>

    <section class="premium-block">
      <div class="premium-block-head"><div><span class="premium-kicker">HİSSE KATKISI</span><h3>Getiriye katkı sıralaması</h3></div></div>
      <div class="premium-ranked-bars">${contributions.length ? contributions.map(row => `<div class="premium-ranked-row">${holdingIdentity(row, 'xs')}<div><i class="${row.totalProfit < 0 ? 'negative' : 'positive'}" style="width:${Math.max(3, Math.abs(row.totalProfit) / maxAbs * 100).toFixed(1)}%"></i></div><strong class="${signClass(row.totalProfit)}">${money(row.totalProfit)}</strong></div>`).join('') : emptyCard('Katkı grafiği için yeterli pozisyon yok.')}</div>
    </section>

    <section class="premium-block">
      <div class="premium-block-head"><div><span class="premium-kicker">DAĞILIM</span><h3>Portföy ağırlıkları</h3></div></div>
      <div class="premium-allocation-bars">${allocation.length ? allocation.map(row => `<div class="premium-allocation-row">${renderStockLogoHtml(row.ticker, { size:'xs' })}<span>${escapeHtml(row.ticker)}</span><div><i style="width:${Math.max(4, row.value / maxAllocation * 100).toFixed(1)}%"></i></div><b>${percentage(row.pct, { sign:false })}</b></div>`).join('') : emptyCard('Dağılım için aktif pozisyon yok.')}</div>
    </section>

    <section class="premium-benchmark-disabled"><span>◎</span><div><strong>BIST 100 karşılaştırması</strong><p>Doğrulanmış benchmark serisi bu demo veri katmanında olmadığı için sahte karşılaştırma gösterilmiyor.</p></div><b>Veri bekleniyor</b></section>
  </div>`;
}

function ruleValueText(rule) {
  if (rule.type === 'ceiling' || rule.type === 'floor') return 'Doğrulanmış seviye';
  if (rule.type === 'price_above' || rule.type === 'price_below') return money(rule.value);
  return `%${numberText(rule.value)}`;
}

function renderAlerts(ruleStore, editingRuleId) {
  const rules = ruleStore.list();
  const editing = editingRuleId ? rules.find(rule => rule.id === editingRuleId) : null;
  const selectedType = editing?.type || 'price_above';
  return `<div class="premium-page">
    <section class="premium-title-row"><div><span class="premium-kicker">AKILLI ALARMLAR</span><h2>Kuralı sen belirle</h2><p>Bu test uygulamasında kurallar yerel olarak saklanır. Production FCM sistemi değiştirilmez.</p></div><span class="premium-local-pill">Yerel demo</span></section>

    <section class="premium-block premium-alert-editor">
      <div class="premium-block-head"><div><span class="premium-kicker">${editing ? 'DÜZENLE' : 'YENİ KURAL'}</span><h3>${editing ? 'Alarmı güncelle' : 'Yeni alarm oluştur'}</h3></div></div>
      <form id="premiumAlertForm" class="premium-alert-form">
        <label><span>Alarm türü</span><select id="premiumAlertType">${Object.entries(RULE_LABELS).map(([key,label]) => `<option value="${key}" ${key === selectedType ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label><span>Hisse kodu</span><input id="premiumAlertTicker" value="${escapeHtml(editing?.ticker || '')}" placeholder="Örn. ASELS" maxlength="8" autocomplete="off"></label>
        <label><span>Hedef / eşik</span><input id="premiumAlertValue" type="number" inputmode="decimal" step="0.01" min="0.01" value="${editing?.value ?? ''}" placeholder="Örn. 3 veya 125,50"></label>
        <button class="primary-btn" type="submit">${editing ? 'Alarmı güncelle' : '+ Alarm oluştur'}</button>
        ${editing ? '<button class="secondary-btn" data-premium-cancel-edit type="button">Düzenlemeyi iptal et</button>' : ''}
      </form>
    </section>

    <section class="premium-block">
      <div class="premium-block-head"><div><span class="premium-kicker">ALARMLARIM</span><h3>${rules.length} aktif/pasif kural</h3></div><button class="secondary-btn compact-btn" type="button" data-premium-test-notification>Test bildirimi gönder</button></div>
      <div class="premium-rule-list">${rules.length ? rules.map(rule => `<article class="premium-rule-card ${rule.enabled ? '' : 'disabled'}"><div class="premium-rule-icon">${rule.ticker ? renderStockLogoHtml(rule.ticker, { size:'xs' }) : '<span>◎</span>'}</div><div class="premium-rule-copy"><strong>${escapeHtml(RULE_LABELS[rule.type] || rule.type)}</strong><span>${rule.ticker ? `${escapeHtml(rule.ticker)} · ` : ''}${escapeHtml(ruleValueText(rule))}</span></div><label class="premium-switch"><input type="checkbox" data-premium-rule-toggle="${escapeHtml(rule.id)}" ${rule.enabled ? 'checked' : ''}><span></span></label><button class="premium-icon-action" type="button" data-premium-rule-edit="${escapeHtml(rule.id)}" aria-label="Düzenle">✎</button><button class="premium-icon-action danger" type="button" data-premium-rule-delete="${escapeHtml(rule.id)}" aria-label="Sil">×</button></article>`).join('') : emptyCard('Henüz özel alarm oluşturmadın.')}</div>
    </section>
  </div>`;
}

function ipoStatusLabel(status) {
  return ({ active:'Talepte', upcoming:'Yaklaşan', completed:'Tamamlandı' })[status] || 'Halka arz';
}

function renderIpoList(items = []) {
  if (!items.length) return emptyCard('Halka arz verisi yükleniyor veya gösterilecek kayıt yok.');
  return `<div class="premium-ipo-grid">${items.map(item => `<button class="premium-ipo-card" type="button" data-premium-ipo-open="${escapeHtml(item.ticker)}">${renderStockLogoHtml(item.ticker, { size:'md' })}<div><strong>${escapeHtml(item.ticker)}</strong><span>${escapeHtml(item.company || 'Halka arz')}</span><small>${escapeHtml(item.offerDates || (item.firstTradeDate ? `İlk işlem ${safeDate(item.firstTradeDate)}` : 'Detayları görüntüle'))}</small></div><b>${escapeHtml(ipoStatusLabel(item.status))}</b><i>›</i></button>`).join('')}</div>`;
}

function renderIpoDetail(detail) {
  const fund = Array.isArray(detail?.fundUse) ? detail.fundUse : [];
  const results = Array.isArray(detail?.results) ? detail.results : [];
  const ceilingRows = Array.isArray(detail?.ceilingAnalysis?.rows) ? detail.ceilingAnalysis.rows.slice(0, 20) : [];
  const theoretical = Array.isArray(detail?.ceilingSimulation) ? detail.ceilingSimulation.slice(0, 10) : [];
  return `<div class="premium-ipo-detail">
    <button class="secondary-btn compact-btn" type="button" data-premium-ipo-back>‹ IPO Pro listesi</button>
    <section class="premium-ipo-detail-head">${renderStockLogoHtml(detail?.ticker, { size:'lg' })}<div><span class="premium-kicker">${escapeHtml(detail?.ticker || '')}</span><h2>${escapeHtml(detail?.company || detail?.ticker || 'Halka arz')}</h2><p>${escapeHtml(detail?.sector || 'Sektör bilgisi bulunamadı')}</p></div><span class="premium-local-pill">${escapeHtml(ipoStatusLabel(detail?.status))}</span></section>
    <section class="premium-block"><div class="premium-block-head"><div><span class="premium-kicker">ARZ BİLGİLERİ</span><h3>Temel veriler</h3></div></div><div class="premium-info-grid">
      ${metricCard('Talep toplama', detail?.offerDates || '—')}
      ${metricCard('Halka arz fiyatı', money(detail?.ipoPrice))}
      ${metricCard('Arz edilen pay', detail?.ipoLots != null ? `${numberText(detail.ipoLots)} lot` : '—')}
      ${metricCard('Arz büyüklüğü', money(detail?.ipoSizeTRY))}
      ${metricCard('Dağıtım', detail?.distributionMethod || '—')}
      ${metricCard('Katılım endeksi', detail?.participationIndex || '—')}
      ${metricCard('İlk işlem', detail?.firstTradeDate ? safeDate(detail.firstTradeDate) : '—')}
      ${metricCard('Pazar', detail?.market || '—')}
      ${metricCard('Halka açıklık', detail?.freeFloatPct == null ? '—' : percentage(detail.freeFloatPct, { sign:false }))}
      ${metricCard('İskonto', detail?.discountPct == null ? '—' : percentage(detail.discountPct, { sign:false }))}
    </div></section>
    <section class="premium-block"><span class="premium-kicker">ŞİRKET</span><h3>Şirket hakkında</h3><p class="premium-readable">${escapeHtml(detail?.summary || 'Kaynakta kısa şirket özeti bulunamadı.')}</p></section>
    <section class="premium-block"><span class="premium-kicker">FON KULLANIMI</span><h3>Kaynağın kullanım alanları</h3>${fund.length ? `<div class="premium-fund-list">${fund.map(row => `<div><strong>%${numberText(row.pct)}</strong><span>${escapeHtml(row.purpose || '—')}</span></div>`).join('')}</div>` : emptyCard('Fon kullanım bilgisi bulunamadı.')}</section>
    <section class="premium-block"><div class="premium-block-head"><div><span class="premium-kicker">HALKA ARZ SONUÇLARI</span><h3>Katılımcı / dağıtım</h3></div><span>${detail?.participantCount ? `${numberText(detail.participantCount)} katılımcı` : ''}</span></div>${results.length ? `<div class="premium-result-table"><div><b>Grup</b><b>Yatırımcı</b><b>Lot</b><b>%</b></div>${results.map(row => `<div><strong>${escapeHtml(row.group || '—')}</strong><span>${numberText(row.people)}</span><span>${numberText(row.lots)}</span><span>${numberText(row.pct)}</span></div>`).join('')}</div>` : emptyCard('Sonuç tablosu bulunamadı.')}</section>
    <section class="premium-block"><div class="premium-block-head"><div><span class="premium-kicker">TAVAN SERİSİ</span><h3>Gerçekleşen performans</h3></div><span>${Number(detail?.ceilingAnalysis?.openingStreak || 0)} açılış tavanı</span></div>${ceilingRows.length ? `<div class="premium-ceiling-table">${ceilingRows.map((row,index) => `<div><b>${index + 1}. gün</b><span>${safeDate(row.date)}</span><strong>${money(row.close)}</strong><i class="${row.isCeiling ? 'positive' : ''}">${row.isCeiling ? 'Tavan' : percentage(row.dailyPct)}</i></div>`).join('')}</div>` : emptyCard('İşlem geçmişi bulunursa tavan serisi hesaplanır.')}${theoretical.length ? `<details class="premium-theoretical"><summary>Teorik tavan merdiveni</summary>${theoretical.map(row => `<div><span>${row.count}. tavan</span><strong>${money(row.price)}</strong><b class="positive">+%${numberText(row.returnPct)}</b></div>`).join('')}</details>` : ''}</section>
  </div>`;
}

function renderIpo(items, selectedTicker, detail, loading) {
  if (selectedTicker) {
    if (loading) return `<div class="premium-page"><div class="premium-loading"><span></span><strong>${escapeHtml(selectedTicker)}</strong> analiz ediliyor…</div></div>`;
    if (detail) return `<div class="premium-page">${renderIpoDetail(detail)}</div>`;
  }
  return `<div class="premium-page"><section class="premium-title-row"><div><span class="premium-kicker">IPO PRO</span><h2>Halka arzı yüzeyden değil, içeriden gör</h2><p>Arz yapısı, sonuçlar, fon kullanımı ve tavan performansı tek ekranda.</p></div></section><div class="premium-search"><input id="premiumIpoSearch" type="search" placeholder="Hisse kodu veya şirket ara"><span>⌕</span></div>${renderIpoList(items)}</div>`;
}

function renderWatchlist(items, watchlistStore, filterFollowed) {
  const tracked = watchlistStore.all();
  const shown = filterFollowed ? items.filter(item => tracked.includes(String(item.ticker || '').toUpperCase())) : items;
  return `<div class="premium-page"><section class="premium-title-row"><div><span class="premium-kicker">PREMIUM TAKİP</span><h2>Halka arzlarını yakın takip et</h2><p>Favorilerini yerel olarak kaydet, tek filtreyle ayır.</p></div><span class="premium-local-pill">${tracked.length} takip</span></section>
    <div class="premium-watch-filter"><button class="${!filterFollowed ? 'active' : ''}" data-premium-watch-filter="all">Tümü</button><button class="${filterFollowed ? 'active' : ''}" data-premium-watch-filter="followed">★ Takip ettiklerim</button></div>
    <div class="premium-watch-grid">${shown.length ? shown.map(item => { const isFollowed = tracked.includes(String(item.ticker || '').toUpperCase()); return `<article class="premium-watch-card">${renderStockLogoHtml(item.ticker, { size:'md' })}<div><strong>${escapeHtml(item.ticker)}</strong><span>${escapeHtml(item.company || 'Halka arz')}</span><small>${escapeHtml(item.offerDates || 'Tarih bilgisi bekleniyor')}</small></div><button type="button" class="${isFollowed ? 'active' : ''}" data-premium-watch-toggle="${escapeHtml(item.ticker)}" aria-label="Takip et">${isFollowed ? '★' : '☆'}</button><button type="button" data-premium-ipo-open="${escapeHtml(item.ticker)}">Detay ›</button></article>`; }).join('') : emptyCard(filterFollowed ? 'Henüz takip ettiğin halka arz yok.' : 'Takvim verisi bulunamadı.')}</div>
    <section class="premium-reminder-card"><span>◷</span><div><strong>Hatırlatma tercihleri</strong><p>Sunucu tabanlı Premium hatırlatmalar gerçek abonelik altyapısı bağlandığında aktif edilebilir. Demo, çalışmayan bir sunucu özelliğini açıkmış gibi göstermez.</p></div><b>Yakında</b></section>
  </div>`;
}

function renderBackup(exportText, importPreview) {
  return `<div class="premium-page"><section class="premium-title-row"><div><span class="premium-kicker">YEDEKLEME & AKTARIM</span><h2>Verin sende kalsın</h2><p>Portföyünü, Premium alarm kurallarını ve takip listesini gerçek JSON yedeği olarak dışa aktar.</p></div></section>
    <section class="premium-block"><div class="premium-block-head"><div><span class="premium-kicker">DIŞA AKTAR</span><h3>Yerel yedek oluştur</h3></div><span>Şema v1</span></div><p class="premium-readable">Yedek dosyası portföy kayıtlarını, taşınabilir ayarları, Premium alarmları ve takip listesini içerir.</p><div class="premium-action-row"><button class="primary-btn" type="button" data-premium-export>Yedeği oluştur</button><button class="secondary-btn" type="button" data-premium-copy-export ${exportText ? '' : 'disabled'}>Kopyala</button><button class="secondary-btn" type="button" data-premium-download-export ${exportText ? '' : 'disabled'}>JSON indir</button></div>${exportText ? `<textarea class="premium-backup-text" id="premiumExportText" readonly>${escapeHtml(exportText)}</textarea>` : ''}</section>
    <section class="premium-block"><div class="premium-block-head"><div><span class="premium-kicker">İÇE AKTAR</span><h3>Yedeği doğrula ve geri yükle</h3></div></div><textarea class="premium-backup-text" id="premiumImportText" placeholder="Yedek JSON içeriğini buraya yapıştır"></textarea><div class="premium-action-row"><button class="secondary-btn" type="button" data-premium-validate-import>Yedeği doğrula</button>${importPreview ? '<button class="primary-btn" type="button" data-premium-apply-import>Onayla ve geri yükle</button>' : ''}</div>${importPreview ? `<div class="premium-import-preview"><strong>Yedek doğrulandı</strong><span>${importPreview.portfolio?.holdings?.length || 0} portföy kaydı · ${importPreview.premiumRules?.length || 0} alarm · ${importPreview.watchlist?.length || 0} takip</span><small>${escapeHtml(importPreview.exportedAt)}</small></div>` : ''}</section>
    <section class="premium-cloud-future"><span>☁</span><div><strong>Bulut yedekleme</strong><p>Hesap ve gerçek backend yetkilendirmesi eklendiğinde cihazlar arası senkronizasyon burada yer alabilir.</p></div><b>Henüz aktif değil</b></section>
  </div>`;
}

function renderMembership() {
  const model = premiumMembershipModel();
  return `<div class="premium-page premium-membership"><section class="premium-membership-hero"><div class="premium-crown large">✦</div><span class="premium-kicker">HALKA ARZ PORTFÖYÜM PREMIUM</span><h2>Daha fazla analiz. Daha fazla kontrol.</h2><p>Temel portföy takibini kilitlemeden, gerçekten ileri seviye kullananlara daha güçlü araçlar.</p></section>
    <div class="premium-plan-grid"><article><span>${model.monthly.label}</span><strong>${model.monthly.price}</strong><small>Canlı Play fiyatı değildir</small></article><article class="featured"><b>${model.yearly.badge}</b><span>${model.yearly.label}</span><strong>${model.yearly.price}</strong><small>Canlı Play fiyatı değildir</small></article></div>
    <button class="primary-btn premium-membership-cta" disabled>${model.cta}</button>
    <section class="premium-comparison"><div class="premium-comparison-head"><span>Özellik</span><b>Ücretsiz</b><strong>Premium</strong></div>
      <div><span>Portföy takibi</span><b>✓</b><strong>✓</strong></div>
      <div><span>Halka arz takvimi</span><b>✓</b><strong>✓</strong></div>
      <div><span>Gelişmiş portföy analizi</span><b>—</b><strong>✓</strong></div>
      <div><span>Drawdown / katkı grafikleri</span><b>—</b><strong>✓</strong></div>
      <div><span>Özel hisse alarmları</span><b>—</b><strong>✓</strong></div>
      <div><span>IPO Pro detayları</span><b>—</b><strong>✓</strong></div>
      <div><span>Takip listesi</span><b>—</b><strong>✓</strong></div>
      <div><span>Yedekleme / aktarım</span><b>—</b><strong>✓</strong></div>
    </section>
    <section class="premium-block"><span class="premium-kicker">PREMIUM İÇERİK</span><h3>Bu pakette ne var?</h3><div class="premium-feature-checks">${model.premium.map(item => `<div><span>✓</span><strong>${escapeHtml(item)}</strong></div>`).join('')}</div></section>
    <button class="secondary-btn premium-restore-disabled" type="button" disabled>Satın almayı geri yükle • Billing bağlanınca</button>
  </div>`;
}

function candidateItems(context) {
  const map = new Map();
  for (const item of context?.calendar?.items || []) {
    if (item?.ticker) map.set(String(item.ticker).toUpperCase(), item);
  }
  for (const holding of context?.portfolio?.holdings || []) {
    if (!holding?.ticker) continue;
    const ticker = String(holding.ticker).toUpperCase();
    map.set(ticker, { ...(map.get(ticker) || {}), ticker, company:holding.company, sector:holding.sector, ipoPrice:holding.ipoPrice, firstTradeDate:holding.firstTradeDate });
  }
  return [...map.values()];
}

export function createPremiumDemoController({
  storage,
  demo = true,
  loadCalendar = null,
  loadIpoDetail = null,
  loadPortfolioData = null,
  savePortfolio = null,
  showToast = null,
  showLocalNotification = null,
} = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new TypeError('Premium demo için storage gerekli.');
  const entitlement = createPremiumEntitlement({ demo });
  const ruleStore = createPremiumRuleStore(storage);
  const watchlistStore = createWatchlistStore(storage);
  let root = null;
  let context = { portfolio:null, history:[], calendar:null };
  let activeSection = 'home';
  let chartMetric = 'value';
  let chartRange = '1A';
  let chartInstance = null;
  let editingRuleId = null;
  let calendarLoading = false;
  let selectedTicker = null;
  let ipoDetail = null;
  let ipoLoadingTicker = null;
  let watchFilterFollowed = false;
  let exportText = '';
  let importPreview = null;

  const toast = message => { if (typeof showToast === 'function') showToast(message); };

  function analyticsModel() {
    const history = context.history?.length ? context.history : (context.portfolio?.history || []);
    return buildPremiumHomeModel({ portfolio:context.portfolio, history });
  }

  async function ensureCalendar() {
    if (context.calendar || calendarLoading || typeof loadCalendar !== 'function') return context.calendar;
    calendarLoading = true;
    try {
      context.calendar = await loadCalendar();
    } catch {
      toast('Halka arz takvimi yüklenemedi.');
    } finally {
      calendarLoading = false;
      if (root && (activeSection === 'ipo' || activeSection === 'watchlist')) paint();
    }
    return context.calendar;
  }

  function destroyChart() {
    if (chartInstance) chartInstance.destroy();
    chartInstance = null;
  }

  function sectionBody() {
    const model = analyticsModel();
    if (activeSection === 'analytics') return renderAnalytics(model);
    if (activeSection === 'charts') return renderCharts(model, chartMetric, chartRange);
    if (activeSection === 'alerts') return renderAlerts(ruleStore, editingRuleId);
    if (activeSection === 'ipo') return renderIpo(candidateItems(context), selectedTicker, ipoDetail, Boolean(selectedTicker && ipoLoadingTicker === selectedTicker));
    if (activeSection === 'watchlist') return renderWatchlist(candidateItems(context), watchlistStore, watchFilterFollowed);
    if (activeSection === 'backup') return renderBackup(exportText, importPreview);
    if (activeSection === 'membership') return renderMembership();
    return renderHome(model);
  }

  function paint() {
    if (!root) return;
    destroyChart();
    root.innerHTML = `${premiumHeader(entitlement)}${sectionTabs(activeSection)}${sectionBody()}`;
    bindRoot();
    if (activeSection === 'charts') mountChart();
    if ((activeSection === 'ipo' || activeSection === 'watchlist') && !context.calendar) ensureCalendar();
  }

  function mountChart() {
    const canvas = root?.querySelector('#premiumMainChart');
    if (!canvas) return;
    const history = context.history?.length ? context.history : (context.portfolio?.history || []);
    const rows = buildPremiumSeries({ history, metric:chartMetric, range:chartRange });
    const formatter = chartMetric === 'value' || chartMetric === 'profit' ? money : value => percentage(value);
    chartInstance = createPremiumChart(canvas, {
      valueLabel:formatter,
      onHover(row) {
        const tooltip = root?.querySelector('#premiumChartTooltip');
        if (tooltip) tooltip.innerHTML = chartTooltipHtml(row, chartMetric);
      },
    });
    chartInstance.setData(rows);
  }

  function setSection(section) {
    if (!PREMIUM_SECTIONS.some(item => item.id === section)) return;
    activeSection = section;
    if (section !== 'ipo') { selectedTicker = null; ipoDetail = null; ipoLoadingTicker = null; }
    paint();
  }

  async function openIpo(ticker) {
    const key = String(ticker || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!key) return;
    activeSection = 'ipo';
    selectedTicker = key;
    ipoDetail = null;
    ipoLoadingTicker = key;
    paint();
    if (typeof loadIpoDetail !== 'function') {
      ipoLoadingTicker = null;
      toast('IPO Pro veri sağlayıcısı bu demoda bağlı değil.');
      paint();
      return;
    }
    try {
      await ensureCalendar();
      const item = candidateItems(context).find(row => String(row.ticker || '').toUpperCase() === key) || { ticker:key };
      const detail = await loadIpoDetail(item);
      if (selectedTicker !== key) return;
      ipoDetail = detail;
    } catch (error) {
      toast(error?.message || 'IPO Pro detayı alınamadı.');
    } finally {
      if (selectedTicker === key) {
        ipoLoadingTicker = null;
        paint();
      }
    }
  }

  function alertFormSubmit(event) {
    event.preventDefault();
    const type = root.querySelector('#premiumAlertType')?.value;
    const ticker = root.querySelector('#premiumAlertTicker')?.value;
    const valueRaw = root.querySelector('#premiumAlertValue')?.value;
    const existing = editingRuleId ? ruleStore.list().find(rule => rule.id === editingRuleId) : null;
    try {
      const normalized = validatePremiumRule({
        ...(existing || {}),
        id:existing?.id || null,
        type,
        ticker,
        value:valueRaw,
        enabled:existing?.enabled !== false,
      });
      ruleStore.upsert(normalized);
      editingRuleId = null;
      toast(existing ? 'Alarm güncellendi.' : 'Premium alarm oluşturuldu.');
      paint();
    } catch (error) {
      toast(error?.message || 'Alarm kaydedilemedi.');
    }
  }

  function handleRuleToggle(input) {
    ruleStore.setEnabled(input.dataset.premiumRuleToggle, input.checked);
    paint();
  }

  async function createExport() {
    try {
      const portfolioData = typeof loadPortfolioData === 'function' ? await loadPortfolioData() : context.portfolio;
      exportText = serializeBackupPayload({
        portfolio:portfolioData || { holdings:[] },
        settings:{ themePreference:storage.getItem('themePreference'), holdingSort:storage.getItem('holdingSort') },
        premiumRules:ruleStore.list(),
        watchlist:watchlistStore.all(),
      });
      toast('Yedek oluşturuldu.');
      paint();
    } catch (error) {
      toast(error?.message || 'Yedek oluşturulamadı.');
    }
  }

  function validateImport() {
    const text = root?.querySelector('#premiumImportText')?.value || '';
    try {
      importPreview = parseBackupPayload(text);
      toast('Yedek doğrulandı. Uygulamadan önce içeriği kontrol et.');
      paint();
      const textarea = root?.querySelector('#premiumImportText');
      if (textarea) textarea.value = text;
    } catch (error) {
      importPreview = null;
      toast(error?.message || 'Yedek doğrulanamadı.');
    }
  }

  async function applyImport() {
    if (!importPreview) return;
    const ok = globalThis.confirm ? globalThis.confirm('Mevcut test portföyü bu yedek ile değiştirilsin mi?') : false;
    if (!ok) return;
    try {
      for (const rule of importPreview.premiumRules) validatePremiumRule(rule);
      if (typeof savePortfolio === 'function') await savePortfolio(importPreview.portfolio);
      if (importPreview.settings.themePreference) storage.setItem('themePreference', importPreview.settings.themePreference);
      if (importPreview.settings.holdingSort) storage.setItem('holdingSort', importPreview.settings.holdingSort);
      storage.setItem('premium_rules_v1', JSON.stringify(importPreview.premiumRules));
      storage.setItem('premium_watchlist_v1', JSON.stringify(importPreview.watchlist));
      toast('Yedek geri yüklendi. Uygulama yenileniyor.');
      setTimeout(() => globalThis.location?.reload?.(), 250);
    } catch (error) {
      toast(error?.message || 'Yedek geri yüklenemedi.');
    }
  }

  async function copyExport() {
    if (!exportText) return;
    try {
      await globalThis.navigator?.clipboard?.writeText?.(exportText);
      toast('Yedek panoya kopyalandı.');
    } catch {
      toast('Panoya kopyalanamadı; metni elle seçebilirsin.');
    }
  }

  function downloadExport() {
    if (!exportText || typeof document === 'undefined') return;
    try {
      const blob = new Blob([exportText], { type:'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `halka-arz-portfoyum-yedek-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('Dosya indirilemedi; yedeği kopyalayabilirsin.');
    }
  }

  function bindRoot() {
    root.querySelectorAll('[data-premium-section]').forEach(button => button.addEventListener('click', () => setSection(button.dataset.premiumSection)));
    root.querySelectorAll('[data-premium-metric]').forEach(button => button.addEventListener('click', () => { chartMetric = button.dataset.premiumMetric; paint(); }));
    root.querySelectorAll('[data-premium-range]').forEach(button => button.addEventListener('click', () => { chartRange = button.dataset.premiumRange; paint(); }));
    root.querySelector('#premiumAlertForm')?.addEventListener('submit', alertFormSubmit);
    root.querySelector('[data-premium-cancel-edit]')?.addEventListener('click', () => { editingRuleId = null; paint(); });
    root.querySelectorAll('[data-premium-rule-toggle]').forEach(input => input.addEventListener('change', () => handleRuleToggle(input)));
    root.querySelectorAll('[data-premium-rule-edit]').forEach(button => button.addEventListener('click', () => { editingRuleId = button.dataset.premiumRuleEdit; paint(); }));
    root.querySelectorAll('[data-premium-rule-delete]').forEach(button => button.addEventListener('click', () => { ruleStore.remove(button.dataset.premiumRuleDelete); if (editingRuleId === button.dataset.premiumRuleDelete) editingRuleId = null; toast('Alarm silindi.'); paint(); }));
    root.querySelector('[data-premium-test-notification]')?.addEventListener('click', () => {
      const payload = { title:'Premium alarm testi', body:'Özel alarm sistemi yerel olarak çalışıyor.', route:'premium_alert_test' };
      let sent = false;
      try { sent = typeof showLocalNotification === 'function' ? Boolean(showLocalNotification(payload)) : false; } catch {}
      toast(sent ? 'Test bildirimi gönderildi.' : 'Yerel bildirim köprüsü kullanılamadı.');
    });
    root.querySelectorAll('[data-premium-ipo-open]').forEach(button => button.addEventListener('click', () => openIpo(button.dataset.premiumIpoOpen)));
    root.querySelector('[data-premium-ipo-back]')?.addEventListener('click', () => { selectedTicker = null; ipoDetail = null; ipoLoadingTicker = null; paint(); });
    const search = root.querySelector('#premiumIpoSearch');
    search?.addEventListener('input', () => {
      const query = String(search.value || '').trim().toLocaleUpperCase('tr-TR');
      const cards = root.querySelectorAll('[data-premium-ipo-open]');
      cards.forEach(card => { const text = card.textContent.toLocaleUpperCase('tr-TR'); card.hidden = Boolean(query && !text.includes(query)); });
    });
    root.querySelectorAll('[data-premium-watch-toggle]').forEach(button => button.addEventListener('click', () => { const active = watchlistStore.toggle(button.dataset.premiumWatchToggle); toast(active ? 'Takip listesine eklendi.' : 'Takip listesinden çıkarıldı.'); paint(); }));
    root.querySelectorAll('[data-premium-watch-filter]').forEach(button => button.addEventListener('click', () => { watchFilterFollowed = button.dataset.premiumWatchFilter === 'followed'; paint(); }));
    root.querySelector('[data-premium-export]')?.addEventListener('click', createExport);
    root.querySelector('[data-premium-copy-export]')?.addEventListener('click', copyExport);
    root.querySelector('[data-premium-download-export]')?.addEventListener('click', downloadExport);
    root.querySelector('[data-premium-validate-import]')?.addEventListener('click', validateImport);
    root.querySelector('[data-premium-apply-import]')?.addEventListener('click', applyImport);
  }

  return {
    enabled:entitlement.hasPremium,
    entitlement,
    render(target, nextContext = {}) {
      root = target;
      context = {
        ...context,
        ...nextContext,
        history:Array.isArray(nextContext.history) ? nextContext.history : (Array.isArray(nextContext.portfolio?.history) ? nextContext.portfolio.history : context.history),
      };
      if (nextContext.selectedTicker) {
        activeSection = 'ipo';
        selectedTicker = String(nextContext.selectedTicker).toUpperCase();
        openIpo(selectedTicker);
        return;
      }
      paint();
    },
    setSection,
    destroy() { destroyChart(); root = null; },
  };
}
