import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'android/app/src/main/assets/www/app.js';

let app = readFileSync(appPath, 'utf8');
const helperStart = app.indexOf('async function fetchHoldingLogoUrl(ticker) {');
const helperEnd = app.indexOf('function renderHolding(h) {', helperStart);
if (helperStart < 0 || helperEnd < 0) throw new Error('holding logo helper boundaries not found');

const directLogoHelpers = `function bistHoldingLogoUrl(ticker) {
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

`;
app = app.slice(0, helperStart) + directLogoHelpers + app.slice(helperEnd);
writeFileSync(appPath, app);

console.log('Applied direct ticker-addressable BIST company logos with letter fallback.');
