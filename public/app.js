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
import { createPremiumDemoController } from './premium-demo.js';

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
const premiumDemo = createPremiumDemoController({
  storage:globalThis.localStorage,
  demo:true,
  loadCalendar:() => ipoService.getCalendar(),
  loadIpoDetail:item => ipoService.getDetail(item),
  loadPortfolioData:() => repository.load(),
  savePortfolio:data => repository.save(data),
  showToast:message => toast(message),
  showLocalNotification:payload => {
    try { return Boolean(window.AndroidBridge?.showLocalNotification?.(JSON.stringify(payload))); }
    catch { return false; }
  },
});

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
  portfolio: { title:'Portföyüm' },
  calendar: { title:'Halka Arz Takvimi' },
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
  const root = $('#proContent');
  if (!root) return;
  if (premiumDemo.enabled) {
    premiumDemo.render(root, {
      portfolio:state.portfolio,
      history:Array.isArray(state.portfolio?.history) ? state.portfolio.history : state.chartRows,
      calendar:state.calendar,
      selectedTicker,
    });
    return;
  }
  state.proAccess = proAccess.getState();
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
    switchView('calendar');
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

function switchView(view, { push = true, selectedTicker = null } = {}) {
  const next = VIEW_META[view] ? view : 'portfolio';
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
  if ($('#addFab')) $('#addFab').hidden = next !== 'portfolio';
  if ($('#refreshBtn')) $('#refreshBtn').hidden = next !== 'portfolio';
  if (next === 'calendar') loadIpoCalendar();
  if (next === 'portfolio') requestAnimationFrame(drawChart);
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

function renderPortfolio(data) {
  const t = data.totals;
  setMetric('#totalWealth', money(t.totalWealth));
  const totalBadge = $('#totalProfitBadge');
  totalBadge.textContent = `${money(t.totalProfit)} · ${pct(t.totalProfitPct)}`;
  totalBadge.className = `pill ${signClass(t.totalProfit)}`;
  setMetric('#dailyProfit', money(t.dailyProfit), signClass(t.dailyProfit));
  setMetric('#dailyPct', pct(t.dailyPct), signClass(t.dailyPct));
  setMetric('#invested', money(t.invested));
  setMetric('#activeValue', money(t.activeValue));
  setMetric('#salesProceeds', money(t.salesProceeds));
  $('#lastUpdated').textContent = marketDataText(data);
  $('#lastUpdated').title = 'Fiyat kaynağı gecikmeli olabilir; bu saat gerçek piyasa verisinin zaman damgasıdır.';
  $('#holdingCount').textContent = `${data.holdings.length} hisse`;

  const list = $('#holdings');
  list.innerHTML = '';
  $('#emptyState').hidden = data.holdings.length > 0;
  for (const holding of sortHoldings(data.holdings, state.sort)) list.appendChild(renderHolding(holding));

  renderSectorAllocation(data.holdings);
  renderDailyHistory();
  drawChart();
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
  $('.ipo-price',node).textContent = `Arz: ${money(h.ipoPrice)}`;
  $('.trade-date',node).textContent = h.firstTradeDate ? `İlk işlem: ${trDate(h.firstTradeDate)}` : 'İlk işlem tarihi: —';
  $('.holding-main',node).addEventListener('click', () => openDetail(h.id));
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
  $('#sheetBackdrop').hidden = true;
  $$('.sheet').forEach(sheet => { sheet.hidden = true; });
  document.body.style.overflow = '';
}

function showSheet(id) {
  hideSheets();
  $('#sheetBackdrop').hidden = false;
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
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
      <div class="detail-tile"><span>Halka arz fiyatı</span><strong>${money(h.ipoPrice)}</strong></div>
      <div class="detail-tile"><span>Bugünkü kazanç</span><strong class="${signClass(h.dailyProfit)}">${money(h.dailyProfit)} · ${pct(h.dailyPct)}</strong></div>
      <div class="detail-tile"><span>Toplam kazanç</span><strong class="${signClass(h.totalProfit)}">${money(h.totalProfit)} · ${pct(h.totalProfitPct)}</strong></div>
      <div class="detail-tile"><span>Başlangıç yatırım</span><strong>${money(h.invested)}</strong></div>
      <div class="detail-tile"><span>Güncel değer</span><strong>${money(h.activeValue)}</strong></div>
      <div class="detail-tile"><span>Gerçekleşen net kâr</span><strong class="${signClass(h.realizedProfit)}">${money(h.realizedProfit)}</strong></div>
      ${Number(h.withholdingTax || 0) > 0 ? `<div class="detail-tile"><span>Stopaj (%17,5)</span><strong class="negative">-${money(h.withholdingTax)}</strong></div>` : ''}
      <div class="detail-tile"><span>Sektör</span><strong>${esc(h.sector || '—')}</strong></div>
    </div>
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
        <input name="ipoPriceOverride" type="number" min="0.01" step="0.01" value="${h.ipoPrice ?? ''}" placeholder="Halka arz fiyatı">
        <input name="firstTradeDateOverride" type="date" value="${h.firstTradeDate ?? ''}">
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

async function deleteHolding() {
  if (!confirm(`${state.selected.ticker} portföyden silinsin mi?`)) return;
  try {
    await service.deleteHolding(state.selected.id);
    closeSheets();
    state.selected = null;
    await loadPortfolio({ quiet:true });
    toast('Hisse silindi.');
  } catch (error) { toast(error.message); }
}

let lookupTimer;
let lookupGeneration = 0;
$('#tickerInput').addEventListener('input', event => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  clearTimeout(lookupTimer);
  const generation = ++lookupGeneration;
  const ticker = event.target.value.trim();
  const preview = $('#lookupPreview');
  if (ticker.length < 3) { preview.hidden = true; return; }
  lookupTimer = setTimeout(async () => {
    preview.hidden = false;
    preview.textContent = 'Bilgiler aranıyor…';
    try {
      const result = await service.lookup(ticker);
      if (generation !== lookupGeneration || $('#tickerInput').value.trim() !== ticker) return;
      const ipoPrice = result.ipo?.ipoPrice;
      const current = result.market?.current;
      preview.innerHTML = `<b>${esc(result.ticker)}</b> · Güncel ${money(current)}<br>${ipoPrice ? `Halka arz ${money(ipoPrice)}${result.ipo.firstTradeDate ? ` · İlk işlem ${trDate(result.ipo.firstTradeDate)}` : ''}` : 'Halka arz fiyatı otomatik bulunamadı; ekledikten sonra düzeltebilirsiniz.'}`;
    } catch (error) { if (generation === lookupGeneration) preview.textContent = error.message; }
  }, 450);
});

$('#addForm').addEventListener('submit', async event => {
  event.preventDefault();
  const addForm = event.currentTarget;
  if (addForm.dataset.saving === 'true') return;
  addForm.dataset.saving = 'true';
  const btn = $('#addSubmit');
  const form = new FormData(addForm);
  btn.disabled = true;
  btn.textContent = 'Bulunuyor…';
  try {
    const result = await service.addHolding({ ticker:form.get('ticker'), lots:Number(form.get('lots')) });
    closeSheets();
    addForm.reset();
    $('#lookupPreview').hidden = true;
    await loadPortfolio({ quiet:true });
    toast(result.autoIpoFound ? `${result.holding.ticker} eklendi.` : `${result.holding.ticker} eklendi; halka arz bilgisi kontrol edin.`);
  } catch (error) { toast(error.message); }
  finally { addForm.dataset.saving = 'false'; btn.disabled = false; btn.textContent = 'Otomatik bul ve ekle'; }
});

function chartWindow() {
  const canvas = $('#portfolioChart');
  const rows = selectedHistoryRows();
  const rect = canvas.getBoundingClientRect();
  const pad = { l:12, r:12, t:18, b:24 };
  return { canvas, rows, rect, pad };
}

function drawChart() {
  const { canvas, rows, rect, pad } = chartWindow();
  const empty = $('#chartEmpty');
  const tooltip = $('#chartTooltip');
  state.chartRows = rows;
  if (!rows.length || rect.width <= 0 || rect.height <= 0) {
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

  const values = rows.filter(row => Number.isFinite(row.value)).map(row => row.value);
  if (!values.length) { empty.hidden=false; empty.textContent='Geçmiş verisi eksik';canvas.style.opacity=0;tooltip.hidden=true;return; }
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= Math.max(1,min*.01); max += Math.max(1,max*.01); }
  const extra = (max-min) * .12;
  min -= extra; max += extra;
  const plotWidth = w-pad.l-pad.r;
  const plotHeight = h-pad.t-pad.b;
  const x = index => pad.l + (index / Math.max(1, rows.length-1)) * plotWidth;
  const y = value => pad.t + (max-value)/(max-min) * plotHeight;
  state.chartGeometry = { x, y, pad, w, h, rect };

  ctx.strokeStyle = state.theme === 'light' ? 'rgba(35,52,78,.10)' : 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  for (let line=0; line<3; line += 1) {
    const yy = pad.t + (line/2)*plotHeight;
    ctx.beginPath(); ctx.moveTo(pad.l,yy); ctx.lineTo(w-pad.r,yy); ctx.stroke();
  }

  const last = rows[rows.length - 1];
  const positive = Number(last?.profit) >= 0;
  const stroke = positive ? '#35d49a' : '#ff6b78';
  const grad = ctx.createLinearGradient(0,pad.t,0,h-pad.b);
  grad.addColorStop(0, positive ? 'rgba(53,212,154,.26)' : 'rgba(255,107,120,.24)');
  grad.addColorStop(1,'rgba(0,0,0,0)');

  ctx.beginPath();
  let connected = false;
  rows.forEach((row,index) => { if (!Number.isFinite(row.value)) { connected=false;return; } const xx=x(index), yy=y(row.value); connected ? ctx.lineTo(xx,yy) : ctx.moveTo(xx,yy);connected=true; });
  ctx.lineTo(x(rows.length-1),h-pad.b); ctx.lineTo(x(0),h-pad.b); ctx.closePath();
  ctx.fillStyle = grad; if (rows.every(row => Number.isFinite(row.value))) ctx.fill();

  ctx.beginPath();
  connected = false;
  rows.forEach((row,index) => { if (!Number.isFinite(row.value)) { connected=false;return; } const xx=x(index), yy=y(row.value); connected ? ctx.lineTo(xx,yy) : ctx.moveTo(xx,yy);connected=true; });
  ctx.strokeStyle = stroke; ctx.lineWidth = 2.3; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();

  ctx.fillStyle = state.theme === 'light' ? '#66758c' : '#758198'; ctx.font='10px system-ui';
  ctx.textAlign='left'; ctx.fillText(trDate(rows[0].date).replace(/ 20\d{2}/,''),pad.l,h-5);
  ctx.textAlign='right'; ctx.fillText(trDate(rows[rows.length - 1].date).replace(/ 20\d{2}/,''),w-pad.r,h-5);
  ctx.textAlign='left'; ctx.fillText(money(max).replace(',00',''),pad.l,pad.t-5);

  if (Number.isInteger(state.chartSelectedIndex) && state.chartSelectedIndex < rows.length) {
    drawChartSelection(state.chartSelectedIndex);
  }
}

function drawChartSelection(index) {
  const geometry = state.chartGeometry;
  const row = state.chartRows[index];
  if (!geometry || !row || !Number.isFinite(row.value)) return;
  const canvas = $('#portfolioChart');
  const ctx = canvas.getContext('2d');
  const { x, y, pad, h } = geometry;
  const xx = x(index), yy = y(row.value);
  ctx.strokeStyle = state.theme === 'light' ? 'rgba(35,52,78,.28)' : 'rgba(255,255,255,.30)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(xx,pad.t); ctx.lineTo(xx,h-pad.b); ctx.stroke();
  ctx.beginPath(); ctx.arc(xx,yy,4.5,0,Math.PI*2); ctx.fillStyle = state.theme === 'light' ? '#17233a' : '#f8fafc'; ctx.fill();
  ctx.beginPath(); ctx.arc(xx,yy,7.5,0,Math.PI*2); ctx.strokeStyle = state.theme === 'light' ? 'rgba(23,35,58,.18)' : 'rgba(248,250,252,.22)'; ctx.stroke();
}

function showChartPoint(clientX) {
  if (!state.chartRows.length || !state.chartGeometry) return;
  const canvasRect = $('#portfolioChart').getBoundingClientRect();
  const pad = state.chartGeometry.pad;
  const index = nearestChartIndex(clientX, { left:canvasRect.left+pad.l, right:canvasRect.right-pad.r }, state.chartRows.length);
  if (index < 0) return;
  state.chartSelectedIndex = index;
  drawChart();
  const row = state.chartRows[index];
  const tooltip = $('#chartTooltip');
  tooltip.innerHTML = `<strong>${trDate(row.date)}</strong><span>Portföy ${money(row.value)}</span><span class="${signClass(row.profit)}">Toplam ${money(row.profit)} · ${pct(row.profitPct)}</span><span class="${signClass(row.dailyProfit)}">Günlük ${money(row.dailyProfit)} · ${pct(row.dailyPct)}</span>`;
  tooltip.hidden = false;
  const x = state.chartGeometry.x(index);
  const available = canvasRect.width;
  const tooltipWidth = Math.min(230, Math.max(170, available - 20));
  const left = Math.max(8, Math.min(available-tooltipWidth-8, x-tooltipWidth/2));
  tooltip.style.width = `${tooltipWidth}px`;
  tooltip.style.left = `${left}px`;
}

function resetAddEntryForm() {
  lookupGeneration += 1;
  clearTimeout(lookupTimer);
  const form = $('#addForm');
  if (form) form.reset();
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
window.addEventListener('scroll', scheduleDockVisibilityUpdate, { passive:true });

$('#addFab').addEventListener('click', () => openAddSheet());
$('#refreshBtn').addEventListener('click', async () => {
  const btn = $('#refreshBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('spinning');
  try {
    await loadPortfolio({ quiet:true, force:true });
    await refreshBackgroundHistory({ force:true, announce:true });
  } finally {
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
});
$('#chartRange').addEventListener('change', () => { state.chartSelectedIndex = null; renderDailyHistory(); drawChart(); });
$('#holdingSort').value = state.sort;
$('#holdingSort').addEventListener('change', event => {
  state.sort = event.target.value;
  safeSetLocal('holdingSort', state.sort);
  if (state.portfolio) renderPortfolio(state.portfolio);
});
const portfolioTab = $('#portfolioTab');
const calendarTab = $('#calendarTab');
const proTab = $('#proTab');
const settingsTab = $('#settingsTab');
[portfolioTab, calendarTab, proTab, settingsTab].filter(Boolean).forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));
$('#themeToggle')?.addEventListener('click', () => applyTheme(nextTheme(state.theme)));
$('#notificationEnabled')?.addEventListener('change', event => { state.alertSettings.enabled = event.target.checked; persistAlertSettings(); });
$('#notificationThreshold')?.addEventListener('input', event => { state.alertSettings.threshold = Number(event.target.value); persistAlertSettings(); });
$('#requestNotificationPermission')?.addEventListener('click', () => {
  try { window.AndroidBridge?.requestNotificationPermission?.(); } catch {}
  setTimeout(renderSettings, 400);
});
$('#calendarRefreshBtn').addEventListener('click', () => loadIpoCalendar({ force:true }));
$('#calendarFilter').addEventListener('change', () => renderIpoCalendar());
$('#sheetBackdrop').addEventListener('click', () => closeSheets());
$$('[data-close-sheet]').forEach(button => button.addEventListener('click', () => closeSheets()));
$('#portfolioChart').addEventListener('pointerdown', event => { event.preventDefault(); showChartPoint(event.clientX); });
$('#portfolioChart').addEventListener('pointermove', event => { if (event.pointerType === 'mouse') showChartPoint(event.clientX); });
window.addEventListener('resize', () => requestAnimationFrame(drawChart));
window.addEventListener('popstate', event => applyNavigationState(event.state));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    renderMarketStatus();
    if (state.view === 'portfolio') loadPortfolio({ quiet:true });
    else if (state.view === 'calendar') loadIpoCalendar();
    else if (state.view === 'settings') renderSettings();
  }
});

window.__showBackExitHint = () => toast('Çıkmak için tekrar geri basın.');

if (!window.history.state?.appRoot) window.history.replaceState(createRootNavigationState('portfolio'), '', `${location.pathname}${location.search}`);
else if (!Number.isFinite(Number(window.history.state?.navDepth)) || Number(window.history.state.navDepth) < 0) window.history.replaceState(createRootNavigationState(window.history.state?.view || 'portfolio'), '', location.href);
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.hostname !== 'app.local') navigator.serviceWorker.register('./sw.js').catch(()=>{});

initTheme();
applyNavigationState(window.history.state);
renderMarketStatus();
loadPortfolio();
setTimeout(() => refreshBackgroundHistory(), 900);
let closedQuoteTick = 0;
setInterval(() => {
  if (document.hidden) return;
  if (state.view !== 'portfolio') return;
  const market = getBistMarketStatus(new Date());
  if (market.isOpen) loadPortfolio({ quiet:true });
  else { closedQuoteTick += 1; if (closedQuoteTick % 4 === 0) loadPortfolio({ quiet:true }); }
}, 15_000);
setInterval(() => { if (!document.hidden) renderMarketStatus(); }, 30_000);
setInterval(() => { if (!document.hidden && state.view === 'calendar') loadIpoCalendar({ force:true }); }, 300_000);
