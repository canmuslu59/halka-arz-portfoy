import { readFileSync, writeFileSync } from 'node:fs';

const indexPath = 'android/app/src/main/assets/www/index.html';
const stylesPath = 'android/app/src/main/assets/www/styles.css';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, replacement);
}

let index = readFileSync(indexPath, 'utf8');
index = replaceOnce(
  index,
  `      <div class="hero-grid">\n        <div>\n          <span class="metric-label">Bugün</span>\n          <div class="metric-value-row"><strong id="dailyProfit">₺0,00</strong><span id="dailyPct" class="metric-inline-value">%0,00</span></div>\n        </div>\n        <div>\n          <span class="metric-label">Yatırılan</span>\n          <strong id="invested">₺0,00</strong>\n        </div>\n        <div>\n          <span class="metric-label">Aktif değer</span>\n          <strong id="activeValue">₺0,00</strong>\n        </div>\n        <div>\n          <span class="metric-label">Satış nakdi</span>\n          <strong id="salesProceeds">₺0,00</strong>\n        </div>\n      </div>`,
  `      <div class="hero-grid wallet-metrics-grid">\n        <div class="wallet-metric-today"><span class="metric-label">Bugün</span><strong id="dailyProfit">₺0,00</strong></div>\n        <div class="wallet-metric-change"><span class="metric-label">Günlük Değişim</span><strong id="dailyPct">%0,00</strong></div>\n        <div class="wallet-metric-invested"><span class="metric-label">Yatırılan</span><strong id="invested">₺0,00</strong></div>\n        <div class="wallet-metric-hidden" aria-hidden="true"><strong id="activeValue">₺0,00</strong></div>\n        <div class="wallet-metric-hidden" aria-hidden="true"><strong id="salesProceeds">₺0,00</strong></div>\n      </div>`,
  'wallet visible metrics'
);
index = replaceOnce(
  index,
  '<button class="nav-tab active" data-view="portfolio" type="button">',
  '<button class="nav-tab portfolio-primary-tab active" data-view="portfolio" type="button">',
  'primary portfolio nav marker'
);
index = replaceOnce(
  index,
  `    <span>Takvim</span>\n  </button>\n  <button class="nav-tab" data-view="pro" type="button">`,
  `    <span>Takvim</span>\n  </button>\n  <button id="walletHomeTab" class="nav-tab wallet-center-tab" data-view="portfolio" type="button" aria-label="Cüzdan ana sayfa" title="Cüzdan">\n    <svg class="wallet-center-icon" viewBox="0 0 24 24" aria-hidden="true">\n      <path d="M4 7.5h14a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/>\n      <path d="M20 11h-5a2 2 0 0 0 0 4h5"/>\n      <circle cx="15.5" cy="13" r=".7"/>\n    </svg>\n  </button>\n  <button class="nav-tab" data-view="pro" type="button">`,
  'center wallet home navigation'
);
writeFileSync(indexPath, index);

let styles = readFileSync(stylesPath, 'utf8');
styles += `\n\n/* Isolated test-only wallet metric simplification + centered home control. */\n.wallet-home-card .hero-grid.wallet-metrics-grid{grid-template-columns:minmax(0,1.35fr) minmax(0,.9fr) minmax(0,1fr);gap:10px}\n.wallet-metric-hidden{display:none!important}\n.wallet-metric-today strong,.wallet-metric-change strong,.wallet-metric-invested strong{white-space:nowrap;overflow:visible;text-overflow:clip;font-variant-numeric:tabular-nums}\n.wallet-metric-today strong{font-size:clamp(12px,3.4vw,15px)}\n.wallet-metric-change strong{font-size:clamp(12px,3.2vw,15px)}\n.bottom-nav{grid-template-columns:repeat(5,minmax(0,1fr));align-items:center;overflow:visible}\n.wallet-center-tab,.wallet-center-tab.active{width:58px;height:58px;min-height:58px;justify-self:center;align-self:center;border-radius:50%;transform:translateY(-7px);background:linear-gradient(145deg,#728fff,#4c67dd);color:#fff;box-shadow:0 9px 24px rgba(67,91,196,.38);border:1px solid rgba(255,255,255,.18)}\n.wallet-center-tab.active{box-shadow:0 0 0 3px rgba(114,143,255,.18),0 9px 24px rgba(67,91,196,.42)}\n.wallet-center-tab .wallet-center-icon{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}\n.portfolio-primary-tab.active{color:#748197;background:transparent}\nhtml[data-theme="light"] .wallet-center-tab,html[data-theme="light"] .wallet-center-tab.active{color:#fff;background:linear-gradient(145deg,#6885f0,#4865d5);box-shadow:0 9px 22px rgba(67,91,196,.24)}\nhtml[data-theme="light"] .portfolio-primary-tab.active{color:#78859a;background:transparent}\n@media(max-width:430px){\n  .wallet-home-card .hero-grid.wallet-metrics-grid{grid-template-columns:minmax(0,1.4fr) minmax(0,.9fr) minmax(0,1fr);gap:7px}\n  .wallet-metrics-grid .metric-label{font-size:9px}\n  .wallet-center-tab,.wallet-center-tab.active{width:56px;height:56px;min-height:56px;transform:translateY(-7px)}\n}\n@media(max-width:365px){\n  .wallet-home-card .hero-grid.wallet-metrics-grid{grid-template-columns:minmax(0,1.45fr) minmax(0,.85fr) minmax(0,.95fr);gap:5px}\n  .wallet-metric-today strong,.wallet-metric-change strong,.wallet-metric-invested strong{font-size:11px}\n  .wallet-center-tab,.wallet-center-tab.active{width:52px;height:52px;min-height:52px}\n}\n`;
writeFileSync(stylesPath, styles);

console.log('Applied isolated test wallet metrics + center navigation overlay.');