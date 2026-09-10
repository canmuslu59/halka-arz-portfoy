import fs from 'node:fs';

const mode = process.env.FETCH_STUB_MODE || 'outage';
const logFile = process.env.FETCH_STUB_LOG;

function record(url) {
  if (logFile) fs.appendFileSync(logFile, `${String(url)}\n`, 'utf8');
}

function marketJson() {
  return {
    chart: {
      result: [{
        meta: {
          currency: 'TRY',
          chartPreviousClose: 9,
          regularMarketPrice: 10,
          regularMarketTime: 1789050000,
          fullExchangeName: 'Borsa Istanbul',
        },
        timestamp: [1788963600, 1789050000],
        indicators: {
          quote: [{
            open: [9, 9.5],
            high: [9.5, 10.2],
            low: [8.8, 9.4],
            close: [9, 10],
          }],
        },
      }],
    },
  };
}

globalThis.fetch = async function stubFetch(input) {
  const url = String(input);
  if (url.includes('query1.finance.yahoo.com')) {
    return {
      ok: true,
      status: 200,
      async json() { return marketJson(); },
      async text() { return JSON.stringify(marketJson()); },
    };
  }

  record(url);
  if (mode === 'empty') {
    return {
      ok: true,
      status: 200,
      async text() { return '<html><body><table></table></body></html>'; },
      async json() { return {}; },
    };
  }

  return {
    ok: false,
    status: 503,
    async text() { return 'temporary outage'; },
    async json() { return {}; },
  };
};
