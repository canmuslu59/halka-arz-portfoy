import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'android/app/src/main/assets/www/app.js';
const stylesPath = 'android/app/src/main/assets/www/styles.css';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

// Isolated test-only pass: enrich finance articles with their original imagery.
let app = readFileSync(appPath, 'utf8');

const metadataMarker = 'function extractFinanceArticleMetadata(html) {';
const metadataHelpers = `function normalizeFinanceArticleImageUrl(value, baseUrl = '') {
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

function extractFinanceArticleMetadata(html, baseUrl = '') {`;
app = replaceOnce(app, metadataMarker, metadataHelpers, 'article image metadata helpers');

const metadataReturn = '  return { title, publishedAt };';
const metadataReturnWithImage = `  const imageCandidates = [
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
  return { title, publishedAt, imageUrl };`;
app = replaceOnce(app, metadataReturn, metadataReturnWithImage, 'article metadata image return');

app = replaceOnce(
  app,
  'const metadata = extractFinanceArticleMetadata(await httpGetText(item.url));',
  'const metadata = extractFinanceArticleMetadata(await httpGetText(item.url), item.url);',
  'article metadata base URL'
);

app = replaceOnce(
  app,
  `      title,
      publishedAt: metadata.publishedAt || null,
      publicationTimeVerified: Boolean(metadata.publishedAt),`,
  `      title,
      publishedAt: metadata.publishedAt || null,
      publicationTimeVerified: Boolean(metadata.publishedAt),
      imageUrl: metadata.imageUrl || normalizeFinanceArticleImageUrl(item?.imageUrl, item?.url) || null,`,
  'enriched article image field'
);

const featureArt = `        '<div class="news-feature-art ' + financeNewsArtClass(item.category) + '">' +
          '<span class="news-art-grid"></span>' +`;
const featureArtWithImage = `        '<div class="news-feature-art ' + financeNewsArtClass(item.category) + '">' +
          (item.imageUrl ? '<img class="news-feature-image" src="' + esc(item.imageUrl) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true" />' : '') +
          '<span class="news-art-grid"></span>' +`;
app = replaceOnce(app, featureArt, featureArtWithImage, 'popular article image renderer');

const latestThumb = `      '<span class="news-latest-thumb ' + financeNewsArtClass(item.category) + '"><span>' + esc(symbol) + '</span></span>' +`;
const latestThumbWithImage = `      '<span class="news-latest-thumb ' + financeNewsArtClass(item.category) + '">' +
        '<span>' + esc(symbol) + '</span>' +
        (item.imageUrl ? '<img class="news-latest-image" src="' + esc(item.imageUrl) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true" />' : '') +
      '</span>' +`;
app = replaceOnce(app, latestThumb, latestThumbWithImage, 'latest article image renderer');

writeFileSync(appPath, app);

let styles = readFileSync(stylesPath, 'utf8');
styles += `

/* Test-only real finance article imagery. Category art remains the fallback. */
.news-feature-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;background:transparent}
.news-feature-image[hidden],.news-latest-image[hidden]{display:none!important}
.news-feature-art:has(.news-feature-image:not([hidden])):after{z-index:1;inset:0;height:auto;left:0;right:0;bottom:0;transform:none;border:0;opacity:1;background:linear-gradient(180deg,rgba(3,8,18,.04) 20%,rgba(3,8,18,.46) 100%)}
.news-feature-art:has(.news-feature-image:not([hidden])) .news-art-grid,.news-feature-art:has(.news-feature-image:not([hidden])) .news-art-symbol{opacity:0}
.news-feature-art .news-category-chip{position:relative;z-index:2}
.news-latest-thumb>span{position:relative;z-index:0}
.news-latest-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;background:transparent}
.news-latest-thumb:after{z-index:2;pointer-events:none}
`;
writeFileSync(stylesPath, styles);

console.log('Applied original finance article imagery with secure metadata fallbacks.');
