import { scoreNewsImportance } from './news-notifications.js';

const SUCCESS_CACHE_MS = 24 * 60 * 60_000;
const FAILURE_CACHE_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 150;
const DEFAULT_MAX_FETCHES = 12;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return cleanText(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function normalizeTitle(value) {
  return decodeHtml(value)
    .replace(/\s*[|\-–—]\s*Bloomberg\s*HT\s*$/i, '')
    .trim();
}

function parseAttributes(tag) {
  const attrs = {};
  const re = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = re.exec(String(tag || '')))) {
    attrs[String(match[1]).toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function metaContent(html, key) {
  const wanted = String(key || '').toLowerCase();
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    const marker = String(attrs.property || attrs.name || '').toLowerCase();
    if (marker === wanted && attrs.content) return decodeHtml(attrs.content);
  }
  return null;
}

function timeDatetime(html) {
  const tags = String(html || '').match(/<time\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    if (attrs.datetime) return decodeHtml(attrs.datetime);
  }
  return null;
}

function jsonLdPublished(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = jsonLdPublished(child);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  if (value.datePublished) return value.datePublished;
  for (const child of Object.values(value)) {
    const found = jsonLdPublished(child);
    if (found) return found;
  }
  return null;
}

function jsonLdTime(html) {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    try {
      const found = jsonLdPublished(JSON.parse(match[1]));
      if (found) return found;
    } catch {}
  }
  return null;
}

function normalizePublicationTime(value, now = new Date()) {
  if (value == null || cleanText(value) === '') return null;
  const date = new Date(value);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(nowDate.getTime())) return null;
  if (date.getTime() > nowDate.getTime() + 10 * 60_000) return null;
  return date.toISOString();
}

export function parseNewsArticleMetadata(html, { now = new Date() } = {}) {
  const titleCandidates = [
    metaContent(html, 'og:title'),
    metaContent(html, 'twitter:title'),
  ];
  let title = null;
  for (const candidate of titleCandidates) {
    const normalized = normalizeTitle(candidate);
    if (normalized) {
      title = normalized;
      break;
    }
  }

  const timeCandidates = [
    metaContent(html, 'article:published_time'),
    timeDatetime(html),
    jsonLdTime(html),
  ];
  let publishedAt = null;
  for (const candidate of timeCandidates) {
    publishedAt = normalizePublicationTime(candidate, now);
    if (publishedAt) break;
  }
  return { title, publishedAt };
}

function hostOf(url) {
  try { return new URL(String(url || '')).hostname.toLowerCase(); }
  catch { return ''; }
}

function isBloombergHt(item) {
  const host = hostOf(item?.url);
  return host === 'bloomberght.com' || host === 'www.bloomberght.com' || cleanText(item?.source) === 'Bloomberg HT';
}

function importanceOf(item) {
  const explicit = Number(item?.importance);
  return Number.isInteger(explicit) && explicit >= 1 && explicit <= 5 ? explicit : scoreNewsImportance(item);
}

function validVerifiedTime(item, now) {
  if (item?.publicationTimeVerified !== true) return null;
  return normalizePublicationTime(item?.publishedAt, now);
}

function cachedResult(item, record) {
  if (!record?.verified) return { ...item, publishedAt:null, publicationTimeVerified:false };
  return {
    ...item,
    title:cleanText(record.title) || item.title,
    publishedAt:record.publishedAt || null,
    publicationTimeVerified:Boolean(record.publishedAt),
  };
}

function prunedCache(cache) {
  const entries = Object.entries(cache || {})
    .sort((a, b) => Number(b[1]?.checkedAt || 0) - Number(a[1]?.checkedAt || 0))
    .slice(0, MAX_CACHE_ENTRIES);
  return Object.fromEntries(entries);
}

export async function verifyNewsNotificationMetadata(items, {
  store,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  maxFetches = DEFAULT_MAX_FETCHES,
} = {}) {
  if (!store?.read || !store?.mutate) throw new Error('news metadata store is required');
  if (typeof fetchImpl !== 'function') throw new Error('news metadata fetch is required');

  const rawNow = now();
  const checkedAt = rawNow instanceof Date ? new Date(rawNow.getTime()) : new Date(rawNow);
  const nowMs = checkedAt.getTime();
  const state = await store.read();
  const cache = state?.newsMetadataCache && typeof state.newsMetadataCache === 'object'
    ? { ...state.newsMetadataCache }
    : {};
  const result = (Array.isArray(items) ? items : []).map(item => ({ ...item }));
  const fetchIndexes = [];
  const cacheUpdates = {};

  for (let i = 0; i < result.length; i += 1) {
    const item = result[i];
    if (importanceOf(item) < 3) continue;

    const alreadyVerified = validVerifiedTime(item, checkedAt);
    if (alreadyVerified) {
      item.publishedAt = alreadyVerified;
      continue;
    }

    if (!isBloombergHt(item) || !cleanText(item.url)) {
      item.publishedAt = null;
      item.publicationTimeVerified = false;
      continue;
    }

    const record = cache[item.url];
    const age = nowMs - Number(record?.checkedAt || 0);
    const ttl = record?.verified ? SUCCESS_CACHE_MS : FAILURE_CACHE_MS;
    if (record && age >= 0 && age < ttl) {
      result[i] = cachedResult(item, record);
      continue;
    }

    if (fetchIndexes.length < Math.max(0, Number(maxFetches) || 0)) fetchIndexes.push(i);
    else {
      item.publishedAt = null;
      item.publicationTimeVerified = false;
    }
  }

  await Promise.all(fetchIndexes.map(async (index) => {
    const item = result[index];
    const key = item.url;
    try {
      const response = await fetchImpl(key, {
        headers:{ accept:'text/html,application/xhtml+xml', 'user-agent':'HalkaArzPortfoyum-NewsPush/1.0' },
      });
      if (!response?.ok) throw new Error(`article metadata failed (${response?.status || 0})`);
      const metadata = parseNewsArticleMetadata(await response.text(), { now:checkedAt });
      if (!metadata.publishedAt) throw new Error('article publication time missing');
      result[index] = {
        ...item,
        title:metadata.title || item.title,
        publishedAt:metadata.publishedAt,
        publicationTimeVerified:true,
      };
      cacheUpdates[key] = {
        title:metadata.title || item.title,
        publishedAt:metadata.publishedAt,
        verified:true,
        checkedAt:nowMs,
      };
    } catch {
      result[index] = { ...item, publishedAt:null, publicationTimeVerified:false };
      cacheUpdates[key] = { verified:false, checkedAt:nowMs };
    }
  }));

  if (Object.keys(cacheUpdates).length) {
    await store.mutate(draft => {
      draft.newsMetadataCache = prunedCache({ ...(draft.newsMetadataCache || {}), ...cacheUpdates });
      return draft;
    });
  }

  return result;
}
