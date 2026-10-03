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
// Code42: Labs'tan üretime taşınan haber akışı ve yedekleme modülleri.
import {
  NEWS_CATEGORIES, NEWS_SOURCES, resolveEnabledSources, parseRssFeed, mergeNewsItems, chooseFeaturedNews,
  buildHoldingMatchers, matchNewsToHoldings, filterNews, normalizeHttpsUrl,
} from './core/news-feed.js';
import { createBackupPayload, parseBackupText, BACKUP_SETTINGS_KEYS } from './core/labs-backup.js';

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
  if (typeof renderThemeChoice === 'function') renderThemeChoice();
}

// "Sistem" teması. Android WebView prefers-color-scheme değerini
// uygulama temasından aldığı için gerçek cihaz ayarı native köprüden okunur.
function systemPrefersDark() {
  try {
    const native = window.AndroidBridge?.isSystemDarkMode?.();
    if (typeof native === 'boolean') return native;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
}

function themePreference() {
  const saved = safeGetLocal('themePreference');
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

function applyThemePreference(preference) {
  const value = preference === 'light' || preference === 'dark' ? preference : 'system';
  safeSetLocal('themePreference', value);
  applyTheme(resolveTheme(value, systemPrefersDark()), { persist:false });
}

function initTheme() {
  applyTheme(resolveTheme(themePreference(), systemPrefersDark()), { persist:false });
  window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
    if (themePreference() === 'system') applyTheme(resolveTheme('system', systemPrefersDark()), { persist:false });
  });
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

// ---------------------------------------------------------------------------
// Ayarlar ekranı. Anahtar adları Labs ile aynıdır; Labs yedekleri geri yüklenebilir.
// ---------------------------------------------------------------------------
const PRIVACY_KEY = 'labs_privacy_mode_v1';
const LAST_BACKUP_KEY = 'labs_last_backup_at_v1';
const SETTINGS_STAMP_FMT = new Intl.DateTimeFormat('tr-TR', { timeZone:'Europe/Istanbul', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
const NOTIFICATION_CHANNEL_NAMES = Object.freeze({
  market:'Borsa hareketleri', portfolio:'Portföy artışları', portfolioFall:'Portföy düşüşleri', ceiling:'Tavan',
  floor:'Taban', ipo:'Yeni halka arzlar', newsBreaking:'Son dakika haberleri', newsDigest:'Haber özetleri',
});
const BACKGROUND_OUTCOME_TEXT = Object.freeze({
  running:'Kontrol sürüyor', waiting_quotes:'Bazı hisselerin fiyatı bekleniyor', channel_blocked:'Bildirim kanalı kapalı',
  permission_blocked:'Bildirim izni kapalı', no_config:'Ayarlar henüz aktarılmadı', no_holdings:'Takip edilecek aktif hisse yok',
  disabled:'Portföy bildirimleri kapalı', error:'Son kontrol tamamlanamadı', checked:'Son kontrol tamamlandı',
});

function settingsStamp(value) {
  const stamp = Number(value);
  return stamp > 0 ? SETTINGS_STAMP_FMT.format(new Date(stamp)) : '—';
}

function renderThemeChoice() {
  const current = themePreference();
  $$('[data-theme-choice]').forEach(button => {
    const active = button.dataset.themeChoice === current;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
}

function applyPrivacyMode(enabled, { persist = true } = {}) {
  const on = Boolean(enabled);
  document.documentElement.classList.toggle('labs-privacy', on);
  if (persist) safeSetLocal(PRIVACY_KEY, on ? '1' : '0');
  const toggle = $('#privacyModeToggle');
  if (toggle) toggle.checked = on;
  const quick = $('#privacyQuickToggle');
  if (quick) {
    const label = on ? 'Tutarları göster' : 'Tutarları gizle';
    quick.setAttribute('aria-pressed', String(on));
    quick.setAttribute('aria-label', label);
    quick.title = label;
  }
}

function readNotificationStatus() {
  try {
    const raw = window.AndroidBridge?.getNotificationStatus?.();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function renderNotificationDiagnostics(status = readNotificationStatus()) {
  const root = $('#notificationDiagnostics');
  if (!root) return;
  if (!status) {
    root.innerHTML = '<div><dt>Durum</dt><dd>Tanılama yalnız Android uygulamasında kullanılabilir.</dd></div>';
    return;
  }
  const channels = status.channels && typeof status.channels === 'object' ? status.channels : {};
  const blocked = Object.entries(channels).filter(([, value]) => value && value.enabled === false).map(([key]) => NOTIFICATION_CHANNEL_NAMES[key] || key);
  const background = status.background || {};
  const newsTest = status.newsTest || {};
  const nextDigest = [newsTest.nextMorningTargetAt, newsTest.nextEveningTargetAt].map(Number).filter(value => value > Date.now()).sort((a, b) => a - b)[0];
  const rows = [
    ['Bildirim izni', status.permissionGranted === false ? 'Kapalı' : 'Verildi'],
    ['Uygulama bildirimleri', status.notificationsEnabled === false ? 'Android ayarlarında kapalı' : 'Açık'],
    ['Kapalı kanallar', blocked.length ? blocked.join(', ') : 'Yok'],
    ['Portföy kontrolü', (BACKGROUND_OUTCOME_TEXT[background.outcome] || 'Bekleniyor') + (Number(background.checkedAt) > 0 ? ' · ' + settingsStamp(background.checkedAt) : '')],
    ['Haber kontrolü', newsTest.lastError ? 'Hata · ' + String(newsTest.lastError).slice(0, 80) : (Number(newsTest.lastSuccessAt) > 0 ? 'Başarılı · ' + settingsStamp(newsTest.lastSuccessAt) : 'Bekleniyor')],
    ['Sonraki haber özeti', nextDigest ? settingsStamp(nextDigest) : '—'],
  ];
  root.innerHTML = rows.map(([label, value]) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>').join('');
}

function renderNewsSourceSettings() {
  const root = $('#newsSourceSettings');
  if (!root) return;
  root.innerHTML = NEWS_SOURCES.map(source => {
    const on = news.sources[source.id] !== false;
    const status = news.sourceStatus[source.id];
    let detail = 'Henüz yüklenmedi';
    let cls = '';
    if (!on) detail = source.defaultEnabled ? 'Kapalı' : 'Kapalı · finans dışı haber oranı yüksek';
    else if (status?.ok) detail = status.count + ' haber · ' + settingsStamp(status.at);
    else if (status && status.ok === false) { detail = 'Ulaşılamadı (' + status.error + ') · ' + settingsStamp(status.at); cls = ' class="negative"'; }
    return '<div class="labs-setting-row labs-source-row">' +
      '<div><strong>' + esc(source.name) + '</strong><span' + cls + '>' + esc(detail) + '</span></div>' +
      '<label class="switch" aria-label="' + esc(source.name) + ' kaynağını aç veya kapat"><input type="checkbox" data-news-source="' + esc(source.id) + '"' + (on ? ' checked' : '') + ' /><span></span></label>' +
    '</div>';
  }).join('');
}

function renderBackupSummary() {
  const summary = $('#backupSummary');
  if (!summary) return;
  const count = (state.portfolio?.holdings || []).length;
  const last = Number(safeGetLocal(LAST_BACKUP_KEY) || 0);
  summary.textContent = (count ? count + ' hisse bu cihazda saklanıyor' : 'Portföyünüz yalnızca bu cihazda saklanır') +
    ' · ' + (last > 0 ? 'Son yedek ' + settingsStamp(last) : 'Henüz yedek alınmadı');
}

function appInfo() {
  try { return JSON.parse(window.AndroidBridge?.getAppInfo?.() || 'null'); } catch { return null; }
}

function renderAppInfo() {
  const element = $('#appVersion');
  if (!element) return;
  const info = appInfo();
  const version = info?.versionName || '2.5.9';
  const build = info?.versionCode || 43;
  element.innerHTML = 'Hisse Portföyüm<br />v' + esc(version) + ' • Build ' + esc(build);
}

function renderSettings() {
  const settings = normalizeAlertSettings(state.alertSettings);
  state.alertSettings = settings;
  const enabled = $('#notificationEnabled');
  const threshold = $('#notificationThreshold');
  const value = $('#notificationThresholdValue');
  if (enabled) enabled.checked = settings.enabled;
  if (threshold) {
    if (document.activeElement !== threshold) threshold.value = String(settings.threshold);
    threshold.disabled = !settings.enabled;
  }
  if (value) value.textContent = `%${String(settings.threshold).replace('.', ',')}`;
  $('#notificationThresholdBlock')?.classList.toggle('is-disabled', !settings.enabled);

  const permission = readNativeNotificationPermission();
  const banner = $('#notificationPermissionBanner');
  if (banner) banner.hidden = !(permission === 'prompt' || permission === 'denied');
  const permissionEl = $('#notificationPermissionStatus');
  if (permissionEl) {
    permissionEl.textContent = permission === 'denied'
      ? 'İzin Android ayarlarından verilmeli.'
      : 'Bildirim alabilmek için izin vermeniz gerekiyor.';
  }
  const permissionButton = $('#requestNotificationPermission');
  if (permissionButton) permissionButton.textContent = permission === 'denied' ? 'Ayarları aç' : 'İzin ver';

  const settingsButton = $('#notificationSettingsButton');
  if (settingsButton) settingsButton.hidden = typeof window.AndroidBridge?.openNotificationSettings !== 'function';

  renderThemeChoice();
  applyPrivacyMode(safeGetLocal(PRIVACY_KEY) === '1', { persist:false });
  renderNotificationDiagnostics();
  renderNewsSourceSettings();
  renderBackupSummary();
  renderAppInfo();
}

function persistAlertSettings({ sync = true } = {}) {
  state.alertSettings = normalizeAlertSettings(state.alertSettings);
  safeSetLocal('alertEnabled', String(state.alertSettings.enabled));
  safeSetLocal('alertThreshold', String(state.alertSettings.threshold));
  renderSettings();
  if (sync) syncPushConfiguration();
}

// ---- Yedekleme ----
function backupFileName() {
  return 'portfoy-yedek-' + todayIstanbul() + '.json';
}

function markBackupDone() {
  safeSetLocal(LAST_BACKUP_KEY, String(Date.now()));
  renderBackupSummary();
}

async function buildBackupJson() {
  const portfolio = await repository.load();
  const settings = {};
  for (const key of BACKUP_SETTINGS_KEYS) {
    const value = safeGetLocal(key);
    if (value != null) settings[key] = value;
  }
  const payload = createBackupPayload({ portfolio, settings, appVersion:appInfo()?.versionName || '2.5.9' });
  return { json:JSON.stringify(payload, null, 2), count:payload.portfolio.holdings.length };
}

async function exportBackup(mode) {
  try {
    const { json, count } = await buildBackupJson();
    if (!count) { toast('Yedeklenecek hisse yok.'); return; }
    const bridge = window.AndroidBridge;
    if (mode === 'share' && typeof bridge?.shareBackup === 'function') {
      if (bridge.shareBackup(json, backupFileName())) markBackupDone();
      else toast('Yedek hazırlanamadı.');
      return;
    }
    if (mode === 'save' && typeof bridge?.saveBackupFile === 'function') {
      if (!bridge.saveBackupFile(json, backupFileName())) toast('Yedek hazırlanamadı.');
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([json], { type:'application/json' }));
    link.download = backupFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    markBackupDone();
  } catch (error) {
    toast(error?.message || 'Yedek oluşturulamadı.');
  }
}

let labsConfirmResolver = null;

function confirmLabs({ eyebrow = 'ONAY', title, text, okText = 'Tamam' }) {
  const modal = $('#labsConfirmModal');
  if (!modal) return Promise.resolve(window.confirm(text));
  $('#labsConfirmEyebrow').textContent = eyebrow;
  $('#labsConfirmTitle').textContent = title;
  $('#labsConfirmText').textContent = text;
  $('#labsConfirmOk').textContent = okText;
  modal.hidden = false;
  return new Promise(resolve => { labsConfirmResolver = resolve; });
}

function closeLabsConfirm(result) {
  const modal = $('#labsConfirmModal');
  if (modal) modal.hidden = true;
  const resolve = labsConfirmResolver;
  labsConfirmResolver = null;
  resolve?.(result);
}

async function restoreBackupFromText(text) {
  let parsed;
  try {
    parsed = parseBackupText(text);
  } catch (error) {
    toast(error.message);
    return;
  }
  const current = await repository.load();
  const date = parsed.exportedAt ? ' (' + settingsStamp(Date.parse(parsed.exportedAt)) + ')' : '';
  const ok = await confirmLabs({
    eyebrow:'YEDEK',
    title:'Yedekten geri yükle',
    text:parsed.portfolio.holdings.length + ' hisselik yedek' + date + ' yüklenecek. Bu cihazdaki mevcut portföy (' +
      current.holdings.length + ' hisse) yedekteki verilerle değiştirilecek.',
    okText:'Geri yükle',
  });
  if (!ok) return;
  try {
    await repository.save(parsed.portfolio);
    for (const [key, value] of Object.entries(parsed.settings)) safeSetLocal(key, value);
    toast('Yedek geri yüklendi. Uygulama yenileniyor…');
    setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    toast(error?.message || 'Yedek geri yüklenemedi.');
  }
}

function startBackupRestore() {
  const bridge = window.AndroidBridge;
  if (typeof bridge?.pickBackupFile === 'function') {
    bridge.pickBackupFile();
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json,text/plain';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (file) restoreBackupFromText(await file.text());
  }, { once:true });
  input.click();
}

window.__labsBackupPicked = text => { restoreBackupFromText(text); };
window.__labsBackupPickFailed = message => { if (message) toast(message); };
window.__labsBackupSaved = () => { markBackupDone(); toast('Yedek dosyası kaydedildi.'); };
window.__labsBackupSaveFailed = message => { if (message) toast(message); };

function clearLabsCaches() {
  const exact = new Set(['finance_news_cache_v3', NEWS_CACHE_KEY, 'halka_arz_calendar_cache_v3']);
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && (exact.has(key) || key.startsWith('halka_arz_detail_cache_v1_'))) localStorage.removeItem(key);
    }
  } catch {}
  news.items = [];
  news.fetchedAt = 0;
  news.sourceStatus = {};
  state.calendar = null;
  state.calendarLoaded = false;
  renderNewsSourceSettings();
  toast('Önbellek temizlendi. Portföyünüz ve ayarlarınız korunur.');
  loadNews({ force:true });
}

function bindSettingsUi() {
  $$('[data-theme-choice]').forEach(button => button.addEventListener('click', () => applyThemePreference(button.dataset.themeChoice)));
  $('#privacyModeToggle')?.addEventListener('change', event => applyPrivacyMode(event.target.checked));
  $('#privacyQuickToggle')?.addEventListener('click', () => {
    const next = !document.documentElement.classList.contains('labs-privacy');
    applyPrivacyMode(next);
    toast(next ? 'Tutarlar gizlendi.' : 'Tutarlar gösteriliyor.');
  });
  $('#notificationSettingsButton')?.addEventListener('click', () => {
    try { window.AndroidBridge?.openNotificationSettings?.(); } catch {}
  });
  $('.labs-diagnostics')?.addEventListener('toggle', () => renderNotificationDiagnostics());
  $('#newsSourceSettings')?.addEventListener('change', event => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const id = input?.dataset.newsSource;
    if (!id) return;
    news.sources = { ...news.sources, [id]:input.checked };
    safeSetLocal(NEWS_SOURCES_KEY, JSON.stringify(news.sources));
    news.visible = NEWS_PAGE_SIZE;
    if (input.checked) loadNews({ force:true });
    else renderNews();
    renderNewsSourceSettings();
  });
  $('#backupSaveBtn')?.addEventListener('click', () => exportBackup('save'));
  $('#backupShareBtn')?.addEventListener('click', () => exportBackup('share'));
  $('#backupRestoreBtn')?.addEventListener('click', startBackupRestore);
  $('#cacheClearBtn')?.addEventListener('click', clearLabsCaches);
  $('#labsConfirmCancel')?.addEventListener('click', () => closeLabsConfirm(false));
  $('#labsConfirmOk')?.addEventListener('click', () => closeLabsConfirm(true));
  $('#labsConfirmModal')?.addEventListener('click', event => { if (event.target === event.currentTarget) closeLabsConfirm(false); });
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

// ---------------------------------------------------------------------------
// Çok kaynaklı finans haberleri (Bloomberg HT, AA, TRT, CNN Türk…)
// RSS akışları native köprü üzerinden çekilir, cihazda birleştirilir ve
// önbelleğe alınır. Makaleler uygulama penceresinde değil, Custom Tab'de açılır.
// ---------------------------------------------------------------------------
const NEWS_CACHE_KEY = 'labs_news_cache_v1';
const NEWS_SAVED_KEY = 'labs_news_saved_v1';
const NEWS_READ_KEY = 'labs_news_read_v1';
const NEWS_FILTER_KEY = 'labs_news_filter_v1';
const NEWS_SOURCES_KEY = 'labs_news_sources_v1';
const NEWS_STALE_MS = 10 * 60 * 1000;
const NEWS_BACKGROUND_REFRESH_MS = 5 * 60 * 1000;
const NEWS_CACHE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const NEWS_PAGE_SIZE = 20;
const NEWS_SAVED_LIMIT = 100;
const NEWS_READ_LIMIT = 500;
const NEWS_CATEGORY_SYMBOLS = Object.freeze({
  borsa:'BIST', sirketler:'AŞ', doviz:'$ ₺ €', altin:'◆', ekonomi:'₺', 'halka-arz':'IPO',
});
const NEWS_FILTERS = Object.freeze([
  { id:'all', label:'Tümü' },
  { id:'portfolio', label:'Portföyüm' },
  ...Object.entries(NEWS_CATEGORIES).map(([id, label]) => ({ id, label })),
  { id:'saved', label:'Kaydedilenler' },
]);
const FINANCE_NEWS_CLOCK_FMT = new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'});
const FINANCE_NEWS_DAY_FMT = new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'numeric',month:'short'});
const FINANCE_NEWS_DAY_KEY_FMT = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'});
const BOOKMARK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4Z"/></svg>';

const news = {
  items:[],
  fetchedAt:0,
  sourceStatus:{},
  promise:null,
  error:'',
  filter:NEWS_FILTERS.some(item => item.id === safeGetLocal(NEWS_FILTER_KEY)) ? safeGetLocal(NEWS_FILTER_KEY) : 'all',
  query:'',
  visible:NEWS_PAGE_SIZE,
  saved:loadSavedNews(),
  read:loadReadNews(),
  sources:resolveEnabledSources(safeParseLocalJson(NEWS_SOURCES_KEY)),
  matcherKey:null,
  matchers:[],
};

function isValidNewsItem(item) {
  return Boolean(item && typeof item.id === 'string' && typeof item.title === 'string' && normalizeHttpsUrl(item.url));
}

function loadSavedNews() {
  const list = safeParseLocalJson(NEWS_SAVED_KEY);
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) if (isValidNewsItem(item)) map.set(item.id, item);
  return map;
}

function persistSavedNews() {
  safeSetLocal(NEWS_SAVED_KEY, JSON.stringify([...news.saved.values()].slice(-NEWS_SAVED_LIMIT)));
}

function loadReadNews() {
  const list = safeParseLocalJson(NEWS_READ_KEY);
  return new Set(Array.isArray(list) ? list.filter(id => typeof id === 'string').slice(-NEWS_READ_LIMIT) : []);
}

function persistReadNews() {
  safeSetLocal(NEWS_READ_KEY, JSON.stringify([...news.read].slice(-NEWS_READ_LIMIT)));
}

function persistNewsCache() {
  safeSetLocal(NEWS_CACHE_KEY, JSON.stringify({
    fetchedAt:news.fetchedAt,
    items:news.items.slice(0, 160),
    sourceStatus:news.sourceStatus,
  }));
}

function restoreNewsCache() {
  const cached = safeParseLocalJson(NEWS_CACHE_KEY);
  const fetchedAt = Number(cached?.fetchedAt || 0);
  if (!Array.isArray(cached?.items) || !Number.isFinite(fetchedAt)) return false;
  if (Date.now() - fetchedAt > NEWS_CACHE_MAX_AGE_MS) return false;
  news.items = cached.items.filter(isValidNewsItem);
  news.fetchedAt = fetchedAt;
  news.sourceStatus = cached.sourceStatus && typeof cached.sourceStatus === 'object' ? cached.sourceStatus : {};
  return news.items.length > 0;
}

function parseFinanceNewsDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw + '+03:00';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatFinanceNewsTime(iso) {
  const date = parseFinanceNewsDate(iso);
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Şimdi';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Şimdi';
  if (minutes < 60) return minutes + ' dk önce';
  const todayKey = FINANCE_NEWS_DAY_KEY_FMT.format(now);
  const dateKey = FINANCE_NEWS_DAY_KEY_FMT.format(date);
  const yesterdayKey = FINANCE_NEWS_DAY_KEY_FMT.format(new Date(now.getTime() - 86_400_000));
  if (dateKey === todayKey) return Math.floor(minutes / 60) + ' sa önce';
  const clock = FINANCE_NEWS_CLOCK_FMT.format(date);
  if (dateKey === yesterdayKey) return 'Dün ' + clock;
  return FINANCE_NEWS_DAY_FMT.format(date) + ' ' + clock;
}

function newsArtClass(category) {
  return 'news-art-' + (NEWS_CATEGORIES[category] ? category : 'ekonomi');
}

function newsCategoryClass(category) {
  return 'news-cat-' + (NEWS_CATEGORIES[category] ? category : 'ekonomi');
}

function newsSourceInitial(source) {
  const cleaned = String(source || 'Finans').trim();
  return cleaned ? cleaned.charAt(0).toLocaleUpperCase('tr-TR') : 'F';
}

function newsHoldingMatchers() {
  const holdings = (state.portfolio?.holdings || []).filter(item => Number(item.currentLots || 0) > 0);
  const key = holdings.map(item => item.ticker + ':' + (item.company || '')).join('|');
  if (key !== news.matcherKey) {
    news.matcherKey = key;
    news.matchers = buildHoldingMatchers(holdings);
  }
  return news.matchers;
}

function newsPoolFor(filter) {
  if (filter !== 'saved') return news.items;
  // Kaydedilen haberler akıştan düşse bile listede kalır.
  const byId = new Map(news.items.map(item => [item.id, item]));
  for (const item of news.saved.values()) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) =>
    (parseFinanceNewsDate(b.publishedAt)?.getTime() || 0) - (parseFinanceNewsDate(a.publishedAt)?.getTime() || 0));
}

function newsFilterOptions(category, matchers) {
  return {
    category,
    query:category === news.filter ? news.query : '',
    sources:category === 'saved' ? null : news.sources,
    holdingMatchers:matchers,
    savedIds:new Set(news.saved.keys()),
  };
}

function renderNewsFilters(matchers) {
  const root = $('#newsFilters');
  if (!root) return;
  root.innerHTML = NEWS_FILTERS.map(filter => {
    const count = filterNews(newsPoolFor(filter.id), { ...newsFilterOptions(filter.id, matchers), query:'' }).length;
    const active = news.filter === filter.id;
    const muted = count === 0 && !['all', 'portfolio', 'saved'].includes(filter.id);
    return '<button type="button" role="tab" class="labs-chip' + (active ? ' active' : '') + (muted ? ' muted' : '') +
      (filter.id === 'portfolio' ? ' labs-chip-portfolio' : '') + '" data-news-filter="' + esc(filter.id) + '" aria-selected="' + active + '">' +
      esc(filter.label) + '<span>' + count + '</span></button>';
  }).join('');
  const active = $('.labs-chip.active', root);
  if (active && !root.dataset.scrolled) {
    root.dataset.scrolled = '1';
    active.scrollIntoView({ block:'nearest', inline:'center' });
  }
}

function newsTickersHtml(item, matchers) {
  const tickers = matchNewsToHoldings(item, matchers);
  return tickers.length ? '<span class="labs-news-tickers">' + tickers.map(ticker => '<b>' + esc(ticker) + '</b>').join('') + '</span>' : '';
}

function newsSaveButtonHtml(item) {
  const saved = news.saved.has(item.id);
  return '<button class="labs-news-save' + (saved ? ' saved' : '') + '" type="button" data-news-save="' + esc(item.id) + '" aria-pressed="' + saved +
    '" aria-label="' + (saved ? 'Kaydedilenlerden çıkar' : 'Haberi kaydet') + '">' + BOOKMARK_ICON + '</button>';
}

function newsTimeHtml(item) {
  const text = formatFinanceNewsTime(item.publishedAt);
  return text ? '<span class="news-time" data-news-time="' + esc(item.publishedAt || '') + '">' + esc(text) + '</span>' : '';
}

function featuredNewsHtml(item, matchers) {
  const category = NEWS_CATEGORIES[item.category] || 'Ekonomi';
  const symbol = NEWS_CATEGORY_SYMBOLS[item.category] || '₺';
  return '<article class="news-feature-card labs-news-card' + (news.read.has(item.id) ? ' is-read' : '') + '" data-news-id="' + esc(item.id) + '">' +
    '<a class="news-source-link" href="' + esc(item.url) + '" data-news-open="' + esc(item.id) + '" rel="noopener noreferrer">' +
      '<div class="news-feature-art ' + newsArtClass(item.category) + '">' +
        (item.imageUrl ? '<img class="news-feature-image" src="' + esc(item.imageUrl) + '" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true" />' : '') +
        '<span class="news-art-grid"></span>' +
        '<span class="news-art-symbol">' + esc(symbol) + '</span>' +
        '<span class="news-category-chip ' + newsCategoryClass(item.category) + '">' + esc(category) + '</span>' +
      '</div>' +
      '<div class="news-feature-body">' +
        '<div class="news-feature-meta"><span class="news-source"><span class="news-source-dot">' + esc(newsSourceInitial(item.source)) + '</span>' + esc(item.source || 'Finans') + '</span>' + newsTimeHtml(item) + '</div>' +
        '<h3 class="news-feature-title">' + esc(item.title) + '</h3>' +
        newsTickersHtml(item, matchers) +
      '</div>' +
    '</a>' +
    newsSaveButtonHtml(item) +
  '</article>';
}

function newsListItemHtml(item, matchers) {
  const category = NEWS_CATEGORIES[item.category] || 'Ekonomi';
  const symbol = NEWS_CATEGORY_SYMBOLS[item.category] || '₺';
  return '<article class="labs-news-item' + (news.read.has(item.id) ? ' is-read' : '') + '" data-news-id="' + esc(item.id) + '">' +
    '<a class="news-latest-item labs-news-link" href="' + esc(item.url) + '" data-news-open="' + esc(item.id) + '" rel="noopener noreferrer">' +
      '<span class="news-latest-thumb ' + newsArtClass(item.category) + '">' +
        '<span>' + esc(symbol) + '</span>' +
        (item.imageUrl ? '<img class="news-latest-image" src="' + esc(item.imageUrl) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true" />' : '') +
      '</span>' +
      '<span class="news-latest-copy">' +
        '<span class="news-latest-meta"><span class="news-latest-category ' + newsCategoryClass(item.category) + '">' + esc(category) + '</span><span>' + esc(item.source || 'Finans') + '</span>' + newsTimeHtml(item) + '</span>' +
        '<h4>' + esc(item.title) + '</h4>' +
        newsTickersHtml(item, matchers) +
      '</span>' +
    '</a>' +
    newsSaveButtonHtml(item) +
  '</article>';
}

function newsEmptyHtml(matchers) {
  if (news.query) {
    return '<div class="finance-news-empty">“' + esc(news.query) + '” için haber bulunamadı.</div>';
  }
  if (news.filter === 'portfolio') {
    if (!matchers.length) return '<div class="finance-news-empty">Portföyünüze hisse eklediğinizde, bu şirketlerle ilgili haberler burada listelenir.</div>';
    return '<div class="finance-news-empty">Şu an portföyünüzdeki şirketlerle ilgili haber yok.<br><small>Takip edilen: ' +
      matchers.map(item => esc(item.ticker)).join(', ') + '</small></div>';
  }
  if (news.filter === 'saved') {
    return '<div class="finance-news-empty">Kaydettiğiniz haberler burada görünür. Kaydetmek için haberin yanındaki işarete dokunun.</div>';
  }
  if (!NEWS_SOURCES.some(source => news.sources[source.id])) {
    return '<div class="finance-news-empty">Tüm haber kaynakları kapalı.<br><button class="secondary-btn compact-btn" type="button" data-news-goto-settings>Kaynakları aç</button></div>';
  }
  if (news.promise) {
    return Array.from({ length:4 }, () => '<div class="labs-news-skeleton"><span></span><div><i></i><i></i><i></i></div></div>').join('');
  }
  if (!news.items.length) {
    return '<div class="finance-news-empty">' + esc(news.error || 'Haberler şu anda alınamadı.') +
      '<br><button class="secondary-btn compact-btn" type="button" data-news-retry>Tekrar dene</button></div>';
  }
  return '<div class="finance-news-empty">Bu kategoride şu an haber yok.</div>';
}

function renderNewsStatus() {
  const status = $('#newsStatus');
  const button = $('#newsRefreshBtn');
  if (button) {
    button.classList.toggle('spinning', Boolean(news.promise));
    button.disabled = Boolean(news.promise);
  }
  if (!status) return;
  const enabled = NEWS_SOURCES.filter(source => news.sources[source.id]);
  if (news.promise) { status.textContent = news.items.length ? 'Yenileniyor…' : 'Haberler yükleniyor…'; return; }
  if (!news.fetchedAt) { status.textContent = news.error || (enabled.length ? 'Haberler yükleniyor…' : 'Haber kaynağı seçilmedi'); return; }
  const failed = enabled.filter(source => news.sourceStatus[source.id] && news.sourceStatus[source.id].ok === false);
  let text = FINANCE_NEWS_CLOCK_FMT.format(new Date(news.fetchedAt)) + ' güncellendi · ' + (enabled.length - failed.length) + ' kaynak';
  if (failed.length) text += ' · ' + failed.length + ' kaynağa ulaşılamadı';
  if (Date.now() - news.fetchedAt > NEWS_STALE_MS * 3) text = 'Önbellekten · ' + text;
  status.textContent = text;
}

function renderNews() {
  const list = $('#latestNewsList');
  if (!list) return;
  const matchers = newsHoldingMatchers();
  renderNewsFilters(matchers);
  renderNewsStatus();

  const filtered = filterNews(newsPoolFor(news.filter), newsFilterOptions(news.filter, matchers));
  const showFeatured = news.filter === 'all' && !news.query && filtered.length > 6;
  const featured = showFeatured ? chooseFeaturedNews(filtered, 5) : [];
  const featuredSection = $('#newsFeaturedSection');
  const rail = $('#popularNewsRail');
  const dots = $('#popularNewsDots');
  if (featuredSection) featuredSection.hidden = featured.length === 0;
  if (rail) {
    rail.innerHTML = featured.map(item => featuredNewsHtml(item, matchers)).join('');
    rail.scrollLeft = 0;
  }
  if (dots) dots.innerHTML = featured.map((_, index) => '<span class="popular-news-dot' + (index === 0 ? ' active' : '') + '"></span>').join('');

  const featuredIds = new Set(featured.map(item => item.id));
  const rest = filtered.filter(item => !featuredIds.has(item.id));
  const filterLabel = NEWS_FILTERS.find(item => item.id === news.filter)?.label || 'Tümü';
  const title = $('#newsListTitle');
  if (title) title.textContent = news.query ? 'Arama sonuçları' : news.filter === 'all' ? 'Son Haberler' : filterLabel;
  const count = $('#newsListCount');
  if (count) count.textContent = rest.length ? rest.length + ' haber' : '';

  list.innerHTML = rest.length
    ? rest.slice(0, news.visible).map(item => newsListItemHtml(item, matchers)).join('')
    : newsEmptyHtml(matchers);
  const more = $('#newsLoadMore');
  if (more) {
    const remaining = rest.length - news.visible;
    more.hidden = remaining <= 0;
    more.textContent = 'Daha fazla göster (' + Math.max(0, remaining) + ')';
  }
}

function refreshNewsTimes() {
  $$('[data-news-time]').forEach(element => {
    const text = formatFinanceNewsTime(element.dataset.newsTime);
    if (text && element.textContent !== text) element.textContent = text;
  });
}

function shortNewsError(error) {
  const message = String(error?.message || error || 'Ağ hatası');
  if (/zaman aşımı|timeout/i.test(message)) return 'zaman aşımı';
  if (/HTTP \d+/.test(message)) return message.match(/HTTP \d+/)[0];
  if (/izin verilmiyor/i.test(message)) return 'izinli değil';
  return 'bağlantı hatası';
}

async function fetchNewsSource(source) {
  const items = parseRssFeed(await httpGetText(source.url), source);
  if (!items.length) throw new Error('Akış boş döndü');
  return items;
}

function loadNews({ force = false } = {}) {
  if (!force && news.items.length && Date.now() - news.fetchedAt < NEWS_STALE_MS) {
    renderNews();
    return Promise.resolve(news.items);
  }
  if (news.promise) return news.promise;
  const enabled = NEWS_SOURCES.filter(source => news.sources[source.id]);
  if (!enabled.length) {
    renderNews();
    return Promise.resolve(news.items);
  }
  const previous = news.items;
  const task = Promise.allSettled(enabled.map(fetchNewsSource))
    .then(results => {
      const at = Date.now();
      const lists = [];
      let succeeded = 0;
      results.forEach((result, index) => {
        const source = enabled[index];
        if (result.status === 'fulfilled') {
          succeeded += 1;
          lists.push(result.value);
          news.sourceStatus[source.id] = { ok:true, count:result.value.length, at };
        } else {
          // Ulaşılamayan kaynağın son başarılı haberleri listede kalır.
          lists.push(previous.filter(item => item.sourceId === source.id));
          news.sourceStatus[source.id] = { ok:false, error:shortNewsError(result.reason), at };
        }
      });
      if (succeeded > 0) {
        news.items = mergeNewsItems(lists);
        news.fetchedAt = at;
        news.error = '';
        persistNewsCache();
      } else {
        news.error = 'Haberler şu anda alınamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
        if (state.view === 'markets' && previous.length) toast('Haberler yenilenemedi; son kayıtlı haberler gösteriliyor.');
      }
      return news.items;
    })
    .finally(() => {
      if (news.promise === task) news.promise = null;
      renderNews();
      if (state.view === 'settings') renderNewsSourceSettings();
    });
  news.promise = task;
  renderNews();
  return task;
}

function onNewsViewShown() {
  renderNews();
  if (!news.items.length || Date.now() - news.fetchedAt >= NEWS_STALE_MS) loadNews({ force:true });
}

function openExternalUrl(url) {
  const safe = normalizeHttpsUrl(url);
  if (!safe) return;
  try {
    if (typeof window.AndroidBridge?.openExternalUrl === 'function') {
      window.AndroidBridge.openExternalUrl(safe);
      return;
    }
  } catch {}
  window.open(safe, '_blank', 'noopener,noreferrer');
}

function findNewsItem(id) {
  return news.items.find(item => item.id === id) || news.saved.get(id) || null;
}

function openNewsItem(id) {
  const item = findNewsItem(id);
  if (!item) return;
  news.read.add(item.id);
  persistReadNews();
  $$('[data-news-id]').forEach(element => {
    if (element.dataset.newsId === item.id) element.classList.add('is-read');
  });
  openExternalUrl(item.url);
}

function toggleSavedNews(id) {
  const item = findNewsItem(id);
  if (!item) return;
  if (news.saved.has(item.id)) {
    news.saved.delete(item.id);
    toast('Kaydedilenlerden çıkarıldı.');
  } else {
    news.saved.set(item.id, item);
    toast('Haber kaydedildi.');
  }
  persistSavedNews();
  renderNews();
}

function setNewsFilter(filter) {
  if (!NEWS_FILTERS.some(item => item.id === filter)) return;
  news.filter = filter;
  news.visible = NEWS_PAGE_SIZE;
  safeSetLocal(NEWS_FILTER_KEY, filter);
  renderNews();
  $('#newsFilters [data-news-filter="' + filter + '"]')?.scrollIntoView({ block:'nearest', inline:'center', behavior:'smooth' });
}

function bindNewsUi() {
  const view = $('#marketsView');
  if (!view || view.dataset.newsBound) return;
  view.dataset.newsBound = '1';
  view.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const save = target.closest('[data-news-save]');
    if (save) { event.preventDefault(); toggleSavedNews(save.dataset.newsSave); return; }
    const open = target.closest('[data-news-open]');
    if (open) { event.preventDefault(); openNewsItem(open.dataset.newsOpen); return; }
    const filter = target.closest('[data-news-filter]');
    if (filter) { setNewsFilter(filter.dataset.newsFilter); return; }
    if (target.closest('[data-news-retry]')) { loadNews({ force:true }); return; }
    if (target.closest('[data-news-goto-settings]')) switchView('settings');
  });
  $('#newsRefreshBtn')?.addEventListener('click', () => loadNews({ force:true }));
  $('#newsLoadMore')?.addEventListener('click', () => { news.visible += NEWS_PAGE_SIZE; renderNews(); });

  const search = $('#newsSearch');
  const clear = $('#newsSearchClear');
  let searchTimer = null;
  search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    if (clear) clear.hidden = !search.value;
    searchTimer = setTimeout(() => {
      news.query = search.value.trim();
      news.visible = NEWS_PAGE_SIZE;
      renderNews();
    }, 180);
  });
  search?.addEventListener('keydown', event => { if (event.key === 'Enter') search.blur(); });
  clear?.addEventListener('click', () => {
    if (search) search.value = '';
    clear.hidden = true;
    news.query = '';
    renderNews();
  });

  const rail = $('#popularNewsRail');
  rail?.addEventListener('scroll', () => {
    const cards = $$('.news-feature-card', rail);
    if (!cards.length) return;
    const cardWidth = cards[0].getBoundingClientRect().width + 12;
    const index = Math.max(0, Math.min(cards.length - 1, Math.round(rail.scrollLeft / Math.max(1, cardWidth))));
    $$('.popular-news-dot', $('#popularNewsDots')).forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index));
  }, { passive:true });
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
  if (next === 'markets') onNewsViewShown();
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
// Kaydırırken yalnız etiket güncellenir; kayıt ve senkronizasyon bırakınca yapılır.
$('#notificationThreshold')?.addEventListener('input', event => {
  const preview = normalizeAlertSettings({ ...state.alertSettings, threshold:Number(event.target.value) });
  const value = $('#notificationThresholdValue');
  if (value) value.textContent = `%${String(preview.threshold).replace('.', ',')}`;
});
$('#notificationThreshold')?.addEventListener('change', event => { state.alertSettings.threshold = Number(event.target.value); persistAlertSettings(); });
$('#requestNotificationPermission')?.addEventListener('click', () => {
  try { window.AndroidBridge?.requestNotificationPermission?.(); } catch {}
  setTimeout(renderSettings, 400);
});
bindNewsUi();
bindSettingsUi();
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
    else if (state.view === 'markets') onNewsViewShown();
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
applyPrivacyMode(safeGetLocal(PRIVACY_KEY) === '1', { persist:false });
restoreNewsCache();
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
// Haberler açılışta önbellekten gösterilir; ağ yenilemesi yalnız
// önbellek bayatsa yapılır. Arka planda yalnız Haberler ekranı açıkken yenilenir.
setTimeout(() => {
  if (!news.items.length || Date.now() - news.fetchedAt >= NEWS_STALE_MS) loadNews();
}, 2500);
setInterval(() => {
  if (document.hidden || state.view !== 'markets') return;
  refreshNewsTimes();
  if (Date.now() - news.fetchedAt >= NEWS_BACKGROUND_REFRESH_MS) loadNews({ force:true });
}, 60_000);


/* TEST_NEWS_NOTIFICATION_ROUTE_V1: haber bildirimi haberler ekranını açar; bildirimde haber adresi varsa haberi de açar */
const __previousHandlePushRoute = window.__handlePushRoute;
window.__handlePushRoute = route => {
  const kind = String(route?.kind || '');
  if (kind === 'news_breaking' || kind === 'news_digest') {
    switchView('markets');
    const newsUrl = normalizeHttpsUrl(route?.newsUrl);
    if (newsUrl) setTimeout(() => openExternalUrl(newsUrl), 300);
    return true;
  }
  return __previousHandlePushRoute?.(route);
};
