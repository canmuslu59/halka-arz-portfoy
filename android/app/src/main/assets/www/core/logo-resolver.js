const OFFICIAL_FAVICONS = {
  ASELS:'https://www.aselsan.com/favicon.ico',
  THYAO:'https://www.turkishairlines.com/favicon.ico',
  KCHOL:'https://www.koc.com.tr/favicon.ico',
  TUPRS:'https://www.tupras.com.tr/favicon.ico',
  EKGYO:'https://www.emlakkonut.com.tr/favicon.ico',
  BIMAS:'https://www.bim.com.tr/favicon.ico',
  MGROS:'https://www.migroskurumsal.com/favicon.ico',
  AKBNK:'https://www.akbank.com/favicon.ico',
  GARAN:'https://www.garantibbva.com.tr/favicon.ico',
  YKBNK:'https://www.yapikredi.com.tr/favicon.ico',
  SAHOL:'https://www.sabanci.com/favicon.ico',
  SISE:'https://www.sisecam.com/favicon.ico',
  FROTO:'https://www.fordotosan.com.tr/favicon.ico',
  TOASO:'https://www.tofas.com.tr/favicon.ico',
  TCELL:'https://www.turkcell.com.tr/favicon.ico',
  TTKOM:'https://www.turktelekom.com.tr/favicon.ico',
};

function cleanTicker(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function stockMonogram(value) {
  const ticker = cleanTicker(value);
  return ticker.slice(0, 3) || '?';
}

export function resolveStockLogo(value) {
  const ticker = cleanTicker(value);
  return {
    ticker,
    url:OFFICIAL_FAVICONS[ticker] || null,
    monogram:stockMonogram(ticker),
  };
}

export function renderStockLogoHtml(value, { size = 'md' } = {}) {
  const logo = resolveStockLogo(value);
  const safeTicker = logo.ticker.replace(/[^A-Z0-9]/g, '');
  const fallback = `<span class="stock-logo-fallback">${logo.monogram}</span>`;
  if (!logo.url) return `<span class="stock-logo stock-logo-${size}" data-logo-ticker="${safeTicker}">${fallback}</span>`;
  return `<span class="stock-logo stock-logo-${size}" data-logo-ticker="${safeTicker}"><img src="${logo.url}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="stock-logo-fallback" hidden>${logo.monogram}</span></span>`;
}
