import { createRepository, createPlatformStorage } from './core/repository.js';
import { httpGetJson, httpGetText } from './core/http.js';
import { createDataSources } from './core/data-sources.js';
import { createPortfolioService } from './core/portfolio-service.js';
import { getBistMarketStatus } from './core/market-calendar.js';
import { sortHoldings, sectorBreakdown, nearestChartIndex } from './core/analytics.js';

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

const state = {
  portfolio: null,
  selected: null,
  chartRows: [],
  chartGeometry: null,
  chartSelectedIndex: null,
  sort: safeGetLocal('holdingSort') || 'dailyProfit',
  historyRefreshStarted: false,
};

const fmtTRY = new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtPct = new Intl.NumberFormat('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2, signDisplay:'always' });
const fmtNum = new Intl.NumberFormat('tr-TR', { maximumFractionDigits:2 });
const sessionFmt = new Intl.DateTimeFormat('tr-TR', { timeZone:'Europe/Istanbul', weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
const timeFmt = new Intl.DateTimeFormat('tr-TR', { timeZone:'Europe/Istanbul', hour:'2-digit', minute:'2-digit' });

function safeGetLocal(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSetLocal(key, value) { try { localStorage.setItem(key, value); } catch {} }
function money(v) { return Number.isFinite(Number(v)) ? fmtTRY.format(Number(v)) : '—'; }
function pct(v) { return Number.isFinite(Number(v)) ? `${fmtPct.format(Number(v))}%` : '—'; }
function signClass(v) { return Number(v) > 0 ? 'positive' : Number(v) < 0 ? 'negative' : 'neutral'; }
function esc(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function trDate(iso) { if (!iso) return '—'; const d = new Date(`${iso}T12:00:00+03:00`); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Istanbul'}).format(d); }
function timeAgo(iso) { if (!iso) return '—'; const sec = Math.max(0,(Date.now()-new Date(iso).getTime())/1000); if(sec<60)return'şimdi'; if(sec<3600)return`${Math.floor(sec/60)} dk önce`; return timeFmt.format(new Date(iso)); }
function todayIstanbul() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }

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

async function loadPortfolio({ quiet = false, force = false } = {}) {
  const btn = $('#refreshBtn');
  if (!quiet) btn.classList.add('spinning');
  try {
    const cached = await service.getPortfolio({ refresh:false });
    state.portfolio = cached;
    renderPortfolio(cached);

    const fresh = await service.getPortfolio({ refresh:true, force });
    state.portfolio = fresh;
    renderPortfolio(fresh);
    return fresh;
  } catch (error) {
    toast(error.message);
    return state.portfolio;
  } finally {
    btn.classList.remove('spinning');
  }
}

async function refreshBackgroundHistory({ force = false, announce = false } = {}) {
  if (state.historyRefreshStarted && !force) return;
  state.historyRefreshStarted = true;
  try {
    const data = await service.refreshHistory({ force });
    state.portfolio = data;
    renderPortfolio(data);
    if (state.selected) state.selected = data.holdings.find(h => h.id === state.selected.id) || null;
    if (announce) toast('Geçmiş ve sektör verileri güncellendi.');
  } catch (error) {
    if (announce) toast(error.message);
  }
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
  $('#lastUpdated').textContent = timeAgo(data.updatedAt);
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
    legend.innerHTML = '<div class="sector-empty">Sektör bilgileri arka planda bir kez yüklenir. Gerekirse hisse detayından elle düzeltebilirsiniz.</div>';
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
  return days <= 0 ? history : history.slice(-days);
}

function renderDailyHistory() {
  const el = $('#dailyHistory');
  const rows = selectedHistoryRows().slice().reverse();
  if (!rows.length) {
    el.innerHTML = '<div class="analytics-empty">Geçmiş fiyat verisi yüklendiğinde gün gün değişim burada görünecek.</div>';
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
    window.history.pushState({ appRoot:true, sheet:id, ...navigation }, '', hash);
  }
}

function closeSheets({ useHistory = true } = {}) {
  hideSheets();
  if (useHistory && window.history.state?.sheet) window.history.back();
}

function applyNavigationState(nav) {
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
      <div class="detail-tile"><span>Gerçekleşen kâr</span><strong class="${signClass(h.realizedProfit)}">${money(h.realizedProfit)}</strong></div>
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
      <h3>Otomatik bilgi yanlışsa düzelt</h3>
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
  const form = new FormData(event.currentTarget);
  try {
    await service.addSale(state.selected.id, {
      lots:Number(form.get('lots')),
      price:Number(form.get('price')),
      date:form.get('date') || todayIstanbul(),
    });
    closeSheets();
    await loadPortfolio({ quiet:true });
    await refreshBackgroundHistory({ force:true });
    toast('Satış kaydedildi.');
  } catch (error) { toast(error.message); }
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
$('#tickerInput').addEventListener('input', event => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  clearTimeout(lookupTimer);
  const ticker = event.target.value.trim();
  const preview = $('#lookupPreview');
  if (ticker.length < 3) { preview.hidden = true; return; }
  lookupTimer = setTimeout(async () => {
    preview.hidden = false;
    preview.textContent = 'Bilgiler aranıyor…';
    try {
      const result = await service.lookup(ticker);
      const ipoPrice = result.ipo?.ipoPrice;
      const current = result.market?.current;
      preview.innerHTML = `<b>${esc(result.ticker)}</b> · Güncel ${money(current)}<br>${ipoPrice ? `Halka arz ${money(ipoPrice)}${result.ipo.firstTradeDate ? ` · İlk işlem ${trDate(result.ipo.firstTradeDate)}` : ''}` : 'Halka arz fiyatı otomatik bulunamadı; ekledikten sonra düzeltebilirsiniz.'}`;
    } catch (error) { preview.textContent = error.message; }
  }, 450);
});

$('#addForm').addEventListener('submit', async event => {
  event.preventDefault();
  const addForm = event.currentTarget;
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
  finally { btn.disabled = false; btn.textContent = 'Otomatik bul ve ekle'; }
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

  const values = rows.map(row => Number(row.value));
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= Math.max(1,min*.01); max += Math.max(1,max*.01); }
  const extra = (max-min) * .12;
  min -= extra; max += extra;
  const plotWidth = w-pad.l-pad.r;
  const plotHeight = h-pad.t-pad.b;
  const x = index => pad.l + (index / Math.max(1, rows.length-1)) * plotWidth;
  const y = value => pad.t + (max-value)/(max-min) * plotHeight;
  state.chartGeometry = { x, y, pad, w, h, rect };

  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  for (let line=0; line<3; line += 1) {
    const yy = pad.t + (line/2)*plotHeight;
    ctx.beginPath(); ctx.moveTo(pad.l,yy); ctx.lineTo(w-pad.r,yy); ctx.stroke();
  }

  const last = rows.at(-1);
  const positive = Number(last?.profit) >= 0;
  const stroke = positive ? '#35d49a' : '#ff6b78';
  const grad = ctx.createLinearGradient(0,pad.t,0,h-pad.b);
  grad.addColorStop(0, positive ? 'rgba(53,212,154,.26)' : 'rgba(255,107,120,.24)');
  grad.addColorStop(1,'rgba(0,0,0,0)');

  ctx.beginPath();
  rows.forEach((row,index) => { const xx=x(index), yy=y(row.value); index ? ctx.lineTo(xx,yy) : ctx.moveTo(xx,yy); });
  ctx.lineTo(x(rows.length-1),h-pad.b); ctx.lineTo(x(0),h-pad.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  rows.forEach((row,index) => { const xx=x(index), yy=y(row.value); index ? ctx.lineTo(xx,yy) : ctx.moveTo(xx,yy); });
  ctx.strokeStyle = stroke; ctx.lineWidth = 2.3; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();

  ctx.fillStyle='#758198'; ctx.font='10px system-ui';
  ctx.textAlign='left'; ctx.fillText(trDate(rows[0].date).replace(/ 20\d{2}/,''),pad.l,h-5);
  ctx.textAlign='right'; ctx.fillText(trDate(rows.at(-1).date).replace(/ 20\d{2}/,''),w-pad.r,h-5);
  ctx.textAlign='left'; ctx.fillText(money(max).replace(',00',''),pad.l,pad.t-5);

  if (Number.isInteger(state.chartSelectedIndex) && state.chartSelectedIndex < rows.length) {
    drawChartSelection(state.chartSelectedIndex);
  }
}

function drawChartSelection(index) {
  const geometry = state.chartGeometry;
  const row = state.chartRows[index];
  if (!geometry || !row) return;
  const canvas = $('#portfolioChart');
  const ctx = canvas.getContext('2d');
  const { x, y, pad, h } = geometry;
  const xx = x(index), yy = y(row.value);
  ctx.strokeStyle='rgba(255,255,255,.30)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(xx,pad.t); ctx.lineTo(xx,h-pad.b); ctx.stroke();
  ctx.beginPath(); ctx.arc(xx,yy,4.5,0,Math.PI*2); ctx.fillStyle='#f8fafc'; ctx.fill();
  ctx.beginPath(); ctx.arc(xx,yy,7.5,0,Math.PI*2); ctx.strokeStyle='rgba(248,250,252,.22)'; ctx.stroke();
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
  clearTimeout(lookupTimer);
  const form = $('#addForm');
  if (form) form.reset();
  const preview = $('#lookupPreview');
  if (preview) { preview.hidden = true; preview.textContent = ''; }
}

function openAddSheet({ push = true } = {}) {
  resetAddEntryForm();
  openSheet('#addSheet', {}, { push });
  setTimeout(() => $('#tickerInput').focus(),100);
}

$('#addFab').addEventListener('click', () => openAddSheet());
$('#refreshBtn').addEventListener('click', async () => {
  await loadPortfolio({ force:true });
  await refreshBackgroundHistory({ force:true, announce:true });
});
$('#chartRange').addEventListener('change', () => { state.chartSelectedIndex = null; renderDailyHistory(); drawChart(); });
$('#holdingSort').value = state.sort;
$('#holdingSort').addEventListener('change', event => {
  state.sort = event.target.value;
  safeSetLocal('holdingSort', state.sort);
  if (state.portfolio) renderPortfolio(state.portfolio);
});
$('#sheetBackdrop').addEventListener('click', () => closeSheets());
$$('[data-close-sheet]').forEach(button => button.addEventListener('click', () => closeSheets()));
$('#portfolioChart').addEventListener('pointerdown', event => { event.preventDefault(); showChartPoint(event.clientX); });
$('#portfolioChart').addEventListener('pointermove', event => { if (event.pointerType === 'mouse') showChartPoint(event.clientX); });
window.addEventListener('resize', () => requestAnimationFrame(drawChart));
window.addEventListener('popstate', event => applyNavigationState(event.state));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    renderMarketStatus();
    loadPortfolio({ quiet:true });
  }
});

window.__showBackExitHint = () => toast('Çıkmak için tekrar geri basın.');

if (!window.history.state?.appRoot) window.history.replaceState({ appRoot:true }, '', `${location.pathname}${location.search}`);
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.hostname !== 'app.local') navigator.serviceWorker.register('./sw.js').catch(()=>{});

renderMarketStatus();
loadPortfolio();
setTimeout(() => refreshBackgroundHistory(), 900);
setInterval(() => { if (!document.hidden) loadPortfolio({ quiet:true }); }, 60_000);
setInterval(renderMarketStatus, 30_000);
