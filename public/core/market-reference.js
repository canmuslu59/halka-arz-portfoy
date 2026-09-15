function cleanText(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function marketNumber(value) {
  if (value == null) return null;
  let text = String(value).trim().replace(/\s/g, '');
  if (!text) return null;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  const number = Number(text.replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizedTicker(value) {
  return String(value || '').trim().toUpperCase().replace(/\.IS$/i, '').replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function makeReference(ticker, previousClose, floorPrice, ceilingPrice, source) {
  const key = normalizedTicker(ticker);
  const previous = marketNumber(previousClose);
  const floor = marketNumber(floorPrice);
  const ceiling = marketNumber(ceilingPrice);
  if (!key || !(previous > 0) || !(floor > 0) || !(ceiling > floor)) return null;
  return { ticker:key, previousClose:previous, floorPrice:floor, ceilingPrice:ceiling, source };
}

export function parseForeksReferenceText(value, ticker) {
  const text = cleanText(value);
  const ceiling = text.match(/(?:^|\s)Tavan\s+([0-9][0-9.,]*)/i)?.[1] || null;
  const floor = text.match(/(?:^|\s)Taban\s+([0-9][0-9.,]*)/i)?.[1] || null;
  const previous = text.match(/Önceki\s+G\.?\s*Kapanış\s+([0-9][0-9.,]*)/i)?.[1] || null;
  return makeReference(ticker, previous, floor, ceiling, 'foreks');
}

export function parseOyakReferenceText(value, ticker) {
  const text = cleanText(value);
  const limits = text.match(/Taban\s+Tavan\s+Saat\s+([0-9.,]+)\s+[-+0-9.,]+\s+%?[-+0-9.,]+\s+([0-9.,]+)\s+([0-9.,]+)\s+([0-9.,]+)\s+([0-9.,]+)\s+\d{1,2}:\d{2}/i);
  let floor = limits?.[4] || null;
  let ceiling = limits?.[5] || null;
  if (!floor || !ceiling) {
    floor = text.match(/(?:^|\s)Taban\s+([0-9][0-9.,]*)/i)?.[1] || null;
    ceiling = text.match(/(?:^|\s)Tavan\s+([0-9][0-9.,]*)/i)?.[1] || null;
  }

  let previous = null;
  const marker = text.search(/Önceki\s+Kapanış/i);
  if (marker >= 0) {
    const tail = text.slice(marker);
    const dailyIndex = tail.search(/\bGünlük\b/i);
    if (dailyIndex >= 0) {
      const values = tail.slice(dailyIndex + 'Günlük'.length).match(/[0-9]+(?:[.,][0-9]+)*/g) || [];
      previous = values[3] || null;
    }
  }
  if (!previous) previous = text.match(/Önceki\s+Kapanış\s+([0-9][0-9.,]*)/i)?.[1] || null;
  return makeReference(ticker, previous, floor, ceiling, 'oyak-foreks');
}

export function applyTrustedMarketReference(quote = {}, reference = null) {
  const current = marketNumber(quote.current);
  const key = normalizedTicker(quote.ticker);
  const ref = reference && normalizedTicker(reference.ticker) === key
    ? makeReference(key, reference.previousClose, reference.floorPrice, reference.ceilingPrice, reference.source || 'reference')
    : null;
  if (!ref) {
    return { ...quote, referenceVerified:false, referenceSource:null, floorPrice:null, ceilingPrice:null };
  }
  const tickTolerance = Math.max(0.005, Math.abs(ref.ceilingPrice - ref.floorPrice) * 1e-8);
  const currentIsPossible = current == null
    || (current >= ref.floorPrice - tickTolerance && current <= ref.ceilingPrice + tickTolerance);
  return {
    ...quote,
    previousClose:ref.previousClose,
    floorPrice:ref.floorPrice,
    ceilingPrice:ref.ceilingPrice,
    referenceSource:ref.source,
    referenceVerified:currentIsPossible,
  };
}
