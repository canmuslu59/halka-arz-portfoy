import { createRepository, createPlatformStorage } from './core/repository.js';
import { httpGetJson, httpGetText } from './core/http.js';
import { createDataSources } from './core/data-sources.js';
import { createPortfolioService } from './core/portfolio-service.js';

const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];

const repository = createRepository(createPlatformStorage());
const sources = createDataSources({ getJson: httpGetJson, getText: httpGetText });
const service = createPortfolioService({ repository, getMarket: sources.getMarket, getIpo: sources.getIpo });
const state = { portfolio: null, selected: null };
const fmtTRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
const fmtNum = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

function money(v) { return Number.isFinite(Number(v)) ? fmtTRY.format(Number(v)) : '—'; }
function pct(v) { return Number.isFinite(Number(v)) ? `${fmtPct.format(Number(v))}%` : '—'; }
function signClass(v) { return Number(v) > 0 ? 'positive' : Number(v) < 0 ? 'negative' : 'neutral'; }
function esc(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function trDate(iso) { if (!iso) return '—'; const d = new Date(`${iso}T12:00:00`); return isNaN(d) ? iso : new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',year:'numeric'}).format(d); }
function timeAgo(iso) { if (!iso) return '—'; const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); if (sec < 60) return 'şimdi'; if (sec < 3600) return `${Math.floor(sec/60)} dk önce`; return new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit'}).format(new Date(iso)); }

function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2800);
}

function setMetric(id, value, cls = null) {
  const el = $(id); el.textContent = value;
  el.classList.remove('positive','negative','neutral'); if (cls) el.classList.add(cls);
}

async function loadPortfolio({ quiet = false, force = false } = {}) {
  const btn = $('#refreshBtn');
  if (!quiet) btn.classList.add('spinning');
  try {
    const cached = await service.getPortfolio({ refresh: false });
    state.portfolio = cached;
    renderPortfolio(cached);
    const data = await service.getPortfolio({ refresh: true, force });
    state.portfolio = data;
    renderPortfolio(data);
  } catch (e) {
    toast(e.message);
  } finally {
    btn.classList.remove('spinning');
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

  const list = $('#holdings'); list.innerHTML = '';
  $('#emptyState').hidden = data.holdings.length > 0;
  for (const h of data.holdings) list.appendChild(renderHolding(h));
  drawChart();
}

function renderHolding(h) {
  const node = $('#holdingTemplate').content.firstElementChild.cloneNode(true);
  $('.ticker',node).textContent = h.ticker;
  $('.lots',node).textContent = `${h.currentLots} lot`;
  $('.company',node).textContent = h.company || (h.errors?.ipo ? 'Halka arz bilgisi eksik' : 'BIST');
  $('.current-price',node).textContent = money(h.currentPrice);
  $('.daily-pct',node).textContent = pct(h.dailyPct); $('.daily-pct',node).classList.add(signClass(h.dailyPct));
  $('.daily-profit',node).textContent = money(h.dailyProfit); $('.daily-profit',node).classList.add(signClass(h.dailyProfit));
  $('.total-profit',node).textContent = h.totalProfit == null ? 'Bilgi eksik' : `${money(h.totalProfit)} · ${pct(h.totalProfitPct)}`; $('.total-profit',node).classList.add(signClass(h.totalProfit));
  $('.active-value',node).textContent = money(h.activeValue);
  $('.ipo-price',node).textContent = `Arz: ${money(h.ipoPrice)}`;
  $('.trade-date',node).textContent = h.firstTradeDate ? `İlk işlem: ${trDate(h.firstTradeDate)}` : 'İlk işlem tarihi: —';
  $('.holding-main',node).addEventListener('click', () => openDetail(h.id));
  return node;
}

function openSheet(id) {
  $('#sheetBackdrop').hidden = false; $(id).hidden = false; document.body.style.overflow = 'hidden';
}
function closeSheets() {
  $('#sheetBackdrop').hidden = true; $$('.sheet').forEach(s => s.hidden = true); document.body.style.overflow = '';
}

function openDetail(id) {
  const h = state.portfolio?.holdings.find(x => x.id === id); if (!h) return;
  state.selected = h;
  $('#detailTitle').textContent = `${h.ticker} · ${h.currentLots} lot`;
  const warnings = [h.errors?.market, h.errors?.ipo].filter(Boolean);
  $('#detailContent').innerHTML = `
    <div class="detail-grid">
      <div class="detail-tile"><span>Güncel fiyat</span><strong>${money(h.currentPrice)}</strong></div>
      <div class="detail-tile"><span>Halka arz fiyatı</span><strong>${money(h.ipoPrice)}</strong></div>
      <div class="detail-tile"><span>Bugünkü kazanç</span><strong class="${signClass(h.dailyProfit)}">${money(h.dailyProfit)} · ${pct(h.dailyPct)}</strong></div>
      <div class="detail-tile"><span>Toplam kazanç</span><strong class="${signClass(h.totalProfit)}">${money(h.totalProfit)} · ${pct(h.totalProfitPct)}</strong></div>
      <div class="detail-tile"><span>Başlangıç yatırım</span><strong>${money(h.invested)}</strong></div>
      <div class="detail-tile"><span>Güncel değer</span><strong>${money(h.activeValue)}</strong></div>
      <div class="detail-tile"><span>Gerçekleşen kâr</span><strong class="${signClass(h.realizedProfit)}">${money(h.realizedProfit)}</strong></div>
      <div class="detail-tile"><span>Gerçekleşmemiş kâr</span><strong class="${signClass(h.unrealizedProfit)}">${money(h.unrealizedProfit)}</strong></div>
    </div>
    ${warnings.length ? `<div class="warning-box">${warnings.map(esc).join('<br>')}</div>` : ''}
    <div class="edit-box">
      <h3>Satış ekle</h3>
      <form id="saleForm" class="mini-form">
        <input name="lots" type="number" min="1" max="${h.currentLots}" step="1" placeholder="Satılan lot" required>
        <input name="price" type="number" min="0.01" step="0.01" placeholder="Satış fiyatı" required>
        <button class="primary-btn" type="submit">Satışı kaydet</button>
      </form>
    </div>
    <div class="edit-box">
      <h3>Otomatik bilgi yanlışsa düzelt</h3>
      <form id="overrideForm" class="mini-form">
        <input name="ipoPriceOverride" type="number" min="0.01" step="0.01" value="${h.ipoPrice ?? ''}" placeholder="Halka arz fiyatı">
        <input name="firstTradeDateOverride" type="date" value="${h.firstTradeDate ?? ''}">
        <button class="secondary-btn" type="submit">Bilgiyi güncelle</button>
      </form>
    </div>
    <div class="detail-actions">
      <button id="refreshOne" class="secondary-btn">Yenile</button>
      <button id="deleteHolding" class="danger-btn">Hisseyi sil</button>
    </div>
    <p class="form-note" style="margin-top:12px">Kaynak: ${esc(h.source || 'Piyasa verisi')} · Son fiyat zamanı: ${h.marketTime ? new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short'}).format(new Date(h.marketTime)) : '—'}</p>
  `;
  $('#saleForm').addEventListener('submit', submitSale);
  $('#overrideForm').addEventListener('submit', submitOverride);
  $('#refreshOne').addEventListener('click', async () => { try { await service.refreshHolding(id); await loadPortfolio({quiet:true}); openDetail(id); } catch (e) { toast(e.message); } });
  $('#deleteHolding').addEventListener('click', deleteHolding);
  openSheet('#detailSheet');
}

async function submitSale(e) {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  try {
    await service.addSale(state.selected.id, { lots:Number(f.get('lots')), price:Number(f.get('price')) });
    closeSheets(); await loadPortfolio(); toast('Satış kaydedildi.');
  } catch (e2) { toast(e2.message); }
}
async function submitOverride(e) {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  try {
    await service.updateHolding(state.selected.id, { ipoPriceOverride: f.get('ipoPriceOverride') ? Number(f.get('ipoPriceOverride')) : null, firstTradeDateOverride: f.get('firstTradeDateOverride') || null });
    const id = state.selected.id; await loadPortfolio(); openDetail(id); toast('Bilgiler güncellendi.');
  } catch (e2) { toast(e2.message); }
}
async function deleteHolding() {
  if (!confirm(`${state.selected.ticker} portföyden silinsin mi?`)) return;
  try { await service.deleteHolding(state.selected.id); closeSheets(); await loadPortfolio({quiet:true}); toast('Hisse silindi.'); }
  catch (e) { toast(e.message); }
}

let lookupTimer;
$('#tickerInput').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  clearTimeout(lookupTimer); const ticker = e.target.value.trim(); const preview = $('#lookupPreview');
  if (ticker.length < 3) { preview.hidden = true; return; }
  lookupTimer = setTimeout(async () => {
    preview.hidden = false; preview.textContent = 'Bilgiler aranıyor…';
    try {
      const r = await service.lookup(ticker);
      const p = r.ipo?.ipoPrice; const c = r.market?.current;
      preview.innerHTML = `<b>${esc(r.ticker)}</b> · Güncel ${money(c)}<br>${p ? `Halka arz ${money(p)}${r.ipo.firstTradeDate ? ` · İlk işlem ${trDate(r.ipo.firstTradeDate)}` : ''}` : 'Halka arz fiyatı otomatik bulunamadı; ekledikten sonra düzeltebilirsiniz.'}`;
    } catch (err) { preview.textContent = err.message; }
  }, 500);
});

$('#addForm').addEventListener('submit', async e => {
  e.preventDefault(); const btn = $('#addSubmit'); const f = new FormData(e.currentTarget);
  btn.disabled = true; btn.textContent = 'Bulunuyor…';
  try {
    const r = await service.addHolding({ ticker:f.get('ticker'), lots:Number(f.get('lots')) });
    closeSheets(); e.currentTarget.reset(); $('#lookupPreview').hidden = true; await loadPortfolio();
    toast(r.autoIpoFound ? `${r.holding.ticker} eklendi.` : `${r.holding.ticker} eklendi; halka arz bilgisi kontrol edin.`);
  } catch (err) { toast(err.message); }
  finally { btn.disabled = false; btn.textContent = 'Otomatik bul ve ekle'; }
});

function drawChart() {
  const canvas = $('#portfolioChart'); const empty = $('#chartEmpty');
  if (!state.portfolio?.history?.length) { empty.hidden = false; canvas.style.opacity = 0; return; }
  empty.hidden = true; canvas.style.opacity = 1;
  const days = Number($('#chartRange').value || 30);
  const rows = state.portfolio.history.slice(-days);
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const rect = canvas.getBoundingClientRect(); canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr); const w=rect.width,h=rect.height;
  ctx.clearRect(0,0,w,h);
  const pad={l:4,r:4,t:18,b:22}; const vals=rows.map(r=>r.profit); let min=Math.min(...vals),max=Math.max(...vals); if(min===max){min-=1;max+=1} const extra=(max-min)*.12; min-=extra;max+=extra;
  const x=i=>pad.l+(i/Math.max(1,rows.length-1))*(w-pad.l-pad.r); const y=v=>pad.t+(max-v)/(max-min)*(h-pad.t-pad.b);
  const zeroY = y(0);
  ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,zeroY);ctx.lineTo(w,zeroY);ctx.stroke();
  const positive = vals.at(-1) >= 0;
  const stroke = positive ? '#35d49a' : '#ff6b78';
  const grad=ctx.createLinearGradient(0,pad.t,0,h);grad.addColorStop(0,positive?'rgba(53,212,154,.28)':'rgba(255,107,120,.25)');grad.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); rows.forEach((r,i)=>{const xx=x(i),yy=y(r.profit);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}); ctx.lineTo(x(rows.length-1),h-pad.b);ctx.lineTo(x(0),h-pad.b);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath(); rows.forEach((r,i)=>{const xx=x(i),yy=y(r.profit);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.strokeStyle=stroke;ctx.lineWidth=2.3;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  ctx.fillStyle='#758198';ctx.font='10px system-ui';ctx.textAlign='left';ctx.fillText(trDate(rows[0].date).replace(/ 20\d{2}/,''),pad.l,h-5);ctx.textAlign='right';ctx.fillText(trDate(rows.at(-1).date).replace(/ 20\d{2}/,''),w-pad.r,h-5);
}

$('#addFab').addEventListener('click', () => { openSheet('#addSheet'); setTimeout(()=>$('#tickerInput').focus(),100); });
$('#refreshBtn').addEventListener('click', () => loadPortfolio({ force:true }));
$('#chartRange').addEventListener('change', drawChart);
$('#sheetBackdrop').addEventListener('click', closeSheets);
$$('[data-close-sheet]').forEach(b => b.addEventListener('click', closeSheets));
window.addEventListener('resize', () => requestAnimationFrame(drawChart));
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadPortfolio({quiet:true}); });

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.hostname !== 'app.local') navigator.serviceWorker.register('./sw.js').catch(()=>{});
loadPortfolio();
setInterval(() => { if (!document.hidden) loadPortfolio({quiet:true}); }, 60_000);
