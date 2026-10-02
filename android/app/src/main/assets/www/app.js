import { createRepository, createPlatformStorage } from './core/repository.js';
import { httpGetJson, httpGetText } from './core/http.js';
import { createDataSources } from './core/data-sources.js';
import { createPortfolioService } from './core/portfolio-service.js';
import { getBistMarketStatus } from './core/market-calendar.js';
import { sortHoldings, sectorBreakdown, nearestChartIndex } from './core/analytics.js';
import { createIpoService } from './core/ipo-service.js';
import { resolveTheme, nextTheme } from './core/theme.js';
import { normalizeAlertSettings, evaluateDailyAlerts, notificationPayloadForEvent } from './core/notification-rules.js';
import { createProAccess } from './core/pro-access.js';
import { createRootNavigationState, nextNavigationState, canHandleAppBack } from './core/navigation.js';
import { createRefreshGate } from './core/refresh-coordinator.js';
import { comparisonSeriesFromYahoo, comparisonWindowFromBist, percentageMoveBetweenDates, combinedPercentageMoveBetweenDates, compoundedPortfolioMove } from './core/comparison-math.js';

const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];

const repository = createRepository(createPlatformStorage());
const sources = createDataSources({ getJson: httpGetJson, getText: httpGetText });
const service = createPortfolioService({
  repository,
  getQuote: sources.getQuote,
  getHistory: sources.getHistory,
  getIpo: sources.getIpo,
  getSector: sources.getSector,
});
const ipoService = createIpoService({
  getCalendar: sources.getIpoCalendar,
  getDetail: sources.getIpoDetail,
  getHistory: sources.getHistory,
  storage: globalThis.localStorage,
});
const proAccess = createProAccess(globalThis.localStorage);

const state = {
  portfolio: null,
  selected: null,
  chartRows: [],
  chartGeometry: null,
  chartSelectedIndex: null,
  sort: safeGetLocal('holdingSort') || 'dailyProfit',
  historyRefreshStarted: false,
  view: 'portfolio',
  calendar: null,
  calendarLoaded: false,
  calendarLoading: false,
  theme: null,
  proAccess: null,
  proLoading: false,
  proSelectedTicker: null,
  alertSettings: normalizeAlertSettings({
    enabled: safeGetLocal('alertEnabled') !== 'false',
    threshold: safeGetLocal('alertThreshold') ?? 3,
  }),
};

const fmtTRY = new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtPct = new Intl.NumberFormat('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2, signDisplay:'always' });
const fmtNum = new Intl.NumberFormat('tr-TR', { maximumFractionDigits:2 });
const sessionFmt = new Intl.DateTimeFormat('tr-TR', { timeZone:'Europe/Istanbul', weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
const timeFmt = new Intl.DateTimeFormat('tr-TR', { timeZone:'Europe/Istanbul', hour:'2-digit', minute:'2-digit' });

function safeGetLocal(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSetLocal(key, value) { try { localStorage.setItem(key, value); } catch {} }
function safeParseLocalJson(key) { try { const raw = safeGetLocal(key); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function money(v) { return v != null && v !== '' && Number.isFinite(Number(v)) ? fmtTRY.format(Number(v)) : '—'; }
function pct(v) { return v != null && v !== '' && Number.isFinite(Number(v)) ? `${fmtPct.format(Number(v))}%` : '—'; }
function signClass(v) { return Number(v) > 0 ? 'positive' : Number(v) < 0 ? 'negative' : 'neutral'; }
function esc(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function trDate(iso) { if (!iso) return '—'; const d = new Date(`${iso}T12:00:00+03:00`); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Istanbul'}).format(d); }
function timeAgo(iso) { if (!iso) return '—'; const sec = Math.max(0,(Date.now()-new Date(iso).getTime())/1000); if(sec<60)return'şimdi'; if(sec<3600)return`${Math.floor(sec/60)} dk önce`; return timeFmt.format(new Date(iso)); }
function todayIstanbul() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }


const VIEW_META = {
  portfolio: { title:'Cüzdan' },
  holdings: { title:'Hisselerim' },
  performance: { title:'Performans' },
  markets: { title:'Haberler' },
  pro: { title:'Gelişmiş' },
  settings: { title:'Ayarlar' },
};
const IPO_STATUS_LABELS = {
  active:'Talepte', upcoming:'Yaklaşan', completed:'Tamamlandı', unknown:'Durum bekleniyor',
};

function applyTheme(theme, { persist = true } = {}) {
  const resolved = theme === 'light' ? 'light' : 'dark';
  state.theme = resolved;
  document.documentElement.dataset.theme = resolved;
  if (persist) safeSetLocal('themePreference', resolved);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#0b1020' : '#f4f7fb';
  const toggle = $('#themeToggle');
  if (toggle) toggle.setAttribute('aria-label', resolved === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç');
  try { window.AndroidBridge?.setSystemTheme?.(resolved); } catch {}
  requestAnimationFrame(drawChart);
}

function initTheme() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
  applyTheme(resolveTheme(safeGetLocal('themePreference'), prefersDark), { persist:false });
}

function formatIpoSize(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000_000) return `${fmtNum.format(n / 1_000_000_000)} mlr ₺`;
  if (n >= 1_000_000) return `${fmtNum.format(n / 1_000_000)} mn ₺`;
  return money(n);
}

function renderIpoCalendar(data = state.calendar) {
  const list = $('#calendarList');
  const status = $('#calendarStatus');
  if (!list || !status) return;
  const filter = $('#calendarFilter')?.value || 'all';
  const all = Array.isArray(data?.items) ? data.items : [];
  const order = { active:0, upcoming:1, completed:2, unknown:3 };
  const items = all
    .filter(item => filter === 'all' || item.status === filter)
    .slice()
    .sort((a,b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  if (data) {
    const fetched = data.fetchedAt ? timeAgo(new Date(Number(data.fetchedAt)).toISOString()) : '—';
    status.textContent = data.stale ? `Önbellekten gösteriliyor · ${fetched}` : `Son güncelleme ${fetched}`;
  }
  if (!items.length) {
    list.innerHTML = `<div class="calendar-empty">${all.length ? 'Bu filtrede halka arz bulunmuyor.' : 'Takvim kaynağında gösterilecek halka arz bulunamadı.'}</div>`;
    return;
  }
  list.innerHTML = items.map(item => `
    <article class="calendar-card" data-ipo-ticker="${esc(item.ticker)}">
      <div class="calendar-card-head">
        <div class="calendar-card-title"><strong>${esc(item.ticker)}</strong><span>${esc(item.company || 'Şirket bilgisi bekleniyor')}</span></div>
        <span class="ipo-status ${esc(item.status || 'unknown')}">${IPO_STATUS_LABELS[item.status] || IPO_STATUS_LABELS.unknown}</span>
      </div>
      <div class="calendar-card-title">${esc(item.offerDates || 'Talep tarihleri henüz açıklanmadı')}</div>
      <div class="calendar-card-grid">
        <div><span>Arz fiyatı</span><strong>${money(item.ipoPrice)}</strong></div>
        <div><span>Arz büyüklüğü</span><strong>${formatIpoSize(item.ipoSizeTRY)}</strong></div>
        <div><span>Sektör</span><strong>${esc(item.sector || '—')}</strong></div>
        <div><span>Dağıtım</span><strong>${esc(item.distributionMethod || '—')}</strong></div>
      </div>
      <div class="calendar-card-footer">
        <small>${item.source ? esc(item.source) : 'Kaynak bekleniyor'}</small>
        <button type="button" class="secondary-btn compact-btn pro-link-btn" data-pro-ticker="${esc(item.ticker)}">Gelişmiş detay</button>
      </div>
    </article>
  `).join('');
  const focusTicker = String(safeGetLocal('pushFocusIpo') || '').toUpperCase();
  if (focusTicker) {
    const target = [...list.querySelectorAll('[data-ipo-ticker]')].find(card => String(card.dataset.ipoTicker || '').toUpperCase() === focusTicker);
    if (target) {
      safeSetLocal('pushFocusIpo', '');
      setTimeout(() => target.scrollIntoView({ behavior:'smooth', block:'center' }), 0);
    }
  }
  $$('[data-pro-ticker]', list).forEach(button => button.addEventListener('click', () => switchView('pro', { selectedTicker:button.dataset.proTicker })));
}

async function loadIpoCalendar({ force = false } = {}) {
  if (state.calendarLoading) return state.calendar;
  
  state.calendarLoading = true;
  const list = $('#calendarList');
  const status = $('#calendarStatus');
  if (list) list.innerHTML = '<div class="calendar-empty">Halka arz takvimi yükleniyor…</div>';
  if (status) status.textContent = 'Güncel takvim aranıyor…';
  try {
    state.calendar = await ipoService.getCalendar({ force });
    state.calendarLoaded = true;
    renderIpoCalendar(state.calendar);
    if (state.calendar?.warning) toast('Takvim önbellekten gösteriliyor.');
    return state.calendar;
  } catch (error) {
    if (status) status.textContent = 'Takvim yüklenemedi.';
    if (list) list.innerHTML = `<div class="calendar-empty">${esc(error.message || 'Takvim verisi alınamadı.')}</div>`;
    toast(error.message || 'Takvim verisi alınamadı.');
    return null;
  } finally {
    state.calendarLoading = false;
  }
}


function durationText(ms) {
  const value = Math.max(0, Number(ms) || 0);
  const days = Math.floor(value / 86_400_000);
  const hours = Math.floor((value % 86_400_000) / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  if (days > 0) return `${days} gün ${hours} saat`;
  if (hours > 0) return `${hours} saat ${minutes} dk`;
  return `${minutes} dk`;
}

function proAccessCard(access) {
  const label = access.status === 'trial'
    ? '7 günlük ücretsiz deneme'
    : access.status === 'not_started'
      ? '7 günlük ücretsiz deneme'
      : 'Deneme sona erdi';
  const detail = access.status === 'trial'
    ? `Kalan süre: ${durationText(access.remainingMs)}`
    : access.status === 'not_started'
      ? 'Deneme henüz başlatılmadı.'
      : 'Gelişmiş özellikleri kullanmaya devam etmek için Pro gerekecek.';
  return `
    <section class="pro-access-card ${access.hasAccess ? 'active' : 'pro-locked'}">
      <div><span class="eyebrow">PRO ERİŞİM</span><strong>${label}</strong><p>${detail}</p></div>
      ${access.hasAccess ? '<span class="pro-access-dot">Aktif</span>' : '<span class="pro-access-dot inactive">Kilitli</span>'}
    </section>
  `;
}

function proLockedGate(access) {
  const trialAction = access.status === 'not_started'
    ? '<button id="proTrialStart" class="primary-btn" type="button">7 günlük denemeyi başlat</button>'
    : '<button class="primary-btn pro-buy-disabled" type="button" disabled>Pro’ya geç</button>';
  return `
    <section class="pro-locked pro-gate">
      <span class="pro-lock-icon">✦</span><h3>Gelişmiş özellikler kilitli</h3>
      ${trialAction}
    </section>`;
}

function bindProGateControls() {
  $('#proTrialStart')?.addEventListener('click', () => {
    state.proAccess = proAccess.enterAdvanced();
    renderProView();
  });
}

function betaControls() { return ''; }

function bindBetaControls() {}
function proCandidates() {
  const map = new Map();
  for (const item of state.calendar?.items || []) {
    if (item?.ticker) map.set(item.ticker, item);
  }
  for (const holding of state.portfolio?.holdings || []) {
    if (!holding?.ticker) continue;
    map.set(holding.ticker, { ...(map.get(holding.ticker) || {}), ticker:holding.ticker, company:holding.company, sector:holding.sector, ipoPrice:holding.ipoPrice, firstTradeDate:holding.firstTradeDate });
  }
  return [...map.values()];
}

function renderProList() {
  const root = $('#proContent');
  const access = state.proAccess || proAccess.getState();
  if (!access.hasAccess) {
    root.innerHTML = `${proAccessCard(access)}${proLockedGate(access)}`;
    bindProGateControls();
    return;
  }
  const items = proCandidates();
  root.innerHTML = `${proAccessCard(access)}
    <section class="pro-browser">
      <div class="section-head"><div><span class="eyebrow">ARAŞTIR</span><h2>Halka arz detayları</h2></div><span class="muted small">${items.length} kayıt</span></div>
      <div class="pro-search-row"><input id="proSearch" type="search" placeholder="Hisse kodu veya şirket ara" autocomplete="off"><button id="proSearchButton" class="secondary-btn compact-btn" type="button">Ara</button></div>
      <div id="proList" class="pro-list"></div>
    </section>${betaControls(access)}`;
  bindBetaControls();
  const paint = () => {
    const q = ($('#proSearch')?.value || '').trim().toLocaleUpperCase('tr-TR');
    const filtered = items.filter(item => !q || `${item.ticker} ${item.company || ''}`.toLocaleUpperCase('tr-TR').includes(q));
    const list = $('#proList');
    if (!filtered.length) {
      list.innerHTML = '<div class="calendar-empty">Bu aramada kayıt bulunamadı. Hisse kodunu yazarak doğrudan arayabilirsiniz.</div>';
      return;
    }
    list.innerHTML = filtered.map(item => `
      <button type="button" class="pro-ipo-card" data-pro-open="${esc(item.ticker)}">
        <div><strong>${esc(item.ticker)}</strong><span>${esc(item.company || 'Halka arz')}</span></div>
        <div><span>${esc(item.offerDates || (item.firstTradeDate ? `İlk işlem ${trDate(item.firstTradeDate)}` : 'Detayları görüntüle'))}</span><b>›</b></div>
      </button>`).join('');
    $$('[data-pro-open]', list).forEach(button => button.addEventListener('click', () => openProIpoDetail(button.dataset.proOpen)));
  };
  $('#proSearch')?.addEventListener('input', paint);
  $('#proSearchButton')?.addEventListener('click', () => {
    const ticker = ($('#proSearch')?.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    const known = items.find(item => item.ticker === ticker);
    if (known || ticker.length >= 3) openProIpoDetail(ticker);
    else toast('Geçerli bir hisse kodu girin.');
  });
  paint();
}

async function ensureProCalendar() {
  
  try {
    state.calendar = await ipoService.getCalendar();
    state.calendarLoaded = true;
    return state.calendar;
  } catch {
    return null;
  }
}

function renderProView({ selectedTicker = null } = {}) {
  state.proAccess = proAccess.getState();
  const root = $('#proContent');
  if (!root) return;
  if (!state.proAccess.hasAccess) { renderProList(); return; }
  root.innerHTML = `${proAccessCard(state.proAccess)}<div class="calendar-empty">Gelişmiş alan hazırlanıyor…</div>`;
  bindBetaControls();
  state.proLoading = true;
  ensureProCalendar().finally(() => {
    state.proLoading = false;
    if (state.view !== 'pro') return;
    if (selectedTicker) openProIpoDetail(selectedTicker);
    else renderProList();
  });
}

function valueText(value, formatter = String) {
  if (value == null || value === '') return '—';
  try { return formatter(value); } catch { return String(value); }
}

function renderResultTable(results) {
  if (!Array.isArray(results) || !results.length) return '<div class="detail-empty">Sonuç tablosu henüz bulunamadı.</div>';
  return `<div class="result-table"><div class="table-head"><span>Grup</span><span>Yatırımcı</span><span>Lot</span><span>%</span></div>${results.map(row => `<div><strong>${esc(row.group)}</strong><span>${valueText(row.people, fmtNum.format)}</span><span>${valueText(row.lots, fmtNum.format)}</span><span>${valueText(row.pct, fmtNum.format)}</span></div>`).join('')}</div>`;
}

function renderCeilingRows(detail) {
  const analysis = detail.ceilingAnalysis || { openingStreak:0, totalCeilingDays:0, rows:[] };
  const actual = (analysis.rows || []).slice(0, 25);
  const simulation = (detail.ceilingSimulation || []).slice(0, 10);
  const actualHtml = actual.length
    ? `<div class="ceiling-table"><div class="table-head"><span>Gün</span><span>Tavan</span><span>Kapanış</span><span>Durum</span></div>${actual.map(row => `<div><strong>${trDate(row.date)}</strong><span>${money(row.ceiling)}</span><span>${money(row.close)}</span><span class="${row.isCeiling ? 'positive' : 'muted'}">${row.isCeiling ? 'Tavan' : pct(row.dailyPct)}</span></div>`).join('')}</div>`
    : '<div class="detail-empty">İşlem geçmişi bulunursa tavan serisi otomatik hesaplanır.</div>';
  const simulationHtml = simulation.length ? `<details class="ceiling-simulation"><summary>Teorik tavan fiyatları</summary><div class="ceiling-table compact"><div class="table-head"><span>#</span><span>Fiyat</span><span>Getiri</span></div>${simulation.map(row => `<div><strong>${row.count}. tavan</strong><span>${money(row.price)}</span><span class="positive">+%${fmtNum.format(row.returnPct)}</span></div>`).join('')}</div></details>` : '';
  return `<div class="ceiling-summary"><div><span>Açılış tavan serisi</span><strong>${analysis.openingStreak || 0}</strong></div><div><span>Toplam tavan gün</span><strong>${analysis.totalCeilingDays || 0}</strong></div><div><span>Kaynakta bildirilen</span><strong>${detail.ceilingCountReported ?? '—'}</strong></div></div>${actualHtml}${simulationHtml}`;
}

async function openProIpoDetail(ticker) {
  const access = proAccess.getState();
  state.proAccess = access;
  if (!access.hasAccess) { renderProList(); return; }
  const key = String(ticker || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (!key) return;
  state.proSelectedTicker = key;
  const root = $('#proContent');
  root.innerHTML = `${proAccessCard(access)}<div class="calendar-empty">${esc(key)} gelişmiş bilgileri yükleniyor…</div>${betaControls(access)}`;
  bindBetaControls();
  try {
    const item = proCandidates().find(row => row.ticker === key) || { ticker:key };
    const detail = await ipoService.getDetail(item);
    if (state.view !== 'pro' || state.proSelectedTicker !== key) return;
    const fund = Array.isArray(detail.fundUse) && detail.fundUse.length
      ? `<ul class="fund-list">${detail.fundUse.map(row => `<li><strong>%${fmtNum.format(row.pct)}</strong><span>${esc(row.purpose)}</span></li>`).join('')}</ul>`
      : '<div class="detail-empty">Fon kullanım bilgisi bulunamadı.</div>';
    root.innerHTML = `${proAccessCard(access)}
      <article class="pro-detail">
        <button id="proDetailBack" class="secondary-btn compact-btn pro-back" type="button">‹ Gelişmiş liste</button>
        <div class="pro-detail-head"><div><span class="eyebrow">${esc(detail.ticker)}</span><h2>${esc(detail.company || detail.ticker)}</h2><p>${esc(detail.sector || 'Sektör bilgisi bekleniyor')}</p></div><span class="ipo-status ${esc(detail.status || 'completed')}">${IPO_STATUS_LABELS[detail.status] || 'Halka arz'}</span></div>
        <section class="pro-detail-section"><h3>Halka arz bilgileri</h3><div class="ipo-detail-grid">
          <div><span>Talep toplama</span><strong>${esc(detail.offerDates || '—')}</strong></div>
          <div><span>Halka arz fiyatı</span><strong>${money(detail.ipoPrice)}</strong></div>
          <div><span>Dağıtım yöntemi</span><strong>${esc(detail.distributionMethod || '—')}</strong></div>
          <div><span>Arz edilen pay</span><strong>${valueText(detail.ipoLots, v => `${fmtNum.format(v)} lot`)}</strong></div>
          <div><span>Halka arz büyüklüğü</span><strong>${formatIpoSize(detail.ipoSizeTRY)}</strong></div>
          <div><span>Katılım endeksi</span><strong>${esc(detail.participationIndex || '—')}</strong></div>
          <div><span>BIST işlem tarihi</span><strong>${detail.firstTradeDate ? trDate(detail.firstTradeDate) : '—'}</strong></div>
          <div><span>Pazar</span><strong>${esc(detail.market || '—')}</strong></div>
          <div><span>Halka açıklık</span><strong>${detail.freeFloatPct == null ? '—' : `%${fmtNum.format(detail.freeFloatPct)}`}</strong></div>
          <div><span>İskonto</span><strong>${detail.discountPct == null ? '—' : `%${fmtNum.format(detail.discountPct)}`}</strong></div>
        </div></section>
        <section class="pro-detail-section"><h3>Şirket hakkında</h3><p class="company-summary">${esc(detail.summary || `${detail.company || detail.ticker} için kaynakta kısa şirket özeti bulunamadı.`)}</p></section>
        <section class="pro-detail-section"><h3>Konsorsiyum liderleri</h3><p class="company-summary">${Array.isArray(detail.consortiumLeaders) && detail.consortiumLeaders.length ? detail.consortiumLeaders.map(esc).join(' · ') : '—'}</p></section>
        <section class="pro-detail-section"><h3>Fon kullanım alanı</h3>${fund}</section>
        <section class="pro-detail-section"><div class="detail-section-head"><h3>Halka arz sonuçları</h3><span>${detail.participantCount ? `${fmtNum.format(detail.participantCount)} katılımcı` : ''}</span></div>${renderResultTable(detail.results)}</section>
        <section class="pro-detail-section"><div class="detail-section-head"><h3>Tavan serisi</h3><span>BIST fiyat adımına göre</span></div>${renderCeilingRows(detail)}</section>
        ${detail.warning ? `<div class="warning-box">${esc(detail.warning)}</div>` : ''}

      </article>${betaControls(access)}`;
    bindBetaControls();
    $('#proDetailBack')?.addEventListener('click', () => { state.proSelectedTicker = null; renderProList(); });
  } catch (error) {
    root.innerHTML = `${proAccessCard(access)}<div class="warning-box">${esc(error.message || 'Gelişmiş halka arz bilgisi alınamadı.')}</div><button id="proRetry" class="secondary-btn" type="button">Tekrar dene</button>${betaControls(access)}`;
    bindBetaControls();
    $('#proRetry')?.addEventListener('click', () => openProIpoDetail(key));
  }
}

function notificationPermissionText(status) {
  if (status === 'granted') return 'İzin verildi';
  if (status === 'denied') return 'Telefon ayarlarında kapalı';
  if (status === 'not_required') return 'İzin gerekmiyor';
  return 'İzin henüz verilmedi';
}

function readNativeNotificationPermission() {
  try { return window.AndroidBridge?.getNotificationPermissionStatus?.() || 'unsupported'; }
  catch { return 'unsupported'; }
}

function maybeRequestNotificationPermissionOnce() {
  if (readNativeNotificationPermission() !== 'prompt') return;
  try { window.AndroidBridge?.requestNotificationPermission?.(); } catch {}
}

function renderSettings() {
  const settings = normalizeAlertSettings(state.alertSettings);
  state.alertSettings = settings;
  const enabled = $('#notificationEnabled');
  const threshold = $('#notificationThreshold');
  const value = $('#notificationThresholdValue');
  if (enabled) enabled.checked = settings.enabled;
  if (threshold) threshold.value = String(settings.threshold);
  if (value) value.textContent = `%${String(settings.threshold).replace('.', ',')}`;
  const permission = readNativeNotificationPermission();
  const permissionEl = $('#notificationPermissionStatus');
  if (permissionEl) permissionEl.textContent = notificationPermissionText(permission);
  const permissionButton = $('#requestNotificationPermission');
  if (permissionButton) permissionButton.hidden = permission === 'granted' || permission === 'not_required' || permission === 'unsupported';
}

function persistAlertSettings() {
  state.alertSettings = normalizeAlertSettings(state.alertSettings);
  safeSetLocal('alertEnabled', String(state.alertSettings.enabled));
  safeSetLocal('alertThreshold', String(state.alertSettings.threshold));
  renderSettings();
  syncPushConfiguration();
}

const LOCAL_ALERT_STATE_KEY = 'localAlertStateV1';

function evaluateLocalAlerts(portfolio) {
  if (!portfolio || !state.alertSettings?.enabled) return;
  const permission = readNativeNotificationPermission();
  if (permission !== 'granted' && permission !== 'not_required') return;
  const previousState = safeParseLocalJson(LOCAL_ALERT_STATE_KEY);
  const activeHoldings = (portfolio.holdings || []).filter(item => Number(item.currentLots || 0) > 0);
  const referencesReady = activeHoldings.length > 0 && activeHoldings.every(item => item.referenceVerified === true);
  const result = evaluateDailyAlerts({
    day:todayIstanbul(),
    threshold:state.alertSettings.threshold,
    enabled:state.alertSettings.enabled,
    holdings:activeHoldings,
    portfolioPct:referencesReady ? Number(portfolio.totals?.dailyPct || 0) : 0,
    previousState,
  });
  let deliveredCount = 0;
  for (const event of result.events) {
    const payload = notificationPayloadForEvent(event);
    try {
      if (window.AndroidBridge?.showLocalNotification?.(JSON.stringify(payload))) deliveredCount += 1;
    } catch {}
  }
  if (result.events.length === 0 || deliveredCount === result.events.length) {
    safeSetLocal(LOCAL_ALERT_STATE_KEY, JSON.stringify(result.state));
  }
}

function pushPayload() {
  const day = todayIstanbul();
  const holdings = (state.portfolio?.holdings || []).map(item => ({
    ticker:item.ticker,
    lots:Number(item.currentLots || 0),
    ipoPrice:Number(item.ipoPrice || 0),
    sales:(Array.isArray(item.sales) ? item.sales : [])
      .filter(sale => sale?.date === day && Number(sale.lots || 0) > 0 && Number(sale.price || 0) > 0)
      .map(sale => ({ date:sale.date, lots:Number(sale.lots), price:Number(sale.price) })),
  })).filter(item => item.lots > 0 || item.sales.length > 0);
  return {
    enabled: state.alertSettings.enabled,
    threshold: state.alertSettings.threshold,
    ipoEnabled: true,
    holdings,
  };
}

function syncPushConfiguration() {
  try { window.AndroidBridge?.syncPushConfig?.(JSON.stringify(pushPayload())); } catch {}
}

window.__notificationPermissionChanged = () => { renderSettings(); loadPortfolio({ quiet:true, force:true }); };
window.__pushTokenChanged = () => syncPushConfiguration();
window.__handleAndroidBack = () => {
  if (!canHandleAppBack(window.history.state)) return false;
  window.history.back();
  return true;
};
window.__handlePushRoute = route => {
  const kind = String(route?.kind || 'portfolio');
  const ticker = String(route?.ticker || '').toUpperCase();
  if (kind === 'ipo') {
    if (ticker) safeSetLocal('pushFocusIpo', ticker);
    switchView('markets');
    return;
  }
  switchView('portfolio');
  if (['stock','ceiling','floor'].includes(kind) && ticker) {
    setTimeout(() => {
      const holding = state.portfolio?.holdings?.find(item => item.ticker === ticker);
      if (holding) openDetail(holding.id);
    }, 120);
  }
};

const NEWS_FEED_URL = 'https://halka-arz-portfoy-news-test.grass-airboat.workers.dev/v1/news?limit=60';
const NEWS_REFRESH_TTL_MS = 2 * 60 * 1000;
const NEWS_CATEGORY_NAMES = Object.freeze({
  borsa:'Borsa',
  sirketler:'Şirketler',
  doviz:'Döviz',
  altin:'Altın',
  ekonomi:'Ekonomi',
  'halka-arz':'Halka Arz',
});
const NEWS_CATEGORY_SYMBOLS = Object.freeze({
  borsa:'BIST', sirketler:'AŞ', doviz:'$ ₺ €', altin:'◆', ekonomi:'₺', 'halka-arz':'IPO',
});
const FINANCE_NEWS_CLOCK_FMT = new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'});
const FINANCE_NEWS_DAY_FMT = new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'numeric',month:'short'});
const FINANCE_NEWS_DAY_KEY_FMT = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'});
let popularFinanceNewsItems = [];
let popularFinanceNewsFetchedAt = 0;
let popularFinanceNewsPromise = null;

function parseFinanceNewsDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw + '+03:00';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatFinanceNewsTime(iso) {
  const date = parseFinanceNewsDate(iso);
  if (!date) return 'Güncel';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return Math.abs(diffMs) < 5 * 60 * 1000 ? 'Şimdi' : 'Güncel';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Şimdi';
  if (minutes < 60) return minutes + ' dk önce';
  const todayKey = FINANCE_NEWS_DAY_KEY_FMT.format(now);
  const dateKey = FINANCE_NEWS_DAY_KEY_FMT.format(date);
  const yesterdayKey = FINANCE_NEWS_DAY_KEY_FMT.format(new Date(now.getTime() - 86_400_000));
  if (dateKey === todayKey) return Math.floor(minutes / 60) + ' saat önce';
  const clock = FINANCE_NEWS_CLOCK_FMT.format(date);
  if (dateKey === yesterdayKey) return 'Dün ' + clock;
  return FINANCE_NEWS_DAY_FMT.format(date) + ' • ' + clock;
}

const GENERIC_FINANCE_NEWS_FEED_TITLES = new Set([
  'hisse senetleri','borsa kapanış','çeyrek altın','cumhuriyet altını','ziynet altını',
  'yatırım fonları','halka arz takvimi','ekonomi haberleri','borsa haberleri',
  'altın fiyatları','gram altın fiyatı','çeyrek altın fiyatı'
]);

function financeNewsCleanTitle(value) {
  return String(value || '').replace(/\s+/g,' ').trim().replace(/^(?:HABERLER|PİYASALAR)\s+/iu,'').trim();
}

function financeNewsIsArticle(item) {
  if (!item?.url) return false;
  try {
    const url = new URL(String(item.url));
    const host = url.hostname.toLocaleLowerCase('tr-TR');
    if ((host === 'bloomberght.com' || host === 'www.bloomberght.com') && !/-\d{6,}\/?$/u.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function financeNewsItemsOnly(items) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item && NEWS_CATEGORY_NAMES[item.category] && item.title && item.url && financeNewsIsArticle(item))
    .map(item => ({ ...item, title:financeNewsCleanTitle(item.title) }))
    .filter(item => !GENERIC_FINANCE_NEWS_FEED_TITLES.has(item.title.toLocaleLowerCase('tr-TR')))
    .slice()
    .sort((a,b) => (parseFinanceNewsDate(b.publishedAt)?.getTime() || 0) - (parseFinanceNewsDate(a.publishedAt)?.getTime() || 0));
}

function choosePopularFinanceNews(items, limit = 4) {
  const result = [];
  const usedCategories = new Set();
  for (const item of items) {
    if (result.length >= limit) break;
    if (usedCategories.has(item.category)) continue;
    result.push(item);
    usedCategories.add(item.category);
  }
  for (const item of items) {
    if (result.length >= limit) break;
    if (!result.includes(item)) result.push(item);
  }
  return result;
}

function financeNewsArtClass(category) {
  return 'news-art-' + (NEWS_CATEGORY_NAMES[category] ? category : 'ekonomi');
}

function financeNewsCategoryClass(category) {
  return 'news-cat-' + (NEWS_CATEGORY_NAMES[category] ? category : 'ekonomi');
}

function financeNewsSourceInitial(source) {
  const cleaned = String(source || 'Finans').trim();
  return cleaned ? cleaned.charAt(0).toLocaleUpperCase('tr-TR') : 'F';
}

const FINANCE_NEWS_CACHE_KEY = 'finance_news_cache_v3';
const FINANCE_NEWS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FINANCE_NEWS_BACKGROUND_REFRESH_MS = 2 * 60 * 1000;
const financeNewsPreloadRefs = new Map();

function persistFinanceNewsCache(items) {
  try {
    const safeItems = financeNewsItemsOnly(items).slice(0, 40);
    localStorage.setItem(FINANCE_NEWS_CACHE_KEY, JSON.stringify({
      fetchedAt: Date.now(),
      items: safeItems,
    }));
  } catch {}
}

function restoreFinanceNewsCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(FINANCE_NEWS_CACHE_KEY) || 'null');
    const fetchedAt = Number(cached?.fetchedAt || 0);
    if (!Array.isArray(cached?.items) || !cached.items.length) return false;
    if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > FINANCE_NEWS_CACHE_MAX_AGE_MS) return false;
    popularFinanceNewsItems = financeNewsItemsOnly(cached.items);
    popularFinanceNewsFetchedAt = fetchedAt;
    preloadFinanceNewsImages(popularFinanceNewsItems);
    renderPopularFinanceNews();
    return popularFinanceNewsItems.length > 0;
  } catch {
    return false;
  }
}

function preloadFinanceNewsImages(items, limit = 12) {
  if (typeof Image !== 'function') return;
  const urls = [];
  const seen = new Set();
  for (const item of financeNewsItemsOnly(items)) {
    const url = normalizeFinanceArticleImageUrl(item?.imageUrl, item?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= limit) break;
  }
  for (const url of urls) {
    if (financeNewsPreloadRefs.has(url)) continue;
    const image = new Image();
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onload = image.onerror = () => {
      setTimeout(() => financeNewsPreloadRefs.delete(url), 30_000);
    };
    financeNewsPreloadRefs.set(url, image);
    image.src = url;
  }
}

function renderPopularFinanceNews() {
  const rail = $('#popularNewsRail');
  const dots = $('#popularNewsDots');
  const latest = $('#latestNewsList');
  const status = $('#newsStatus');
  if (!rail || !dots || !latest || !status) return;

  const items = financeNewsItemsOnly(popularFinanceNewsItems);
  if (!items.length) {
    rail.innerHTML = '<div class="finance-news-empty">' + esc(financeNewsLastError || 'Finans haberleri şu anda görüntülenemiyor. Biraz sonra tekrar deneyin.') + '</div>';
    dots.innerHTML = '';
    latest.innerHTML = '';
    status.textContent = financeNewsLastError || 'Haber akışı bekleniyor';
    return;
  }

  const popular = choosePopularFinanceNews(items, 4);
  const popularIds = new Set(popular.map(item => item.id || item.url));
  const latestItems = items.filter(item => !popularIds.has(item.id || item.url)).slice(0, 10);
  const visibleLatest = latestItems.length ? latestItems : items.slice(0, 8);

  rail.innerHTML = popular.map(item => {
    const category = NEWS_CATEGORY_NAMES[item.category] || 'Ekonomi';
    const symbol = NEWS_CATEGORY_SYMBOLS[item.category] || '₺';
    return '<article class="news-feature-card">' +
      '<a class="news-source-link" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' +
        '<div class="news-feature-art ' + financeNewsArtClass(item.category) + '">' +
          (item.imageUrl ? '<img class="news-feature-image" src="' + esc(item.imageUrl) + '" alt="" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true" />' : '') +
          '<span class="news-art-grid"></span>' +
          '<span class="news-art-symbol">' + esc(symbol) + '</span>' +
          '<span class="news-category-chip ' + financeNewsCategoryClass(item.category) + '">' + esc(category) + '</span>' +
        '</div>' +
        '<div class="news-feature-body">' +
          '<div class="news-feature-meta"><span class="news-source"><span class="news-source-dot">' + esc(financeNewsSourceInitial(item.source)) + '</span>' + esc(item.source || 'Finans') + '</span><span class="news-time">' + esc(formatFinanceNewsTime(item.publishedAt)) + '</span></div>' +
          '<h3 class="news-feature-title">' + esc(item.title) + '</h3>' +
        '</div>' +
      '</a>' +
    '</article>';
  }).join('');

  dots.innerHTML = popular.map((_, index) => '<span class="popular-news-dot' + (index === 0 ? ' active' : '') + '" data-news-dot="' + index + '"></span>').join('');

  latest.innerHTML = visibleLatest.map(item => {
    const category = NEWS_CATEGORY_NAMES[item.category] || 'Ekonomi';
    const symbol = NEWS_CATEGORY_SYMBOLS[item.category] || '₺';
    return '<a class="news-latest-item" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="news-latest-thumb ' + financeNewsArtClass(item.category) + '">' +
        '<span>' + esc(symbol) + '</span>' +
        (item.imageUrl ? '<img class="news-latest-image" src="' + esc(item.imageUrl) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true" />' : '') +
      '</span>' +
      '<span class="news-latest-copy"><span class="news-latest-meta"><span class="news-latest-category ' + financeNewsCategoryClass(item.category) + '">' + esc(category) + '</span><span>' + esc(item.source || 'Finans') + '</span><span class="news-time">' + esc(formatFinanceNewsTime(item.publishedAt)) + '</span></span><h4>' + esc(item.title) + '</h4></span>' +
      '<span class="news-latest-arrow">›</span>' +
    '</a>';
  }).join('');

  status.textContent = 'Finans gündemi · ' + items.length + ' haber';

  if (!rail.dataset.newsDotsBound) {
    rail.dataset.newsDotsBound = '1';
    rail.addEventListener('scroll', () => {
      const cards = $$('.news-feature-card', rail);
      if (!cards.length) return;
      const cardWidth = cards[0].getBoundingClientRect().width + 12;
      const index = Math.max(0, Math.min(cards.length - 1, Math.round(rail.scrollLeft / Math.max(1, cardWidth))));
      $$('.popular-news-dot', dots).forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index));
    }, { passive:true });
  }
}

const AA_FINANCE_URL = 'https://www.aa.com.tr/tr/ekonomi';
let financeNewsLastError = '';

function validateFinanceNewsPayload(payload, label) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length < 1) {
    throw new Error(label + ' boş haber listesi döndürdü.');
  }
  return payload;
}

function inferAaFinanceCategory(title) {
  const text = String(title || '').toLocaleLowerCase('tr-TR');
  if (/halka arz|arz talep|borsada işlem/.test(text)) return 'halka-arz';
  if (/borsa|bist|hisse|endeks|spk|borsa istanbul/.test(text)) return 'borsa';
  if (/altın|gram altın|ons/.test(text)) return 'altin';
  if (/dolar|euro|avro|döviz|kur |kurun|sterlin/.test(text)) return 'doviz';
  if (/şirket|holding|banka|bankacılık|firma|sanayi|otomobil|otomotiv/.test(text)) return 'sirketler';
  return 'ekonomi';
}

function parseAaFinanceFallback(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ''), 'text/html');
  const seen = new Set();
  const items = [];
  for (const anchor of doc.querySelectorAll('a[href]')) {
    const href = String(anchor.getAttribute('href') || '').trim();
    if (!href.includes('/tr/ekonomi/')) continue;
    const title = String(anchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (title.length < 20) continue;
    let url;
    try { url = new URL(href, 'https://www.aa.com.tr').href; }
    catch { continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({
      id: 'aa:' + url,
      source: 'Anadolu Ajansı',
      title,
      url,
      category: inferAaFinanceCategory(title),
      publishedAt: null,
    });
    if (items.length >= 30) break;
  }
  return { items, fetchedAt: new Date().toISOString(), partial: true, fallback: 'aa-ekonomi' };
}

async function fetchAaFinanceFallback() {
  const html = await httpGetText(AA_FINANCE_URL);
  return validateFinanceNewsPayload(parseAaFinanceFallback(html), 'AA Ekonomi');
}

async function fetchPopularFinanceNewsPayload() {
  let nativeMessage = '';
  let fetchMessage = '';
  try {
    return validateFinanceNewsPayload(await httpGetJson(NEWS_FEED_URL), 'Finans servisi');
  } catch (nativeError) {
    nativeMessage = nativeError instanceof Error ? nativeError.message : String(nativeError || 'Android ağ isteği başarısız');
  }

  try {
    const response = await fetch(NEWS_FEED_URL, {
      method:'GET',
      cache:'no-store',
      headers:{ accept:'application/json' },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return validateFinanceNewsPayload(await response.json(), 'WebView finans servisi');
  } catch (fetchError) {
    fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError || 'WebView ağ isteği başarısız');
  }

  try {
    return await fetchAaFinanceFallback();
  } catch (aaError) {
    const aaMessage = aaError instanceof Error ? aaError.message : String(aaError || 'AA ekonomi isteği başarısız');
    throw new Error('Worker(native): ' + nativeMessage + ' / Worker(web): ' + fetchMessage + ' / AA: ' + aaMessage);
  }
}

const FINANCE_NEWS_METADATA_LIMIT = 18;
const GENERIC_FINANCE_NEWS_TITLES = Object.freeze([
  'Hisse Senetleri',
  'Borsa Kapanış',
  'Cumhuriyet Altını',
  'Ziynet Altını',
  'Borsa',
  'Altın',
  'Döviz',
  'Piyasalar',
  'Ekonomi',
]);

function normalizeFinanceNewsTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[|\-–—]\s*Bloomberg\s*HT\s*$/i, '')
    .trim();
}

function isGenericFinanceNewsTitle(value) {
  const title = normalizeFinanceNewsTitle(value).toLocaleLowerCase('tr-TR');
  if (!title) return true;
  return GENERIC_FINANCE_NEWS_TITLES.some(label => label.toLocaleLowerCase('tr-TR') === title) ||
    /^(hisse senetleri|borsa kapanış|cumhuriyet altını|ziynet altını|piyasalar|döviz|altın|borsa|ekonomi)$/.test(title);
}

function normalizeVerifiedFinancePublicationTime(value) {
  const parsed = parseFinanceNewsDate(value);
  if (!parsed) return null;
  const stamp = parsed.getTime();
  if (!Number.isFinite(stamp) || stamp > Date.now() + 10 * 60 * 1000) return null;
  return parsed.toISOString();
}

function findJsonLdFinancePublicationTime(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findJsonLdFinancePublicationTime(child);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  if (value.datePublished) return value.datePublished;
  for (const child of Object.values(value)) {
    const found = findJsonLdFinancePublicationTime(child);
    if (found) return found;
  }
  return null;
}

function normalizeFinanceArticleImageUrl(value, baseUrl = '') {
  const raw = typeof value === 'string'
    ? value
    : (value && typeof value === 'object' ? (value.url || value.contentUrl || '') : '');
  if (!raw) return null;
  try {
    const parsed = new URL(String(raw).trim(), baseUrl || undefined);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function findJsonLdFinanceImage(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findJsonLdFinanceImage(child);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  if (value.image) {
    const found = findJsonLdFinanceImage(value.image);
    if (found) return found;
  }
  if (value.contentUrl) return value.contentUrl;
  if (value.url && /image/i.test(String(value['@type'] || ''))) return value.url;
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      const found = findJsonLdFinanceImage(child);
      if (found) return found;
    }
  }
  return null;
}

function extractFinanceArticleMetadata(html, baseUrl = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ''), 'text/html');
  const titleCandidates = [
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content'),
    doc.querySelector('h1')?.textContent,
  ];
  let title = null;
  for (const candidate of titleCandidates) {
    const cleaned = normalizeFinanceNewsTitle(candidate);
    if (cleaned && cleaned.length >= 18 && !isGenericFinanceNewsTitle(cleaned)) {
      title = cleaned;
      break;
    }
  }

  const publicationCandidates = [
    doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content'),
    doc.querySelector('meta[name="article:published_time"]')?.getAttribute('content'),
    doc.querySelector('time[datetime]')?.getAttribute('datetime'),
  ];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || 'null');
      const datePublished = findJsonLdFinancePublicationTime(parsed);
      if (datePublished) publicationCandidates.push(datePublished);
    } catch {}
  }
  let publishedAt = null;
  for (const candidate of publicationCandidates) {
    publishedAt = normalizeVerifiedFinancePublicationTime(candidate);
    if (publishedAt) break;
  }
  const imageCandidates = [
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    doc.querySelector('meta[property="og:image:secure_url"]')?.getAttribute('content'),
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content'),
    doc.querySelector('meta[property="twitter:image"]')?.getAttribute('content'),
  ];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || 'null');
      const jsonLdImage = findJsonLdFinanceImage(parsed);
      if (jsonLdImage) imageCandidates.push(jsonLdImage);
    } catch {}
  }
  let imageUrl = null;
  for (const candidate of imageCandidates) {
    imageUrl = normalizeFinanceArticleImageUrl(candidate, baseUrl);
    if (imageUrl) break;
  }
  return { title, publishedAt, imageUrl };
}

function financeNewsArticleHost(item) {
  try { return new URL(String(item?.url || '')).hostname.toLocaleLowerCase('tr-TR'); }
  catch { return ''; }
}

function isBloombergHtFinanceItem(item) {
  const host = financeNewsArticleHost(item);
  return String(item?.source || '').trim() === 'Bloomberg HT' || host === 'bloomberght.com' || host === 'www.bloomberght.com';
}

async function enrichFinanceNewsItem(item) {
  const genericTitle = isGenericFinanceNewsTitle(item?.title);
  const verifyOriginal = isBloombergHtFinanceItem(item);
  if (!verifyOriginal) return genericTitle ? null : item;

  try {
    const metadata = extractFinanceArticleMetadata(await httpGetText(item.url), item.url);
    const title = metadata.title || (genericTitle ? null : normalizeFinanceNewsTitle(item.title));
    if (!title || isGenericFinanceNewsTitle(title)) return null;
    return {
      ...item,
      title,
      publishedAt: metadata.publishedAt || null,
      publicationTimeVerified: Boolean(metadata.publishedAt),
      imageUrl: metadata.imageUrl || normalizeFinanceArticleImageUrl(item?.imageUrl, item?.url) || null,
    };
  } catch {
    if (genericTitle) return null;
    return {
      ...item,
      title: normalizeFinanceNewsTitle(item.title),
      publishedAt: null,
      publicationTimeVerified: false,
    };
  }
}

async function enrichFinanceNewsItems(items) {
  const sourceItems = Array.isArray(items) ? items : [];
  const visibleCandidates = sourceItems.slice(0, FINANCE_NEWS_METADATA_LIMIT);
  const verified = await Promise.all(visibleCandidates.map(enrichFinanceNewsItem));
  const remainder = sourceItems
    .slice(FINANCE_NEWS_METADATA_LIMIT)
    .filter(item => !isGenericFinanceNewsTitle(item?.title))
    .map(item => isBloombergHtFinanceItem(item)
      ? {
          ...item,
          title: normalizeFinanceNewsTitle(item.title),
          publishedAt:null,
          publicationTimeVerified:false,
        }
      : item);
  return verified.filter(Boolean).concat(remainder);
}

async function loadPopularFinanceNews({ force = false } = {}) {
  if (!force && popularFinanceNewsItems.length && Date.now() - popularFinanceNewsFetchedAt < NEWS_REFRESH_TTL_MS) {
    renderPopularFinanceNews();
    return popularFinanceNewsItems;
  }
  if (!force && popularFinanceNewsPromise) return popularFinanceNewsPromise;
  const status = $('#newsStatus');
  if (status) status.textContent = 'Finans haberleri yenileniyor…';
  const task = fetchPopularFinanceNewsPayload()
    .then(async payload => {
      financeNewsLastError = '';
      const feedItems = financeNewsItemsOnly(payload?.items);
      if (feedItems.length) {
        popularFinanceNewsItems = feedItems;
        popularFinanceNewsFetchedAt = Date.now();
        persistFinanceNewsCache(popularFinanceNewsItems);
        preloadFinanceNewsImages(popularFinanceNewsItems);
        renderPopularFinanceNews();
      }
      const enrichedItems = await enrichFinanceNewsItems(payload?.items);
      popularFinanceNewsItems = financeNewsItemsOnly(enrichedItems);
      popularFinanceNewsFetchedAt = Date.now();
      persistFinanceNewsCache(popularFinanceNewsItems);
      preloadFinanceNewsImages(popularFinanceNewsItems);
      renderPopularFinanceNews();
      return popularFinanceNewsItems;
    })
    .catch(error => {
      const reason = String(error?.message || 'Ağ hatası').slice(0, 240);
      financeNewsLastError = 'Haberler alınamadı · ' + reason;
      if (status) status.textContent = financeNewsLastError;
      if (!popularFinanceNewsItems.length) renderPopularFinanceNews();
      return popularFinanceNewsItems;
    })
    .finally(() => {
      if (popularFinanceNewsPromise === task) popularFinanceNewsPromise = null;
    });
  popularFinanceNewsPromise = task;
  return task;
}

function switchView(view, { push = true, selectedTicker = null } = {}) {
  const normalizedView = view === 'calendar' ? 'markets' : view;
  const next = VIEW_META[normalizedView] ? normalizedView : 'portfolio';
  state.view = next;
  Object.keys(VIEW_META).forEach(key => {
    const el = $(`#${key}View`);
    if (el) el.hidden = key !== next;
  });
  $$('.nav-tab').forEach(tab => {
    const active = tab.dataset.view === next;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if ($('#screenTitle')) $('#screenTitle').textContent = VIEW_META[next].title;
  if ($('#addFab')) $('#addFab').hidden = !['portfolio','holdings'].includes(next);
  if ($('#refreshBtn')) $('#refreshBtn').hidden = !['portfolio','holdings'].includes(next);
  if (next === 'markets') loadPopularFinanceNews();
  if (next === 'portfolio') renderHomeComparison();
  if (next === 'performance') requestAnimationFrame(drawChart);
  if (next === 'pro' && typeof renderProView === 'function') renderProView({ selectedTicker });
  if (next === 'settings') renderSettings();
  if (push) {
    const hash = next === 'portfolio' ? '' : `#${next}`;
    window.history.pushState(nextNavigationState(window.history.state, { view:next, ...(selectedTicker ? { selectedTicker } : {}) }), '', `${location.pathname}${location.search}${hash}`);
  }
}

function marketDataText(data) {
  if (!data?.marketDataTime) return 'Piyasa verisi bekleniyor';
  const stamp = new Date(data.marketDataTime);
  const status = getBistMarketStatus(new Date());
  const ageMinutes = Number.isFinite(Number(data.marketDataAgeMs)) ? Math.max(0, Math.floor(Number(data.marketDataAgeMs) / 60000)) : null;
  if (status.isOpen) {
    return `Piyasa verisi ${timeFmt.format(stamp)}${ageMinutes == null ? '' : ` · ${ageMinutes} dk önce`}`;
  }
  const marketDay = new Intl.DateTimeFormat('tr-TR', { timeZone:'Europe/Istanbul', day:'numeric', month:'short' }).format(stamp);
  return `Son piyasa verisi ${marketDay} ${timeFmt.format(stamp)}`;
}

let homeComparisonData = null;
let homeComparisonPromise = null;
let homeComparisonFetchedAt = 0;
let homeComparisonRange = 'daily';
const HOME_COMPARISON_TTL_MS = 5 * 60 * 1000;
const comparisonRangeSessions = { daily: 1, weekly: 5, monthly: 22 };

async function fetchComparisonSeries(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d&includePrePost=false&events=div%2Csplits`;
  return comparisonSeriesFromYahoo(await httpGetJson(url));
}

function portfolioComparisonMove(range) {
  if (range === 'daily') {
    const raw = state.portfolio?.totals?.dailyPct;
    if (raw == null || !Number.isFinite(Number(raw))) return null;
    return Number(raw);
  }
  const reference = homeComparisonData?.[range] || {};
  return compoundedPortfolioMove(
    state.portfolio?.history,
    reference.startDate || null,
    reference.endDate || null,
  );
}

function setComparisonMetric(id, value) {
  const el = $(id);
  if (!el) return;
  const numeric = value == null ? null : Number(value);
  el.textContent = Number.isFinite(numeric) ? pct(numeric) : '—';
  el.classList.remove('positive','negative','neutral');
  el.classList.add(Number.isFinite(numeric) ? signClass(numeric) : 'neutral');
}

function renderMarketSummary() {
  const daily = homeComparisonData?.daily || {};
  setComparisonMetric('#marketSummaryGold', daily.goldTlPct ?? null);
  setComparisonMetric('#marketSummaryBist', daily.bistPct ?? null);
  setComparisonMetric('#marketSummaryUsd', daily.usdPct ?? null);
}

function renderHomeComparison() {
  const range = comparisonRangeSessions[homeComparisonRange] ? homeComparisonRange : 'daily';
  const data = homeComparisonData?.[range] || {};
  setComparisonMetric('#comparisonPortfolio', portfolioComparisonMove(range));
  setComparisonMetric('#comparisonGold', data.goldTlPct ?? null);
  setComparisonMetric('#comparisonBist', data.bistPct ?? null);
  setComparisonMetric('#comparisonUsd', data.usdPct ?? null);
  $$('[data-comparison-range]').forEach(button => {
    const active = button.dataset.comparisonRange === range;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  renderMarketSummary();
}

async function loadHomeComparison({ force = false } = {}) {
  if (!force && homeComparisonData && Date.now() - homeComparisonFetchedAt < HOME_COMPARISON_TTL_MS) {
    renderHomeComparison();
    return homeComparisonData;
  }
  if (!force && homeComparisonPromise) return homeComparisonPromise;

  const task = Promise.allSettled([
    fetchComparisonSeries('GC=F'),
    fetchComparisonSeries('XU100.IS'),
    fetchComparisonSeries('TRY=X'),
  ]).then(([goldResult, bistResult, usdResult]) => {
    const gold = goldResult.status === 'fulfilled' ? goldResult.value : [];
    const bist = bistResult.status === 'fulfilled' ? bistResult.value : [];
    const usd = usdResult.status === 'fulfilled' ? usdResult.value : [];
    const today = todayIstanbul();

    homeComparisonData = Object.fromEntries(
      Object.keys(comparisonRangeSessions).map(range => {
        const window = comparisonWindowFromBist(bist, range, {
          today,
          sessions:comparisonRangeSessions,
        });
        if (!window) {
          return [range, {
            goldTlPct:null,
            bistPct:null,
            usdPct:null,
            startDate:null,
            endDate:null,
            sessionActive:false,
          }];
        }

        // "Günlük" gerçekten bugünü ifade eder. BIST bugün işlem görmediyse
        // cuma/perşembe hareketini bugünün hareketi gibi göstermeyiz.
        if (range === 'daily' && !window.sessionActive) {
          return [range, {
            goldTlPct:0,
            bistPct:0,
            usdPct:0,
            startDate:window.startDate,
            endDate:window.endDate,
            sessionActive:false,
          }];
        }

        return [range, {
          goldTlPct:combinedPercentageMoveBetweenDates(gold, usd, window.startDate, window.endDate),
          bistPct:percentageMoveBetweenDates(bist, window.startDate, window.endDate),
          usdPct:percentageMoveBetweenDates(usd, window.startDate, window.endDate),
          startDate:window.startDate,
          endDate:window.endDate,
          sessionActive:true,
        }];
      }),
    );

    homeComparisonFetchedAt = Date.now();
    renderHomeComparison();
    return homeComparisonData;
  }).catch(() => {
    renderHomeComparison();
    return homeComparisonData;
  }).finally(() => {
    if (homeComparisonPromise === task) homeComparisonPromise = null;
  });

  homeComparisonPromise = task;
  return task;
}

let portfolioShareResetTimer = null;

function finishPortfolioShareCapture() {
  const card = $('#portfolioHeroCard');
  const btn = $('#sharePortfolioBtn');
  if (card) card.classList.remove('share-capture');
  document.body.classList.remove('share-capture-active');
  if (btn) btn.disabled = false;
  if (portfolioShareResetTimer) {
    clearTimeout(portfolioShareResetTimer);
    portfolioShareResetTimer = null;
  }
}

window.__portfolioShareCaptureComplete = finishPortfolioShareCapture;

function sharePortfolioCardImage() {
  const card = $('#portfolioHeroCard');
  const btn = $('#sharePortfolioBtn');
  if (!card) {
    if (btn) btn.disabled = false;
    toast('Portföy kartı bulunamadı.');
    return;
  }
  if (typeof window.AndroidBridge?.shareCardImage !== 'function') {
    if (btn) btn.disabled = false;
    toast('Görsel paylaşımı yalnız Android uygulamasında kullanılabilir.');
    return;
  }

  card.classList.add('share-capture');
  document.body.classList.add('share-capture-active');
  if (portfolioShareResetTimer) clearTimeout(portfolioShareResetTimer);
  portfolioShareResetTimer = setTimeout(finishPortfolioShareCapture, 1800);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        const rect = card.getBoundingClientRect();
        const scale = Math.max(1, Number(window.devicePixelRatio) || 1);
        window.AndroidBridge.shareCardImage(
          rect.left * scale,
          rect.top * scale,
          rect.width * scale,
          rect.height * scale
        );
      } catch {
        finishPortfolioShareCapture();
        toast('Portföy kartı paylaşımı açılamadı.');
      }
    });
  });
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2800);
}

function setMetric(id, value, cls = null) {
  const el = $(id);
  el.textContent = value;
  el.classList.remove('positive','negative','neutral');
  if (cls) el.classList.add(cls);
}

function renderMarketStatus() {
  const info = getBistMarketStatus(new Date());
  const el = $('#marketStatus');
  el.classList.toggle('open', info.isOpen);
  el.classList.toggle('closed', !info.isOpen);
  $('strong', el).textContent = info.label;
  $('span', el).textContent = info.isOpen
    ? `${timeFmt.format(new Date(info.closesAt))} kapanış`
    : info.nextOpenAt
      ? `${sessionFmt.format(new Date(info.nextOpenAt))} açılış`
      : info.reason;
  el.title = info.reason || '';
}

const portfolioRefreshGate = createRefreshGate();
const historyRefreshGate = createRefreshGate();

async function loadPortfolio({ quiet = false, force = false } = {}) {
  const btn = $('#refreshBtn');
  return portfolioRefreshGate.run(async ({ force:runForce }) => {
    if (!quiet) btn?.classList.add('spinning');
    try {
      const cached = await service.getPortfolio({ refresh:false });
      state.portfolio = cached;
      renderPortfolio(cached);

      const fresh = await service.getPortfolio({ refresh:true, force:runForce });
      state.portfolio = fresh;
      renderPortfolio(fresh);
      evaluateLocalAlerts(fresh);
      syncPushConfiguration();
      return fresh;
    } catch (error) {
      toast(error.message);
      return state.portfolio;
    } finally {
      if (!quiet) btn?.classList.remove('spinning');
    }
  }, { force });
}

async function refreshBackgroundHistory({ force = false, announce = false } = {}) {
  return historyRefreshGate.run(async ({ force:runForce }) => {
    state.historyRefreshStarted = true;
    try {
      const data = await service.refreshHistory({ force:runForce });
      state.portfolio = data;
      renderPortfolio(data);
      if (state.selected) state.selected = data.holdings.find(h => h.id === state.selected.id) || null;
      if (announce) toast('Geçmiş ve sektör verileri güncellendi.');
      return data;
    } catch (error) {
      if (announce) toast(error.message);
      return state.portfolio;
    } finally {
      state.historyRefreshStarted = false;
    }
  }, { force });
}

const WEEKLY_MOVER_SESSIONS = 5;

function weeklyMoveForHolding(holding) {
  if (Number(holding?.currentLots || 0) <= 0) return null;
  const rows = (Array.isArray(holding?.history) ? holding.history : [])
    .filter(row => row?.date && Number.isFinite(Number(row?.close)) && Number(row.close) > 0)
    .slice()
    .sort((a,b) => String(a.date).localeCompare(String(b.date)));
  if (rows.length <= WEEKLY_MOVER_SESSIONS) return null;
  const current = Number(rows[rows.length - 1]?.close);
  const previous = Number(rows[rows.length - 1 - WEEKLY_MOVER_SESSIONS]?.close);
  if (!(current > 0) || !(previous > 0)) return null;
  return {
    id: holding.id,
    ticker: holding.ticker,
    company: holding.company || 'BIST',
    weeklyPct: ((current / previous) - 1) * 100,
  };
}

function renderWeeklyMovers(holdings = []) {
  const list = $('#weeklyMoversList');
  if (!list) return;
  const movers = holdings
    .map(weeklyMoveForHolding)
    .filter(Boolean)
    .sort((a,b) => Math.abs(b.weeklyPct) - Math.abs(a.weeklyPct))
    .slice(0, 3);
  if (!movers.length) {
    list.innerHTML = '<div class="weekly-movers-empty">Haftalık veri bekleniyor.</div>';
    return;
  }
  list.innerHTML = movers.map(mover =>
    '<button class="weekly-mover-row" type="button" data-weekly-mover-id="' + esc(mover.id) + '">' +
      '<span class="weekly-mover-identity"><strong>' + esc(mover.ticker) + '</strong><span>' + esc(mover.company) + '</span></span>' +
      '<span class="weekly-mover-change ' + signClass(mover.weeklyPct) + '">' +
        (mover.weeklyPct >= 0 ? '▲ ' : '▼ ') + pct(mover.weeklyPct) +
      '</span>' +
    '</button>'
  ).join('');
  list.querySelectorAll('[data-weekly-mover-id]').forEach(button => {
    button.addEventListener('click', () => openDetail(button.dataset.weeklyMoverId));
  });
}

function renderPortfolio(data) {
  const t = data.totals;
  try {
    window.AndroidBridge?.updateWalletWidget?.(JSON.stringify({
      totalWealth:Number.isFinite(Number(t.totalWealth)) ? Number(t.totalWealth) : null,
      totalProfit:Number.isFinite(Number(t.totalProfit)) ? Number(t.totalProfit) : null,
      totalProfitPct:Number.isFinite(Number(t.totalProfitPct)) ? Number(t.totalProfitPct) : null,
      dailyProfit:Number.isFinite(Number(t.dailyProfit)) ? Number(t.dailyProfit) : null,
      dailyPct:Number.isFinite(Number(t.dailyPct)) ? Number(t.dailyPct) : null,
      invested:Number.isFinite(Number(t.invested)) ? Number(t.invested) : null,
      activeValue:Number.isFinite(Number(t.activeValue)) ? Number(t.activeValue) : null,
      salesProceeds:Number.isFinite(Number(t.salesProceeds)) ? Number(t.salesProceeds) : null,
      updatedAt:new Date().toISOString(),
    }));
  } catch {}
  setMetric('#totalWealth', money(t.totalWealth));
  const totalBadge = $('#totalProfitBadge');
  totalBadge.textContent = `${money(t.totalProfit)} · ${pct(t.totalProfitPct)}`;
  totalBadge.className = `pill ${signClass(t.totalProfit)}`;
  setMetric('#dailyProfit', money(t.dailyProfit), signClass(t.dailyProfit));
  setMetric('#dailyPct', pct(t.dailyPct), signClass(t.dailyPct));
  setMetric('#invested', money(t.invested));
  setMetric('#activeValue', money(t.activeValue));
  setMetric('#salesProceeds', money(t.salesProceeds));
  $('#holdingCount').textContent = `${data.holdings.length} hisse`;
  renderHomeComparison();

  const list = $('#holdings');
  list.innerHTML = '';
  $('#emptyState').hidden = data.holdings.length > 0;
  for (const holding of sortHoldings(data.holdings, state.sort)) list.appendChild(renderHolding(holding));

  renderSectorAllocation(data.holdings);
  renderDailyHistory();
  drawChart();
  renderWeeklyMovers(data.holdings);
}

const holdingLogoCache = new Map();

function bistHoldingLogoUrl(ticker) {
  const symbol = String(ticker || '').trim().toLocaleUpperCase('tr-TR');
  if (!/^[A-Z0-9]+$/.test(symbol)) return null;
  return 'https://cdn.jsdelivr.net/gh/ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos/logos/' + encodeURIComponent(symbol) + '.png';
}

async function fetchHoldingLogoUrl(ticker) {
  return bistHoldingLogoUrl(ticker);
}

async function hydrateHoldingLogo(node, holding) {
  const avatar = $('.holding-logo-avatar', node);
  const logo = $('.holding-logo', node);
  const fallback = $('.holding-logo-fallback', node);
  if (!avatar || !logo || !fallback) return;
  fallback.textContent = String(holding?.ticker || '?').charAt(0).toLocaleUpperCase('tr-TR') || '?';
  fallback.hidden = false;
  logo.hidden = true;
  logo.referrerPolicy = 'no-referrer';
  logo.decoding = 'async';
  const logoUrl = await fetchHoldingLogoUrl(holding?.ticker);
  if (!logoUrl) return;
  const showFallback = () => { logo.hidden = true; fallback.hidden = false; };
  logo.addEventListener('error', showFallback, { once:true });
  logo.addEventListener('load', () => { logo.hidden = false; fallback.hidden = true; }, { once:true });
  logo.src = logoUrl;
}

function renderHolding(h) {
  const node = $('#holdingTemplate').content.firstElementChild.cloneNode(true);
  $('.ticker',node).textContent = h.ticker;
  $('.lots',node).textContent = `${h.currentLots} lot`;
  $('.company',node).textContent = h.company || (h.errors?.ipo ? 'Halka arz bilgisi eksik' : 'BIST');
  const sector = $('.sector-tag',node);
  sector.textContent = h.sector || 'Sektör bekleniyor';
  sector.classList.toggle('unknown', !h.sector);
  $('.current-price',node).textContent = money(h.currentPrice);
  $('.daily-pct',node).textContent = pct(h.dailyPct);
  $('.daily-pct',node).classList.add(signClass(h.dailyPct));
  $('.daily-profit',node).textContent = money(h.dailyProfit);
  $('.daily-profit',node).classList.add(signClass(h.dailyProfit));
  $('.total-profit',node).textContent = h.totalProfit == null ? 'Bilgi eksik' : `${money(h.totalProfit)} · ${pct(h.totalProfitPct)}`;
  $('.total-profit',node).classList.add(signClass(h.totalProfit));
  $('.active-value',node).textContent = money(h.activeValue);
  $('.ipo-price',node).textContent = `Alış fiyatı: ${money(h.ipoPrice)}`;
  $('.trade-date',node).textContent = h.firstTradeDate ? `Alış tarihi: ${trDate(h.firstTradeDate)}` : 'Alış tarihi: —';
  $('.holding-main',node).addEventListener('click', () => openDetail(h.id));
  hydrateHoldingLogo(node, h);
  return node;
}

function renderSectorAllocation(holdings) {
  const section = $('#sectorAllocation');
  const donut = $('#sectorDonut');
  const legend = $('#sectorLegend');
  const rows = sectorBreakdown(holdings);
  const palette = ['#718dff','#35d49a','#ffb454','#c278ff','#54c7ec','#ff7582','#82d173','#e4cf58'];
  legend.innerHTML = '';
  section.classList.toggle('has-data', rows.length > 0);
  if (!rows.length) {
    donut.style.background = 'rgba(255,255,255,.05)';
    donut.innerHTML = '<span>Veri<br>bekleniyor</span>';
    legend.innerHTML = '<div class="sector-empty">Henüz veri yok.</div>';
    return;
  }
  let cursor = 0;
  const segments = rows.map((row,index) => {
    const start = cursor;
    cursor += row.pct;
    return `${palette[index % palette.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  donut.style.background = `conic-gradient(${segments.join(',')})`;
  donut.innerHTML = `<span>${rows.length}<small>sektör</small></span>`;
  rows.forEach((row,index) => {
    const item = document.createElement('div');
    item.className = 'sector-row';
    item.innerHTML = `<i style="--sector-color:${palette[index % palette.length]}"></i><div><strong>${esc(row.sector)}</strong><small>${money(row.value)}</small></div><b>%${fmtNum.format(row.pct)}</b>`;
    legend.appendChild(item);
  });
}

function selectedHistoryRows() {
  const history = state.portfolio?.history || [];
  const days = Number($('#chartRange').value || 30);
  if (days <= 0) return history;
  const end = new Date(todayIstanbul() + 'T12:00:00Z');
  if (days === 365) end.setUTCFullYear(end.getUTCFullYear()-1);
  else end.setUTCDate(end.getUTCDate()-days+1);
  const start = end.toISOString().slice(0,10);
  return history.filter(row => row.date >= start);
}

function renderDailyHistory() {
  const el = $('#dailyHistory');
  const rows = selectedHistoryRows().slice().reverse();
  if (!rows.length) {
    el.innerHTML = '<div class="analytics-empty">Henüz veri yok.</div>';
    return;
  }
  el.innerHTML = rows.map(row => `
    <div class="daily-row">
      <div class="daily-date"><strong>${trDate(row.date)}</strong><small>Toplam ${money(row.value)}</small></div>
      <div class="daily-change"><strong class="${signClass(row.dailyProfit)}">${money(row.dailyProfit)}</strong><small class="${signClass(row.dailyPct)}">${pct(row.dailyPct)} günlük</small></div>
      <div class="daily-total"><strong class="${signClass(row.profit)}">${money(row.profit)}</strong><small>${pct(row.profitPct)} toplam</small></div>
    </div>
  `).join('');
}

function hideSheets() {
  closeDeleteHoldingConfirm();
  $('#sheetBackdrop').hidden = true;
  $$('.sheet').forEach(sheet => { sheet.hidden = true; });
  document.body.style.overflow = '';
  document.body.classList.remove('sheet-open');
}

function showSheet(id) {
  hideSheets();
  $('#sheetBackdrop').hidden = false;
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
  document.body.classList.add('sheet-open');
}

function openSheet(id, navigation = {}, { push = true } = {}) {
  showSheet(id);
  if (push) {
    const hash = id === '#addSheet' ? '#ekle' : '#detay';
    window.history.pushState(nextNavigationState(window.history.state, { view:state.view, sheet:id, ...navigation }), '', hash);
  }
}

let closingAddSheetHistory = false;
function closeSheets({ useHistory = true } = {}) {
  const currentSheet = window.history.state?.sheet || null;
  hideSheets();
  if (useHistory && currentSheet) {
    if (currentSheet === '#addSheet') closingAddSheetHistory = true;
    window.history.back();
  }
}

function applyNavigationState(nav) {
  if (closingAddSheetHistory && nav?.sheet === '#addSheet') {
    window.history.back();
    return;
  }
  closingAddSheetHistory = false;
  switchView(nav?.view || 'portfolio', { push:false, selectedTicker:nav?.selectedTicker || null });
  if (nav?.sheet === '#addSheet') {
    openAddSheet({ push:false });
    return;
  }
  if (nav?.sheet === '#detailSheet' && nav.holdingId) {
    openDetail(nav.holdingId, { push:false });
    return;
  }
  hideSheets();
}

function openDetail(id, { push = true } = {}) {
  const h = state.portfolio?.holdings.find(x => x.id === id);
  if (!h) { hideSheets(); return; }
  state.selected = h;
  $('#detailTitle').textContent = `${h.ticker} · ${h.currentLots} lot`;
  const warnings = [h.errors?.market, h.errors?.history, h.errors?.ipo, h.errors?.sector].filter(Boolean);
  $('#detailContent').innerHTML = `
    <div class="detail-grid">
      <div class="detail-tile"><span>Güncel fiyat</span><strong>${money(h.currentPrice)}</strong></div>
      <div class="detail-tile"><span>Ortalama alış</span><strong>${money(h.averagePurchasePrice ?? h.ipoPrice)}</strong></div>
      <div class="detail-tile"><span>Mevcut maliyet</span><strong>${money(h.positionCost)}</strong></div>
      <div class="detail-tile"><span>Bugünkü kazanç</span><strong class="${signClass(h.dailyProfit)}">${money(h.dailyProfit)} · ${pct(h.dailyPct)}</strong></div>
      <div class="detail-tile"><span>Toplam kazanç</span><strong class="${signClass(h.totalProfit)}">${money(h.totalProfit)} · ${pct(h.totalProfitPct)}</strong></div>
      <div class="detail-tile"><span>Başlangıç yatırım</span><strong>${money(h.invested)}</strong></div>
      <div class="detail-tile"><span>Güncel değer</span><strong>${money(h.activeValue)}</strong></div>
      <div class="detail-tile"><span>Gerçekleşen net kâr</span><strong class="${signClass(h.realizedProfit)}">${money(h.realizedProfit)}</strong></div>
      ${Number(h.withholdingTax || 0) > 0 ? `<div class="detail-tile"><span>Stopaj (%17,5)</span><strong class="negative">-${money(h.withholdingTax)}</strong></div>` : ''}
      <div class="detail-tile"><span>Sektör</span><strong>${esc(h.sector || '—')}</strong></div>
    </div>
    ${Array.isArray(h.purchases) && h.purchases.length
      ? '<div class="edit-box purchase-history"><h3>Alış geçmişi</h3><div class="purchase-history-list">' + h.purchases.slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(purchase =>
          '<div class="purchase-history-row"><span>' + trDate(purchase.date) + '</span><strong>' + purchase.lots + ' lot · ' + money(purchase.price) + '</strong><b>' + money(Number(purchase.lots) * Number(purchase.price)) + '</b></div>'
        ).join('') + '</div></div>'
      : ''}
    ${warnings.length ? `<div class="warning-box">${warnings.map(esc).join('<br>')}</div>` : ''}
    <div class="edit-box">
      <h3>Satış ekle</h3>
      <form id="saleForm" class="mini-form">
        <input name="lots" type="number" min="1" max="${h.currentLots}" step="1" placeholder="Satılan lot" required>
        <input name="price" type="number" min="0.01" step="0.01" placeholder="Satış fiyatı" required>
        <input name="date" type="date" value="${todayIstanbul()}" required>
        <button class="primary-btn" type="submit">Satışı kaydet</button>
      </form>
    </div>
    <div class="edit-box">
      <h3>Bilgileri düzenle</h3>
      <form id="overrideForm" class="mini-form">
        <input name="ipoPriceOverride" type="number" min="0.01" step="0.01" value="${h.ipoPrice ?? ''}" placeholder="Alış fiyatı">
        <input name="firstTradeDateOverride" type="date" value="${h.firstTradeDate ?? ''}" aria-label="Alış tarihi">
        <input name="sectorOverride" type="text" value="${esc(h.sector || '')}" placeholder="Sektör (örn. Enerji)">
        <button class="secondary-btn" type="submit">Bilgiyi güncelle</button>
      </form>
    </div>
    <div class="detail-actions">
      <button id="refreshOne" class="secondary-btn">Tam yenile</button>
      <button id="deleteHolding" class="danger-btn">Hisseyi sil</button>
    </div>
    <p class="form-note" style="margin-top:12px">Kaynak: ${esc(h.source || 'Piyasa verisi')} · Son fiyat zamanı: ${h.marketTime ? new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(new Date(h.marketTime)) : '—'}</p>
  `;
  $('#saleForm').addEventListener('submit', submitSale);
  $('#overrideForm').addEventListener('submit', submitOverride);
  $('#refreshOne').addEventListener('click', async () => {
    try {
      await service.refreshHolding(id);
      await loadPortfolio({ quiet:true });
      openDetail(id, { push:false });
      toast('Hisse verileri yenilendi.');
    } catch (error) { toast(error.message); }
  });
  $('#deleteHolding').addEventListener('click', deleteHolding);
  openSheet('#detailSheet', { holdingId:id }, { push });
}

async function submitSale(event) {
  event.preventDefault();
  const element = event.currentTarget;
  if (element.dataset.saving === 'true') return;
  element.dataset.saving = 'true';
  const button = element.querySelector('button');
  button.disabled = true;
  const operationId = element.dataset.operationId ||= crypto.randomUUID();
  const form = new FormData(event.currentTarget);
  try {
    await service.addSale(state.selected.id, {
      operationId,
      lots:Number(form.get('lots')),
      price:Number(form.get('price')),
      date:form.get('date') || todayIstanbul(),
    });
    closeSheets();
    await loadPortfolio({ quiet:true });
    await refreshBackgroundHistory({ force:true });
    toast('Satış kaydedildi.');
  } catch (error) { toast(error.message); }
  finally { element.dataset.saving = 'false'; button.disabled = false; }
}

async function submitOverride(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await service.updateHolding(state.selected.id, {
      ipoPriceOverride: form.get('ipoPriceOverride') ? Number(form.get('ipoPriceOverride')) : null,
      firstTradeDateOverride: form.get('firstTradeDateOverride') || null,
      sectorOverride: form.get('sectorOverride') || null,
    });
    const id = state.selected.id;
    await service.refreshHolding(id);
    await loadPortfolio({ quiet:true });
    openDetail(id, { push:false });
    toast('Bilgiler güncellendi.');
  } catch (error) { toast(error.message); }
}

function closeDeleteHoldingConfirm() {
  const modal = $('#deleteHoldingModal');
  if (modal) modal.hidden = true;
}

function openDeleteHoldingConfirm() {
  if (!state.selected) return;
  const modal = $('#deleteHoldingModal');
  const text = $('#deleteHoldingConfirmText');
  if (text) text.textContent = `${state.selected.ticker} portföyünden kaldırılsın mı?`;
  if (modal) modal.hidden = false;
}

async function confirmDeleteHolding() {
  const selected = state.selected;
  if (!selected) {
    closeDeleteHoldingConfirm();
    return;
  }
  const button = $('#deleteHoldingConfirm');
  if (button) button.disabled = true;
  try {
    await service.deleteHolding(selected.id);
    closeDeleteHoldingConfirm();
    closeSheets();
    state.selected = null;
    await loadPortfolio({ quiet:true });
    toast('Hisse silindi.');
  } catch (error) {
    toast(error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function deleteHolding() {
  openDeleteHoldingConfirm();
}

let lookupTimer;
let lookupGeneration = 0;
$('#tickerInput').addEventListener('input', () => {
  clearTimeout(lookupTimer);
  const generation = ++lookupGeneration;
  const ticker = $('#tickerInput').value.trim().toUpperCase();
  const preview = $('#lookupPreview');
  if (!ticker) {
    preview.hidden = true;
    preview.textContent = '';
    return;
  }
  preview.hidden = false;
  preview.textContent = 'Hisse kontrol ediliyor…';
  lookupTimer = setTimeout(async () => {
    try {
      const result = await service.lookup(ticker);
      if (generation !== lookupGeneration || $('#tickerInput').value.trim().toUpperCase() !== ticker) return;
      const current = result.market?.current;
      const ipoPurchase = $('#ipoPurchaseCheck');
      if (!ipoPurchase?.checked) {
        preview.innerHTML = `<b>${esc(result.ticker)}</b> · Güncel ${money(current)}<br>Alış fiyatı ve tarihini girerek hisseyi ekleyebilirsiniz.`;
        return;
      }
      const ipoPrice = result.ipo?.ipoPrice;
      const ipoDate = result.ipo?.firstTradeDate;
      const priceInput = $('#purchasePriceInput');
      const dateInput = $('#purchaseDateInput');
      if (ipoPrice && priceInput) priceInput.value = String(ipoPrice);
      if (ipoDate && dateInput) dateInput.value = String(ipoDate);
      preview.innerHTML = ipoPrice
        ? `<b>${esc(result.ticker)}</b> · Güncel ${money(current)}<br>Halka arz bilgisi bulundu: ${money(ipoPrice)}${ipoDate ? ` · ${trDate(ipoDate)}` : ''}`
        : `<b>${esc(result.ticker)}</b> · Güncel ${money(current)}<br>Halka arz bilgisi otomatik bulunamadı; alış bilgilerini elle girebilirsiniz.`;
    } catch (error) {
      if (generation === lookupGeneration) preview.textContent = error.message;
    }
  }, 450);
});
$('#ipoPurchaseCheck')?.addEventListener('change', () => {
  $('#tickerInput')?.dispatchEvent(new Event('input', { bubbles:true }));
});

$('#addForm').addEventListener('submit', async event => {
  event.preventDefault();
  const addForm = event.currentTarget;
  if (addForm.dataset.saving === 'true') return;
  addForm.dataset.saving = 'true';
  const btn = $('#addSubmit');
  const form = new FormData(addForm);
  const purchasePrice = Number(form.get('purchasePrice'));
  const purchaseDate = String(form.get('purchaseDate') || '');
  btn.disabled = true;
  btn.textContent = 'Ekleniyor…';
  try {
    if (!(purchasePrice > 0) || !purchaseDate) throw new Error('Alış fiyatı ve alış tarihi gerekli.');
    const result = await service.addHolding({
      ticker:form.get('ticker'),
      lots:Number(form.get('lots')),
      ipoPriceOverride: purchasePrice,
      firstTradeDateOverride: purchaseDate,
    });
    closeSheets();
    addForm.reset();
    const purchaseDateInput = $('#purchaseDateInput');
    if (purchaseDateInput) purchaseDateInput.value = todayIstanbul();
    $('#lookupPreview').hidden = true;
    await loadPortfolio({ quiet:true });
    await refreshBackgroundHistory({ force:true });
    toast(result.merged ? `${result.holding.ticker} alımı mevcut pozisyona eklendi.` : `${result.holding.ticker} hissesi eklendi.`);
  } catch (error) {
    toast(error.message);
  } finally {
    addForm.dataset.saving = 'false';
    btn.disabled = false;
    btn.textContent = 'Hisseyi ekle';
  }
});

function historyFinite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function historyCompactMoney(value) {
  const number = historyFinite(value);
  if (number == null) return '—';
  return money(number).replace(',00','');
}

function renderHistoryChartSummary(rows) {
  const usable = rows.filter(row => historyFinite(row?.value) != null && historyFinite(row?.cost) != null);
  const latest = usable[usable.length - 1] || null;
  const total = $('#historyTotalValue');
  const external = $('#historyExternalValue');
  const natural = $('#historyNaturalValue');
  if (total) total.textContent = latest ? money(latest.value) : '—';
  if (external) external.textContent = latest ? money(latest.cost) : '—';
  if (natural) {
    const growth = latest ? historyFinite(latest.value) - historyFinite(latest.cost) : null;
    natural.textContent = growth == null ? '—' : money(growth);
    natural.classList.remove('positive','negative','neutral');
    natural.classList.add(growth == null ? 'neutral' : signClass(growth));
  }
}

function historyRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function chartWindow() {
  const canvas = $('#portfolioChart');
  const rows = selectedHistoryRows();
  const rect = canvas.getBoundingClientRect();
  const compact = rect.width > 0 && rect.width < 340;
  const pad = { l:compact ? 42 : 48, r:10, t:18, b:27 };
  return { canvas, rows, rect, pad };
}

function drawChart() {
  const { canvas, rows, rect, pad } = chartWindow();
  const empty = $('#chartEmpty');
  const tooltip = $('#chartTooltip');
  state.chartRows = rows;
  renderHistoryChartSummary(rows);

  if (state.chartSelectedIndex >= rows.length) state.chartSelectedIndex = null;
  const usable = rows.filter(row => historyFinite(row?.value) != null && historyFinite(row?.cost) != null);
  if (!usable.length || rect.width <= 0 || rect.height <= 0) {
    empty.hidden = false;
    canvas.style.opacity = 0;
    tooltip.hidden = true;
    return;
  }

  empty.hidden = true;
  canvas.style.opacity = 1;
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0,0,w,h);

  const values = [];
  rows.forEach(row => {
    const value = historyFinite(row?.value);
    const cost = historyFinite(row?.cost);
    if (value != null) values.push(value);
    if (cost != null) values.push(cost);
  });
  let max = Math.max(...values, 1);
  max *= 1.14;
  const plotWidth = Math.max(1, w-pad.l-pad.r);
  const plotHeight = Math.max(1, h-pad.t-pad.b);
  const x = index => pad.l + (index / Math.max(1, rows.length-1)) * plotWidth;
  const y = value => pad.t + (max-Math.max(0,value))/max * plotHeight;
  state.chartGeometry = { x, y, pad, w, h, rect, max };

  const light = state.theme === 'light';
  const grid = light ? 'rgba(35,52,78,.10)' : 'rgba(255,255,255,.065)';
  const axisText = light ? '#69788f' : '#74839a';
  ctx.font='9px system-ui';
  ctx.textBaseline='middle';
  for (let line=0; line<=4; line += 1) {
    const ratio=line/4;
    const yy=pad.t+ratio*plotHeight;
    const tick=max*(1-ratio);
    ctx.strokeStyle=grid;
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pad.l,yy); ctx.lineTo(w-pad.r,yy); ctx.stroke();
    ctx.fillStyle=axisText;
    ctx.textAlign='right';
    const label = tick >= 1000 ? Math.round(tick/1000).toLocaleString('tr-TR') + 'K' : Math.round(tick).toLocaleString('tr-TR');
    ctx.fillText(label,pad.l-6,yy);
  }

  // Blue stepped invested-capital base.
  const firstValid = rows.findIndex(row => historyFinite(row?.cost) != null);
  if (firstValid >= 0) {
    const baseGrad = ctx.createLinearGradient(0,pad.t,0,h-pad.b);
    baseGrad.addColorStop(0, light ? 'rgba(74,132,255,.20)' : 'rgba(74,132,255,.32)');
    baseGrad.addColorStop(1, light ? 'rgba(74,132,255,.05)' : 'rgba(74,132,255,.10)');
    ctx.beginPath();
    ctx.moveTo(x(firstValid), h-pad.b);
    ctx.lineTo(x(firstValid), y(historyFinite(rows[firstValid].cost)));
    let previousCost = historyFinite(rows[firstValid].cost);
    for (let i=firstValid+1;i<rows.length;i++) {
      const cost=historyFinite(rows[i]?.cost);
      if (cost == null) continue;
      ctx.lineTo(x(i), y(previousCost));
      ctx.lineTo(x(i), y(cost));
      previousCost=cost;
    }
    const lastIndex=rows.length-1;
    ctx.lineTo(x(lastIndex),h-pad.b);
    ctx.closePath();
    ctx.fillStyle=baseGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x(firstValid),y(historyFinite(rows[firstValid].cost)));
    previousCost=historyFinite(rows[firstValid].cost);
    for(let i=firstValid+1;i<rows.length;i++){
      const cost=historyFinite(rows[i]?.cost);
      if(cost==null) continue;
      ctx.lineTo(x(i),y(previousCost));
      ctx.lineTo(x(i),y(cost));
      previousCost=cost;
    }
    ctx.strokeStyle='#4a84ff';
    ctx.lineWidth=2;
    ctx.lineJoin='round';
    ctx.stroke();
  }

  // Natural growth/loss band between invested capital and total portfolio.
  for (let i=0;i<rows.length-1;i++) {
    const aValue=historyFinite(rows[i]?.value), bValue=historyFinite(rows[i+1]?.value);
    const aCost=historyFinite(rows[i]?.cost), bCost=historyFinite(rows[i+1]?.cost);
    if ([aValue,bValue,aCost,bCost].some(value => value == null)) continue;
    const averageGrowth=((aValue-aCost)+(bValue-bCost))/2;
    ctx.beginPath();
    ctx.moveTo(x(i),y(aValue));
    ctx.lineTo(x(i+1),y(bValue));
    ctx.lineTo(x(i+1),y(bCost));
    ctx.lineTo(x(i),y(aCost));
    ctx.closePath();
    ctx.fillStyle = averageGrowth >= 0
      ? (light ? 'rgba(53,212,154,.16)' : 'rgba(53,212,154,.24)')
      : (light ? 'rgba(255,107,120,.13)' : 'rgba(255,107,120,.20)');
    ctx.fill();
  }

  // Main total-portfolio line.
  ctx.beginPath();
  let connected=false;
  rows.forEach((row,index) => {
    const value=historyFinite(row?.value);
    if(value==null){connected=false;return;}
    const xx=x(index), yy=y(value);
    connected ? ctx.lineTo(xx,yy) : ctx.moveTo(xx,yy);
    connected=true;
  });
  ctx.strokeStyle='#42e3e8';
  ctx.lineWidth=2.6;
  ctx.lineJoin='round';
  ctx.lineCap='round';
  ctx.shadowColor='rgba(66,227,232,.22)';
  ctx.shadowBlur=6;
  ctx.stroke();
  ctx.shadowBlur=0;

  // External contribution markers and labels.
  const contributionIndexes = rows
    .map((row,index) => ({ index, added:historyFinite(row?.capitalAdded) || 0 }))
    .filter(item => item.added > 0);
  const labeled = new Set(contributionIndexes.filter(item => item.index > firstValid).slice(-4).map(item => item.index));
  for (const item of contributionIndexes) {
    const cost=historyFinite(rows[item.index]?.cost);
    if(cost==null) continue;
    const xx=x(item.index), yy=y(cost);
    ctx.beginPath(); ctx.arc(xx,yy,4,0,Math.PI*2);
    ctx.fillStyle='#f7fbff'; ctx.fill();
    ctx.beginPath(); ctx.arc(xx,yy,5.8,0,Math.PI*2);
    ctx.strokeStyle='#4a84ff'; ctx.lineWidth=1.6; ctx.stroke();

    if (!labeled.has(item.index)) continue;
    const label='+'+historyCompactMoney(item.added);
    ctx.font='700 9px system-ui';
    const tw=ctx.measureText(label).width;
    const bw=tw+14, bh=20;
    let bx=xx-bw/2;
    bx=Math.max(pad.l,Math.min(w-pad.r-bw,bx));
    let by=yy-30;
    if(by<pad.t+2) by=yy+10;
    historyRoundedRect(ctx,bx,by,bw,bh,8);
    ctx.fillStyle=light ? 'rgba(238,244,255,.98)' : 'rgba(14,31,62,.96)';
    ctx.fill();
    ctx.strokeStyle=light ? 'rgba(74,132,255,.45)' : 'rgba(74,132,255,.78)';
    ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle=light ? '#325db5' : '#d8e5ff';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label,bx+bw/2,by+bh/2+.5);
  }

  ctx.fillStyle=axisText; ctx.font='9px system-ui'; ctx.textBaseline='alphabetic';
  ctx.textAlign='left';
  ctx.fillText(trDate(rows[0].date).replace(/ 20\d{2}/,''),pad.l,h-5);
  ctx.textAlign='right';
  ctx.fillText(trDate(rows[rows.length-1].date).replace(/ 20\d{2}/,''),w-pad.r,h-5);

  if (Number.isInteger(state.chartSelectedIndex) && state.chartSelectedIndex < rows.length) {
    drawChartSelection(state.chartSelectedIndex);
  }
}

function drawChartSelection(index) {
  const geometry=state.chartGeometry;
  const row=state.chartRows[index];
  const total=historyFinite(row?.value);
  const external=historyFinite(row?.cost);
  if(!geometry || !row || total==null) return;
  const canvas=$('#portfolioChart');
  const ctx=canvas.getContext('2d');
  const {x,y,pad,h}=geometry;
  const xx=x(index), yy=y(total);
  ctx.save();
  ctx.setLineDash([4,4]);
  ctx.strokeStyle=state.theme==='light'?'rgba(35,52,78,.30)':'rgba(255,255,255,.34)';
  ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(xx,pad.t); ctx.lineTo(xx,h-pad.b); ctx.stroke();
  ctx.restore();

  if(external!=null){
    ctx.beginPath(); ctx.arc(xx,y(external),3.4,0,Math.PI*2);
    ctx.fillStyle='#4a84ff'; ctx.fill();
    ctx.strokeStyle='#f7fbff'; ctx.lineWidth=1.2; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(xx,yy,4.8,0,Math.PI*2);
  ctx.fillStyle='#42e3e8'; ctx.fill();
  ctx.strokeStyle='#f7fbff'; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath(); ctx.arc(xx,yy,8.2,0,Math.PI*2);
  ctx.strokeStyle='rgba(66,227,232,.24)'; ctx.lineWidth=2; ctx.stroke();
}

function showChartPoint(clientX) {
  if (!state.chartRows.length || !state.chartGeometry) return;
  const canvasRect=$('#portfolioChart').getBoundingClientRect();
  const pad=state.chartGeometry.pad;
  const index=nearestChartIndex(clientX,{left:canvasRect.left+pad.l,right:canvasRect.right-pad.r},state.chartRows.length);
  if(index<0) return;
  state.chartSelectedIndex=index;
  drawChart();
  const row=state.chartRows[index];
  const total=historyFinite(row?.value);
  const external=historyFinite(row?.cost);
  const natural=total==null||external==null?null:total-external;
  const added=historyFinite(row?.capitalAdded)||0;
  const tooltip=$('#chartTooltip');
  tooltip.innerHTML =
    '<strong>'+trDate(row.date)+'</strong>'+
    '<span class="tooltip-total"><span>Toplam</span><b>'+money(total)+'</b></span>'+
    '<span class="tooltip-external"><span>Sermaye Girişi</span><b>'+money(external)+'</b></span>'+
    '<span class="tooltip-natural '+(natural==null?'neutral':signClass(natural))+'"><span>Değer Değişimi</span><b>'+money(natural)+'</b></span>'+
    (added>0?'<span class="tooltip-added"><span>Bu tarihte eklenen</span><b>+'+money(added)+'</b></span>':'');
  tooltip.hidden=false;
  const x=state.chartGeometry.x(index);
  const available=canvasRect.width;
  const tooltipWidth=Math.min(245,Math.max(185,available-18));
  const left=Math.max(6,Math.min(available-tooltipWidth-6,x-tooltipWidth/2));
  tooltip.style.width=tooltipWidth+'px';
  tooltip.style.left=left+'px';
}

function resetAddEntryForm() {
  lookupGeneration += 1;
  clearTimeout(lookupTimer);
  const form = $('#addForm');
  if (form) form.reset();
  const purchaseDate = $('#purchaseDateInput');
  if (purchaseDate) purchaseDate.value = todayIstanbul();
  const preview = $('#lookupPreview');
  if (preview) { preview.hidden = true; preview.textContent = ''; }
}

function openAddSheet({ push = true } = {}) {
  const addSheet = $('#addSheet');
  if (push && (window.history.state?.sheet === '#addSheet' || addSheet?.hidden === false)) {
    if (addSheet?.hidden !== false) showSheet('#addSheet');
    setTimeout(() => $('#tickerInput')?.focus(), 100);
    return;
  }
  resetAddEntryForm();
  openSheet('#addSheet', {}, { push });
  setTimeout(() => $('#tickerInput')?.focus(),100);
}

function syncKeyboardInset() {
  const viewport = window.visualViewport;
  const inset = viewport
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0;
  document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
}
window.visualViewport?.addEventListener('resize', syncKeyboardInset, { passive:true });
window.visualViewport?.addEventListener('scroll', syncKeyboardInset, { passive:true });
syncKeyboardInset();

let dockLastScrollY = Math.max(0, window.scrollY || 0);
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
document.querySelector('#bottomNav')?.classList.remove('dock-hidden');

$('#addFab').addEventListener('click', () => openAddSheet());
$('#refreshBtn').addEventListener('click', async () => {
  const btn = $('#refreshBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('spinning');
  try {
    await loadPortfolio({ quiet:true, force:true });
    await loadHomeComparison({ force:true });
    await refreshBackgroundHistory({ force:true, announce:true });
  } finally {
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
});
$('#sharePortfolioBtn')?.addEventListener('click', () => {
  const btn = $('#sharePortfolioBtn');
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;
  sharePortfolioCardImage();
});
$('#chartRange').addEventListener('change', () => { state.chartSelectedIndex = null; renderDailyHistory(); drawChart(); });
$$('[data-comparison-range]').forEach(button => button.addEventListener('click', () => {
  homeComparisonRange = comparisonRangeSessions[button.dataset.comparisonRange] ? button.dataset.comparisonRange : 'daily';
  renderHomeComparison();
}));
$('#holdingSort').value = state.sort;
$('#holdingSort').addEventListener('change', event => {
  state.sort = event.target.value;
  safeSetLocal('holdingSort', state.sort);
  if (state.portfolio) renderPortfolio(state.portfolio);
});
$$('.nav-tab').forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));
$('#themeToggle')?.addEventListener('click', () => applyTheme(nextTheme(state.theme)));
$('#notificationEnabled')?.addEventListener('change', event => { state.alertSettings.enabled = event.target.checked; persistAlertSettings(); });
$('#notificationThreshold')?.addEventListener('input', event => { state.alertSettings.threshold = Number(event.target.value); persistAlertSettings(); });
$('#requestNotificationPermission')?.addEventListener('click', () => {
  try { window.AndroidBridge?.requestNotificationPermission?.(); } catch {}
  setTimeout(renderSettings, 400);
});
$('#newsRefreshBtn')?.addEventListener('click', () => loadPopularFinanceNews({ force:true }));
$('#sheetBackdrop').addEventListener('click', () => closeSheets());
$('#deleteHoldingCancel')?.addEventListener('click', closeDeleteHoldingConfirm);
$('#deleteHoldingConfirm')?.addEventListener('click', confirmDeleteHolding);
$('#deleteHoldingModal')?.addEventListener('click', event => {
  if (event.target === event.currentTarget) closeDeleteHoldingConfirm();
});
$$('[data-close-sheet]').forEach(button => button.addEventListener('click', () => closeSheets()));
$('#portfolioChart').addEventListener('pointerdown', event => { event.preventDefault(); showChartPoint(event.clientX); });
$('#portfolioChart').addEventListener('pointermove', event => { if (event.pointerType === 'mouse') showChartPoint(event.clientX); });
window.addEventListener('resize', () => requestAnimationFrame(drawChart));
window.addEventListener('popstate', event => applyNavigationState(event.state));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    renderMarketStatus();
    if (state.view === 'portfolio' || state.view === 'holdings') { loadPortfolio({ quiet:true }); if (state.view === 'portfolio') loadHomeComparison(); }
    else if (state.view === 'markets') loadPopularFinanceNews();
    else if (state.view === 'settings') renderSettings();
  }
});

function closeWalletWidgetPromo() {
  const promo = $('#walletWidgetPromo');
  if (promo) promo.hidden = true;
  document.body.style.overflow = '';
}

window.__showWalletWidgetPromo = () => {
  const promo = $('#walletWidgetPromo');
  if (!promo) return false;
  promo.hidden = false;
  document.body.style.overflow = 'hidden';
  return true;
};

$('#walletWidgetPromoClose')?.addEventListener('click', closeWalletWidgetPromo);
$('#walletWidgetPromoLater')?.addEventListener('click', closeWalletWidgetPromo);
$('#walletWidgetPromoAdd')?.addEventListener('click', () => {
  closeWalletWidgetPromo();
  try { window.AndroidBridge?.requestWalletWidgetPin?.(); }
  catch { toast('Widget ekleme ekranı açılamadı.'); }
});

window.__showBackExitHint = () => toast('Çıkmak için tekrar geri basın.');

if (!window.history.state?.appRoot) window.history.replaceState(createRootNavigationState('portfolio'), '', `${location.pathname}${location.search}`);
else if (!Number.isFinite(Number(window.history.state?.navDepth)) || Number(window.history.state.navDepth) < 0) window.history.replaceState(createRootNavigationState(window.history.state?.view || 'portfolio'), '', location.href);
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.hostname !== 'app.local') navigator.serviceWorker.register('./sw.js').catch(()=>{});

initTheme();
applyNavigationState(window.history.state);
renderMarketStatus();
loadPortfolio();
loadHomeComparison();
setTimeout(() => refreshBackgroundHistory(), 900);
let closedQuoteTick = 0;
setInterval(() => {
  if (document.hidden) return;
  if (state.view !== 'portfolio' && state.view !== 'holdings') return;
  const market = getBistMarketStatus(new Date());
  if (market.isOpen) loadPortfolio({ quiet:true });
  else { closedQuoteTick += 1; if (closedQuoteTick % 4 === 0) loadPortfolio({ quiet:true }); }
}, 15_000);
setInterval(() => { if (!document.hidden) renderMarketStatus(); }, 30_000);
restoreFinanceNewsCache();
setTimeout(() => { loadPopularFinanceNews(); }, 0);
setInterval(() => {
  if (!document.hidden) loadPopularFinanceNews({ force:true });
}, FINANCE_NEWS_BACKGROUND_REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const stale = !popularFinanceNewsItems.length || Date.now() - popularFinanceNewsFetchedAt >= NEWS_REFRESH_TTL_MS;
  if (stale) loadPopularFinanceNews({ force:true });
});


/* TEST_NEWS_NOTIFICATION_ROUTE_V1 */
const __previousHandlePushRoute = window.__handlePushRoute;
window.__handlePushRoute = route => {
  const kind = String(route?.kind || '');
  if (kind === 'news_breaking' || kind === 'news_digest') {
    switchView('markets');
    return true;
  }
  return __previousHandlePushRoute?.(route);
};
