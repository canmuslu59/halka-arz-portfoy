import { analyzeCeilingSeries, simulateCeilings } from './ipo-analytics.js';
import { cleanTicker } from './domain.js';

export const CALENDAR_TTL_MS = 60 * 60 * 1000;
export const DETAIL_TTL_MS = 24 * 60 * 60 * 1000;
const CALENDAR_KEY = 'halka_arz_calendar_cache_v2';
const DETAIL_PREFIX = 'halka_arz_detail_cache_v1_';

const MONTHS = {
  ocak:1, şubat:2, subat:2, mart:3, nisan:4, mayıs:5, mayis:5, haziran:6,
  temmuz:7, ağustos:8, agustos:8, eylül:9, eylul:9, ekim:10, kasım:11, kasim:11, aralık:12, aralik:12,
};

function iso(year, month, day) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function monthNo(name) {
  return MONTHS[String(name || '').toLocaleLowerCase('tr-TR')] || null;
}

export function parseOfferWindow(text) {
  const value = String(text || '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  let match = value.match(/(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*-\s*(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(20\d{2})/i);
  if (match) {
    const firstMonth = monthNo(match[2]);
    const secondMonth = monthNo(match[4]);
    if (firstMonth && secondMonth) {
      const endYear = Number(match[5]);
      const startYear = firstMonth > secondMonth ? endYear - 1 : endYear;
      return { start:iso(startYear, firstMonth, match[1]), end:iso(endYear, secondMonth, match[3]) };
    }
  }
  match = value.match(/(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(20\d{2})/i);
  if (match) {
    const month = monthNo(match[3]);
    if (month) return { start:iso(match[4], month, match[1]), end:iso(match[4], month, match[2]) };
  }
  match = value.match(/(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(20\d{2})/i);
  if (match) {
    const month = monthNo(match[2]);
    if (month) {
      const date = iso(match[3], month, match[1]);
      return { start:date, end:date };
    }
  }
  return null;
}

function istanbulDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Istanbul', year:'numeric', month:'2-digit', day:'2-digit',
  }).format(date);
}

export function classifyIpoStatus(offerDates, nowDate = new Date()) {
  const window = parseOfferWindow(offerDates);
  if (!window) return 'unknown';
  const today = istanbulDate(nowDate);
  if (today < window.start) return 'upcoming';
  if (today <= window.end) return 'active';
  return 'completed';
}

function safeRead(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function safeWrite(storage, key, value) {
  try { storage?.setItem?.(key, JSON.stringify(value)); } catch {}
}

function errorMessage(error) {
  return error?.message ? String(error.message) : 'Veri yenilenemedi.';
}

export function createIpoService({
  getCalendar,
  getDetail,
  getHistory,
  storage = globalThis.localStorage,
  now = () => Date.now(),
  calendarTtlMs = CALENDAR_TTL_MS,
  detailTtlMs = DETAIL_TTL_MS,
} = {}) {
  if (typeof getCalendar !== 'function' || typeof getDetail !== 'function' || typeof getHistory !== 'function') {
    throw new TypeError('Halka arz servis veri fonksiyonları gerekli.');
  }

  function decorateCalendar(items) {
    const date = new Date(now());
    return (Array.isArray(items) ? items : []).map(item => ({
      ...item,
      ticker:cleanTicker(item.ticker),
      status:classifyIpoStatus(item.offerDates, date),
    })).filter(item => item.ticker);
  }

  async function getCalendarData({ force = false } = {}) {
    const cached = safeRead(storage, CALENDAR_KEY);
    const age = cached?.fetchedAt ? now() - Number(cached.fetchedAt) : Infinity;
    if (!force && cached?.items && age >= 0 && age < calendarTtlMs) {
      return { items:decorateCalendar(cached.items), fetchedAt:cached.fetchedAt, stale:false, warning:null };
    }
    try {
      const items = await getCalendar();
      const record = { fetchedAt:now(), items:Array.isArray(items) ? items : [] };
      safeWrite(storage, CALENDAR_KEY, record);
      return { items:decorateCalendar(record.items), fetchedAt:record.fetchedAt, stale:false, warning:null };
    } catch (error) {
      if (cached?.items) {
        return { items:decorateCalendar(cached.items), fetchedAt:cached.fetchedAt, stale:true, warning:errorMessage(error) };
      }
      throw error;
    }
  }

  async function getDetailData(itemOrTicker, { force = false } = {}) {
    const item = itemOrTicker && typeof itemOrTicker === 'object'
      ? { ...itemOrTicker, ticker:cleanTicker(itemOrTicker.ticker) }
      : { ticker:cleanTicker(itemOrTicker) };
    if (!item.ticker) throw new Error('Geçerli bir halka arz kodu gerekli.');
    const key = `${DETAIL_PREFIX}${item.ticker}`;
    const cached = safeRead(storage, key);
    const age = cached?.fetchedAt ? now() - Number(cached.fetchedAt) : Infinity;
    if (!force && cached?.data && age >= 0 && age < detailTtlMs) {
      return { ...cached.data, stale:false, warning:null, fetchedAt:cached.fetchedAt };
    }

    try {
      const detail = await getDetail(item);
      let history = [];
      let historyWarning = null;
      try {
        const historyData = await getHistory(item.ticker, detail.firstTradeDate || item.firstTradeDate || '2010-01-01');
        history = Array.isArray(historyData) ? historyData : (historyData?.history || []);
      } catch (error) {
        historyWarning = errorMessage(error);
      }
      const ceilingAnalysis = analyzeCeilingSeries({
        ipoPrice:detail.ipoPrice,
        firstTradeDate:detail.firstTradeDate,
        history,
      });
      const data = {
        ...item,
        ...detail,
        ticker:item.ticker,
        history,
        ceilingAnalysis,
        ceilingSimulation:simulateCeilings(detail.ipoPrice, 20),
      };
      const record = { fetchedAt:now(), data };
      safeWrite(storage, key, record);
      return { ...data, stale:false, warning:historyWarning, fetchedAt:record.fetchedAt };
    } catch (error) {
      if (cached?.data) {
        return { ...cached.data, stale:true, warning:errorMessage(error), fetchedAt:cached.fetchedAt };
      }
      throw error;
    }
  }

  return { getCalendar:getCalendarData, getDetail:getDetailData };
}
