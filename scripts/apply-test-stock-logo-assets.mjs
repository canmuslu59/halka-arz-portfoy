import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'android/app/src/main/assets/www/app.js';
const policyPath = 'android/app/src/main/java/com/innative/halkaarz/NativeHttpPolicy.java';

let app = readFileSync(appPath, 'utf8');
const helperStart = app.indexOf('async function fetchHoldingLogoUrl(ticker) {');
const helperEnd = app.indexOf('function renderHolding(h) {', helperStart);
if (helperStart < 0 || helperEnd < 0) throw new Error('holding logo helper boundaries not found');

const robustHelpers = `function normalizeFintablesLogoCandidate(value, pageUrl) {
  let raw = String(value || '').trim().replaceAll('&amp;', '&');
  if (!raw) return null;
  try {
    if (/^https?%3A/i.test(raw)) raw = decodeURIComponent(raw);
    let parsed = new URL(raw, pageUrl);
    if (parsed.pathname === '/_next/image' || parsed.pathname.endsWith('/_next/image')) {
      const nested = parsed.searchParams.get('url');
      if (!nested) return null;
      parsed = new URL(decodeURIComponent(nested), pageUrl);
    }
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname.toLocaleLowerCase('tr-TR') !== 'storage.fintables.com') return null;
    if (!/\\/company-logos\\//i.test(parsed.pathname)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function extractFintablesCompanyLogoUrl(html, pageUrl) {
  const source = String(html || '')
    .replace(/\\\\u002F/gi, '/')
    .replace(/\\\\u0026/gi, '&')
    .replaceAll('&amp;', '&');
  const candidates = [];
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    for (const image of doc.querySelectorAll('img')) {
      candidates.push(
        image.getAttribute('src'),
        image.getAttribute('data-src'),
        image.getAttribute('data-original'),
      );
      const srcset = image.getAttribute('srcset');
      if (srcset) candidates.push(...srcset.split(',').map(part => part.trim().split(/\\s+/)[0]));
    }
    for (const node of doc.querySelectorAll('source[srcset]')) {
      candidates.push(...String(node.getAttribute('srcset') || '').split(',').map(part => part.trim().split(/\\s+/)[0]));
    }
    for (const meta of doc.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]')) {
      candidates.push(meta.getAttribute('content'));
    }
  } catch {}

  const absoluteMatches = source.match(/https:\\/\\/storage\\.fintables\\.com\\/[^\\s"'<>\\)]+/gi) || [];
  candidates.push(...absoluteMatches);
  const nextImageMatches = source.match(/\\/_next\\/image\\?[^\\s"'<>]+/gi) || [];
  candidates.push(...nextImageMatches);

  for (const candidate of candidates) {
    const resolved = normalizeFintablesLogoCandidate(candidate, pageUrl);
    if (resolved) return resolved;
  }
  return null;
}

async function fetchHoldingLogoUrl(ticker) {
  const symbol = String(ticker || '').trim().toLocaleUpperCase('tr-TR');
  if (!symbol) return null;
  if (holdingLogoCache.has(symbol)) return holdingLogoCache.get(symbol);
  const pageUrl = \\`https://fintables.com/sirketler/\\${encodeURIComponent(symbol)}\\`;
  const pending = httpGetText(pageUrl)
    .then(html => extractFintablesCompanyLogoUrl(html, pageUrl))
    .catch(() => null);
  holdingLogoCache.set(symbol, pending);
  return pending;
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
app = app.slice(0, helperStart) + robustHelpers + app.slice(helperEnd);
writeFileSync(appPath, app);

// Keep the storage host explicitly recognized by the native network policy for future-safe logo diagnostics.
let policy = readFileSync(policyPath, 'utf8');
if (!policy.includes('"storage.fintables.com"')) {
  const marker = '            "www.fintables.com",';
  if (!policy.includes(marker)) throw new Error('Fintables native host marker not found');
  policy = policy.replace(marker, `${marker}\n            "storage.fintables.com",`);
  writeFileSync(policyPath, policy);
}

console.log('Applied resilient Fintables company-logo resolution with letter fallback.');
