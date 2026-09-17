const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';
const ISTANBUL_OFFSET = '+03:00';
const BREAKING_MAX_AGE_MS = 30 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;
const DIGEST_WINDOW_MINUTES = 15;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleKey(value) {
  return cleanText(value).toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim();
}

function shortHeadline(value, maxLength = 72) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function parseDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function istanbulParts(dateLike) {
  const date = parseDate(dateLike);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISTANBUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const result = {};
  for (const part of parts) {
    if (part.type !== 'literal') result[part.type] = part.value;
  }
  return {
    day: `${result.year}-${result.month}-${result.day}`,
    hour: Number(result.hour),
    minute: Number(result.minute),
  };
}

function previousIstanbulDay(day) {
  const anchor = new Date(`${day}T12:00:00${ISTANBUL_OFFSET}`);
  anchor.setTime(anchor.getTime() - 86_400_000);
  return istanbulParts(anchor)?.day || day;
}

function boundary(day, hour) {
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00${ISTANBUL_OFFSET}`);
}

function effectiveImportance(item) {
  const explicit = Number(item?.importance);
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 5) return explicit;
  return scoreNewsImportance(item);
}

function newsIdentity(item) {
  const id = cleanText(item?.id);
  if (id) return id;
  const url = cleanText(item?.url);
  if (url) return url;
  return titleKey(item?.title);
}

export function scoreNewsImportance(item) {
  const title = cleanText(item?.title).toLocaleLowerCase('tr-TR');
  const category = cleanText(item?.category).toLocaleLowerCase('tr-TR');
  if (!title) return 1;

  const centralBank = /(tcmb|para politikası kurulu|ppk)/.test(title);
  const rateOrSystemPolicy = /(politika faiz|faiz|zorunlu karşılık|rezerv opsiyon|kur korumalı|likidite)/.test(title);
  const decisionVerb = /(artırdı|artirdi|indirdi|sabit tuttu|kararını açıkladı|kararini acikladi|değiştirdi|degistirdi|olağanüstü|olaganustu)/.test(title);
  if (centralBank && rateOrSystemPolicy && decisionVerb) return 5;

  const exchange = /(borsa istanbul|\bbist\b)/.test(title) || category === 'borsa';
  const marketHalt = /(işlemler(?:i)?(?: geçici olarak)? durdur|işlemlere ara ver|işlem durdur|piyasa genelinde.*devre kesici|devre kesici.*piyasa geneli)/.test(title);
  if (exchange && marketHalt) return 5;

  const regulator = /(spk|sermaye piyasası kurulu|hazine ve maliye|resm[iî] gazete)/.test(title);
  const systemicRestriction = /(açığa satış yasa|işlem yasa|olağanüstü tedbir|sermaye kontrol|vergi oran.*değiş|stopaj.*değiş)/.test(title);
  if (regulator && systemicRestriction) return 5;

  if (centralBank || regulator || /borsa istanbul/.test(title)) return 4;
  if (/(halka arz|sermaye artır|temettü|bilanço|kredi not|enflasyon|işsizlik|büyüme|döviz rezerv)/.test(title)) return 3;
  if (/(dolar|euro|altın|borsa|endeks|hisse)/.test(title)) return 2;
  return 1;
}

export function selectDigestItems(items, { slot, now = new Date() } = {}) {
  const nowParts = istanbulParts(now);
  if (!nowParts || (slot !== 'morning' && slot !== 'evening')) return [];

  let start;
  let end;
  if (slot === 'morning') {
    start = boundary(previousIstanbulDay(nowParts.day), 19);
    end = boundary(nowParts.day, 10);
  } else {
    start = boundary(nowParts.day, 10);
    end = boundary(nowParts.day, 19);
  }

  const seen = new Set();
  const selected = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const publishedAt = parseDate(raw?.publishedAt);
    if (!publishedAt || publishedAt < start || publishedAt >= end) continue;
    const importance = effectiveImportance(raw);
    if (importance < 3) continue;
    const identity = newsIdentity(raw);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    selected.push({ ...raw, importance, _publishedMs: publishedAt.getTime() });
  }

  selected.sort((a, b) => {
    const importanceDiff = Number(b.importance) - Number(a.importance);
    if (importanceDiff) return importanceDiff;
    return b._publishedMs - a._publishedMs;
  });

  return selected.slice(0, 4).map(({ _publishedMs, ...item }) => item);
}

export function digestMessage(slot, items) {
  const title = slot === 'morning' ? '📰 Dünden Kalan Önemliler' : '📰 Akşama Düşenler';
  const body = (Array.isArray(items) ? items : [])
    .slice(0, 4)
    .map((item) => `• ${shortHeadline(item?.title, 72)}`)
    .join('\n');
  return { title, body };
}

export function currentDigestSlot(now = new Date()) {
  const parts = istanbulParts(now);
  if (!parts) return null;
  const minuteOfDay = parts.hour * 60 + parts.minute;
  if (minuteOfDay >= 10 * 60 && minuteOfDay < 10 * 60 + DIGEST_WINDOW_MINUTES) return 'morning';
  if (minuteOfDay >= 19 * 60 && minuteOfDay < 19 * 60 + DIGEST_WINDOW_MINUTES) return 'evening';
  return null;
}

function normalizeFeed(payload) {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  return items.map((item) => ({ ...item, importance: effectiveImportance(item) }));
}

function newsStateOf(registration) {
  const value = registration?.newsState;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function updateRegistrationNewsState(store, installKey, patch) {
  await store.mutate((state) => {
    if (!state?.installations?.[installKey]) return state;
    const registration = state.installations[installKey];
    registration.newsState = { ...newsStateOf(registration), ...patch };
    return state;
  });
}

export function createNewsNotificationEngine({
  store,
  sender,
  fetchNews,
  now = () => new Date(),
  breakingMaxAgeMs = BREAKING_MAX_AGE_MS,
} = {}) {
  if (!store?.read || !store?.mutate) throw new Error('news notification store is required');
  if (!sender?.send) throw new Error('news notification sender is required');
  if (typeof fetchNews !== 'function') throw new Error('news feed fetcher is required');

  return {
    async check() {
      const checkedAt = parseDate(now()) || new Date();
      const feed = normalizeFeed(await fetchNews());
      const state = await store.read();
      const installations = state?.installations && typeof state.installations === 'object' ? state.installations : {};
      let breakingSent = 0;
      let digestSent = 0;

      const breakingCandidates = feed.filter((item) => {
        if (Number(item.importance) !== 5) return false;
        const publishedAt = parseDate(item.publishedAt);
        if (!publishedAt) return false;
        const age = checkedAt.getTime() - publishedAt.getTime();
        return age >= -CLOCK_SKEW_MS && age <= breakingMaxAgeMs;
      });

      for (const [installKey, registration] of Object.entries(installations)) {
        if (!registration?.fcmToken || registration.newsEnabled === false) continue;
        let localState = newsStateOf(registration);
        let breakingSeen = Array.isArray(localState.breakingSeen) ? [...localState.breakingSeen] : [];

        for (const item of breakingCandidates) {
          const identity = newsIdentity(item);
          if (!identity || breakingSeen.includes(identity)) continue;
          await sender.send(registration.fcmToken, {
            title: '🔴 Son Dakika',
            body: shortHeadline(item.title, 120),
            data: {
              kind: 'news_breaking',
              news_id: identity,
              news_url: cleanText(item.url),
              importance: '5',
            },
          });
          breakingSeen = [...breakingSeen, identity].slice(-100);
          await updateRegistrationNewsState(store, installKey, { breakingSeen });
          breakingSent += 1;
        }

        const slot = currentDigestSlot(checkedAt);
        if (!slot) continue;
        const digestItems = selectDigestItems(feed, { slot, now: checkedAt });
        if (digestItems.length < 2) continue;

        const day = istanbulParts(checkedAt)?.day;
        const dayKey = slot === 'morning' ? 'morningDigestDay' : 'eveningDigestDay';
        const latestState = (await store.read())?.installations?.[installKey];
        localState = newsStateOf(latestState || registration);
        if (localState[dayKey] === day) continue;

        const message = digestMessage(slot, digestItems);
        await sender.send(registration.fcmToken, {
          ...message,
          data: {
            kind: 'news_digest',
            digest_slot: slot,
            digest_day: day,
            news_count: String(digestItems.length),
          },
        });
        await updateRegistrationNewsState(store, installKey, { [dayKey]: day });
        digestSent += 1;
      }

      return {
        checkedAt: checkedAt.toISOString(),
        feedCount: feed.length,
        breakingSent,
        digestSent,
      };
    },
  };
}
