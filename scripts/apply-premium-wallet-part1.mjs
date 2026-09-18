import { readFileSync, writeFileSync } from 'node:fs';

const indexPath = 'android/app/src/main/assets/www/index.html';
const appPath = 'android/app/src/main/assets/www/app.js';
const stylesPath = 'android/app/src/main/assets/www/styles.css';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

let index = readFileSync(indexPath, 'utf8');

index = replaceOnce(
  index,
  '    <section class="hero-card" aria-labelledby="portfolioValueLabel">',
  '    <section class="hero-card wallet-home-card" aria-labelledby="portfolioValueLabel">',
  'wallet hero class'
);

index = replaceOnce(
  index,
  `      <div class="hero-grid">
        <div>
          <span class="metric-label">Bugün</span>
          <div class="metric-value-row"><strong id="dailyProfit">₺0,00</strong><span id="dailyPct" class="metric-inline-value">%0,00</span></div>
        </div>
        <div>
          <span class="metric-label">Yatırılan</span>
          <strong id="invested">₺0,00</strong>
        </div>
        <div>
          <span class="metric-label">Aktif değer</span>
          <strong id="activeValue">₺0,00</strong>
        </div>
        <div>
          <span class="metric-label">Satış nakdi</span>
          <strong id="salesProceeds">₺0,00</strong>
        </div>
      </div>`,
  `      <div class="hero-grid wallet-metrics-grid">
        <div class="wallet-metric-today"><span class="metric-label">Bugün</span><strong id="dailyProfit">₺0,00</strong></div>
        <div class="wallet-metric-change"><span class="metric-label">Günlük Değişim</span><strong id="dailyPct">%0,00</strong></div>
        <div class="wallet-metric-invested"><span class="metric-label">Yatırılan</span><strong id="invested">₺0,00</strong></div>
        <div class="wallet-metric-hidden" aria-hidden="true"><strong id="activeValue">₺0,00</strong></div>
        <div class="wallet-metric-hidden" aria-hidden="true"><strong id="salesProceeds">₺0,00</strong></div>
      </div>`,
  'wallet visible metrics'
);

index = replaceOnce(
  index,
  '    <section class="chart-card">',
  `    <section id="weeklyMoversCard" class="weekly-movers-card" aria-label="Haftanın en hareketli hisseleri">
      <div class="weekly-movers-head">
        <div><span class="eyebrow">HAFTALIK</span><h3>Haftanın En Hareketlileri</h3></div>
        <span class="weekly-movers-period">5 işlem günü</span>
      </div>
      <div id="weeklyMoversList" class="weekly-movers-list"><div class="weekly-movers-empty">Haftalık veri bekleniyor.</div></div>
    </section>

    <section class="chart-card">`,
  'weekly movers card'
);

writeFileSync(indexPath, index);

let app = readFileSync(appPath, 'utf8');

const weeklyMoversLogic = `const PREMIUM_TEST_WEEKLY_MOVER_SESSIONS = 5;

function premiumTestWeeklyMoveForHolding(holding) {
  if (Number(holding?.currentLots || 0) <= 0) return null;
  const rows = (Array.isArray(holding?.history) ? holding.history : [])
    .filter(row => row?.date && Number.isFinite(Number(row?.close)) && Number(row.close) > 0)
    .slice()
    .sort((a,b) => String(a.date).localeCompare(String(b.date)));
  if (rows.length <= PREMIUM_TEST_WEEKLY_MOVER_SESSIONS) return null;
  const current = Number(rows[rows.length - 1]?.close);
  const previous = Number(rows[rows.length - 1 - PREMIUM_TEST_WEEKLY_MOVER_SESSIONS]?.close);
  if (!(current > 0) || !(previous > 0)) return null;
  return {
    id: holding.id,
    ticker: holding.ticker,
    company: holding.company || 'BIST',
    weeklyPct: ((current / previous) - 1) * 100,
  };
}

function renderPremiumTestWeeklyMovers(holdings = []) {
  const list = $('#weeklyMoversList');
  if (!list) return;
  const movers = holdings
    .map(premiumTestWeeklyMoveForHolding)
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

`;

app = replaceOnce(app, 'function renderPortfolio(data) {', weeklyMoversLogic + 'function renderPortfolio(data) {', 'weekly movers logic');
app = replaceOnce(
  app,
  `  renderSectorAllocation(data.holdings);
  renderDailyHistory();
  drawChart();
}`,
  `  renderSectorAllocation(data.holdings);
  renderDailyHistory();
  drawChart();
  renderPremiumTestWeeklyMovers(data.holdings);
}`,
  'weekly movers render hook'
);

writeFileSync(appPath, app);

let styles = readFileSync(stylesPath, 'utf8');
styles += `

/* Premium Test - Part 1: wallet home presentation only. */
.wallet-home-card .hero-grid.wallet-metrics-grid{grid-template-columns:minmax(0,1.35fr) minmax(0,.9fr) minmax(0,1fr);gap:10px}
.wallet-metric-hidden{display:none!important}
.wallet-metric-today strong,.wallet-metric-change strong,.wallet-metric-invested strong{white-space:nowrap;overflow:visible;text-overflow:clip;font-variant-numeric:tabular-nums}
.wallet-metric-today strong{font-size:clamp(12px,3.4vw,15px)}
.wallet-metric-change strong{font-size:clamp(12px,3.2vw,15px)}
.weekly-movers-card{border:1px solid var(--line);background:linear-gradient(160deg,rgba(25,35,65,.92),rgba(11,16,31,.92));box-shadow:var(--shadow);border-radius:22px;padding:14px 15px 12px;display:grid;gap:9px;min-height:142px}
.weekly-movers-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
.weekly-movers-head h3{margin:2px 0 0;font-size:14px;line-height:1.15}
.weekly-movers-period{font-size:9px;color:var(--muted);font-weight:800;white-space:nowrap}
.weekly-movers-list{display:grid;gap:5px}
.weekly-mover-row{width:100%;min-height:31px;border:1px solid rgba(255,255,255,.055);border-radius:10px;background:rgba(255,255,255,.035);color:inherit;padding:6px 9px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;text-align:left;font:inherit;cursor:pointer}
.weekly-mover-identity{display:flex;align-items:baseline;gap:7px;min-width:0}
.weekly-mover-identity strong{font-size:11px;letter-spacing:.02em}
.weekly-mover-identity span{font-size:9px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.weekly-mover-change{font-size:12px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}
.weekly-movers-empty{min-height:76px;display:grid;place-items:center;color:var(--muted);font-size:10px;text-align:center}
html[data-theme="light"] .weekly-movers-card{background:linear-gradient(160deg,#fff,#f8faff);border-color:#dfe5f0;box-shadow:0 10px 28px rgba(52,67,103,.08)}
html[data-theme="light"] .weekly-mover-row{background:#f7f9fc;border-color:#e5e9f0}
@media(max-width:430px){
  .weekly-movers-card{min-height:136px;padding:12px 13px 10px;gap:7px;border-radius:19px}
  .weekly-movers-head h3{font-size:13px}
  .weekly-mover-row{min-height:29px;padding:5px 8px}
  .wallet-home-card .hero-grid.wallet-metrics-grid{grid-template-columns:minmax(0,1.4fr) minmax(0,.9fr) minmax(0,1fr);gap:7px}
  .wallet-metrics-grid .metric-label{font-size:9px}
}
@media(max-width:365px){
  .weekly-mover-identity span{display:none}
  .wallet-home-card .hero-grid.wallet-metrics-grid{grid-template-columns:minmax(0,1.45fr) minmax(0,.85fr) minmax(0,.95fr);gap:5px}
  .wallet-metric-today strong,.wallet-metric-change strong,.wallet-metric-invested strong{font-size:11px}
}
`;

writeFileSync(stylesPath, styles);
console.log('Applied Premium Test wallet Part 1 overlay on live Code30 assets.');
