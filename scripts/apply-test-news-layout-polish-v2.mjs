import { readFileSync, writeFileSync } from 'node:fs';

const indexPath = 'android/app/src/main/assets/www/index.html';
const appPath = 'android/app/src/main/assets/www/app.js';
const stylesPath = 'android/app/src/main/assets/www/styles.css';
const policyPath = 'android/app/src/main/java/com/innative/halkaarz/NativeHttpPolicy.java';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

// Keep this pass isolated so it can later be ported onto the then-current production tree.
let index = readFileSync(indexPath, 'utf8');
const walletStart = index.indexOf('<button id="walletHomeTab"');
const walletEnd = walletStart >= 0 ? index.indexOf('</button>', walletStart) : -1;
if (walletStart < 0 || walletEnd < 0) throw new Error('center wallet navigation not found');
const walletBlock = index.slice(walletStart, walletEnd + '</button>'.length);
if (!walletBlock.includes('<b>Cüzdan</b>')) {
  const labelledWallet = walletBlock.replace('</svg>', '</svg>\n      <b>Cüzdan</b>');
  index = index.slice(0, walletStart) + labelledWallet + index.slice(walletEnd + '</button>'.length);
}
writeFileSync(indexPath, index);

let styles = readFileSync(stylesPath, 'utf8');
styles += `

/* Test-only news polish v2: compact cards, dock clearance, and unambiguous nav state. */
.finance-news-view{padding-bottom:calc(var(--dock-height) + 86px + var(--android-safe-bottom,0px));scroll-padding-bottom:calc(var(--dock-height) + 86px + var(--android-safe-bottom,0px))}
.news-feature-card{flex:0 0 clamp(264px,80vw,330px);width:clamp(264px,80vw,330px)}
.news-feature-body{padding:11px 12px 12px;gap:7px}
.news-feature-title{font-size:clamp(15px,4.25vw,17px);line-height:1.28;-webkit-line-clamp:2;min-height:0}
.news-feature-meta{font-size:9px;gap:8px}
.news-source-dot{width:20px;height:20px;flex-basis:20px}
.news-latest-item{grid-template-columns:clamp(58px,17vw,72px) minmax(0,1fr) 14px;gap:9px;padding:8px 0}
.news-latest-thumb{aspect-ratio:1.16/1;border-radius:11px;font-size:15px}
.news-latest-copy{gap:4px}
.news-latest-copy h4{font-size:12.5px;line-height:1.32}
.news-latest-meta{gap:5px;font-size:8.5px}
.wallet-center-tab{flex-direction:column;gap:2px;width:58px;height:56px;min-height:56px;border-radius:17px;transform:translateY(-2px)}
.wallet-center-tab:not(.active){background:transparent;color:#748197;box-shadow:none;border-color:transparent}
.wallet-center-tab.active{background:linear-gradient(145deg,#728fff,#4c67dd);color:#fff;box-shadow:0 7px 20px rgba(67,91,196,.34);border-color:rgba(255,255,255,.16)}
.wallet-center-tab .wallet-center-icon{width:22px;height:22px}
.wallet-center-tab b{display:block;font-size:9px;line-height:1;font-weight:800;white-space:nowrap}
@media(max-width:390px){
  .news-feature-card{flex-basis:clamp(252px,82vw,308px);width:clamp(252px,82vw,308px)}
  .news-feature-body{padding:10px 11px 11px}
  .news-latest-item{grid-template-columns:58px minmax(0,1fr) 12px;gap:8px}
  .wallet-center-tab{width:54px;height:54px;min-height:54px}
}
@media(min-width:600px){
  .news-feature-card{flex-basis:330px;width:330px}
}
html[data-theme="light"] .wallet-center-tab:not(.active){background:transparent;color:#738097;box-shadow:none;border-color:transparent}
`;
writeFileSync(stylesPath, styles);

let app = readFileSync(appPath, 'utf8');
const loadMarker = 'async function loadPopularFinanceNews({ force = false } = {}) {';
if (!app.includes(loadMarker)) throw new Error('finance news loader marker not found');
if (app.includes('async function enrichFinanceNewsItems(')) throw new Error('finance news source enrichment already applied');

const enrichmentLogic = `const FINANCE_NEWS_METADATA_LIMIT = 18;
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
    .replace(/\\s+/g, ' ')
    .replace(/\\s*[|\\-–—]\\s*Bloomberg\\s*HT\\s*$/i, '')
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

function extractFinanceArticleMetadata(html) {
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
  return { title, publishedAt };
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
    const metadata = extractFinanceArticleMetadata(await httpGetText(item.url));
    const title = metadata.title || (genericTitle ? null : normalizeFinanceNewsTitle(item.title));
    if (!title || isGenericFinanceNewsTitle(title)) return null;
    return {
      ...item,
      title,
      publishedAt: metadata.publishedAt || null,
      publicationTimeVerified: Boolean(metadata.publishedAt),
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

`;
app = app.replace(loadMarker, enrichmentLogic + loadMarker);

const thenMarker = `    .then(payload => {\n      financeNewsLastError = '';\n      popularFinanceNewsItems = financeNewsItemsOnly(payload?.items);`;
if (!app.includes(thenMarker)) throw new Error('finance news success pipeline marker not found');
app = app.replace(
  thenMarker,
  `    .then(async payload => {\n      financeNewsLastError = '';\n      const enrichedItems = await enrichFinanceNewsItems(payload?.items);\n      popularFinanceNewsItems = financeNewsItemsOnly(enrichedItems);`
);
writeFileSync(appPath, app);

let policy = readFileSync(policyPath, 'utf8');
if (!policy.includes('"www.aa.com.tr"')) throw new Error('AA finance fallback host marker not found');
if (!policy.includes('"www.bloomberght.com"')) {
  policy = replaceOnce(
    policy,
    `            "aa.com.tr",\n            "www.aa.com.tr"`,
    `            "aa.com.tr",\n            "www.aa.com.tr",\n            "bloomberght.com",\n            "www.bloomberght.com"`,
    'Bloomberg HT article metadata hosts'
  );
}
writeFileSync(policyPath, policy);

console.log('Applied isolated news polish v2 with source-verified Bloomberg HT metadata and compact navigation/layout.');
