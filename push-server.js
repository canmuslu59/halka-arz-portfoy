import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPortfolioStore } from './backend/portfolio-store.js';
import { createPushService } from './backend/service.js';
import { createFcmSender } from './backend/fcm-sender.js';
import { getBistMarketStatus } from './public/core/market-calendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const PUSH_DATA_FILE = process.env.PUSH_DATA_FILE
  ? path.resolve(process.env.PUSH_DATA_FILE)
  : path.join(__dirname, 'data', 'push.json');
const requestedPollMs = Number(process.env.PUSH_POLL_INTERVAL_MS || 60_000);
const PUSH_POLL_INTERVAL_MS = Number.isFinite(requestedPollMs) ? Math.max(60_000, requestedPollMs) : 60_000;
const ANDROID_FALLBACK_MINUTES = 15;

function dateInIstanbul(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Istanbul',
    year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

async function fetchYahooQuote(ticker) {
  const key = String(ticker || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (!key) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(`${key}.IS`)}?range=5d&interval=1m&includePrePost=false&events=div%2Csplits`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal:controller.signal,
      headers:{
        'user-agent':'Mozilla/5.0 Chrome/154 Safari/537.36',
        accept:'application/json,text/plain,*/*',
      },
    });
    if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta || {};
    const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
    const current = Number(meta.regularMarketPrice);
    const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose);
    const lastTimestamp = Number(meta.regularMarketTime || timestamps.at(-1));
    const latestMarketDate = Number.isFinite(lastTimestamp) && lastTimestamp > 0
      ? dateInIstanbul(new Date(lastTimestamp * 1000))
      : null;
    return {
      ticker:key,
      current:Number.isFinite(current) ? current : null,
      previousClose:Number.isFinite(previousClose) ? previousClose : null,
      latestMarketDate,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 131_072) {
      const error = new Error('İstek çok büyük.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  if (!bytes) return {};
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } catch {
    const error = new Error('Geçersiz JSON gövdesi.');
    error.statusCode = 400;
    throw error;
  }
}

const store = createPortfolioStore({ filePath:PUSH_DATA_FILE });
const sender = createFcmSender();
const service = createPushService({
  store,
  sender,
  dataSources:{
    getQuote:fetchYahooQuote,
    getIpoCalendar:async () => [],
  },
});

const runtime = {
  running:false,
  lastStartedAt:null,
  lastFinishedAt:null,
  lastStatus:'not_run',
  lastResult:null,
};

async function runMarketCheck() {
  if (runtime.running) return;
  runtime.running = true;
  runtime.lastStartedAt = new Date().toISOString();
  try {
    if (!getBistMarketStatus(new Date()).isOpen) {
      runtime.lastStatus = 'market_closed';
      runtime.lastResult = null;
      return;
    }
    runtime.lastResult = await service.marketCheck();
    runtime.lastStatus = 'checked';
  } catch (error) {
    runtime.lastStatus = 'error';
    runtime.lastResult = { error:String(error?.message || error) };
    console.error('Push market check failed:', error);
  } finally {
    runtime.lastFinishedAt = new Date().toISOString();
    runtime.running = false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const method = req.method || 'GET';

    if (method === 'GET' && url.pathname === '/api/health') {
      const snapshot = await store.read();
      const installationCount = Object.keys(snapshot?.installations || {}).length;
      return json(res, 200, {
        ok:true,
        now:new Date().toISOString(),
        push:{
          pollIntervalMs:PUSH_POLL_INTERVAL_MS,
          androidFallbackMinutes:ANDROID_FALLBACK_MINUTES,
          fcmConfigured:sender.configured,
          dryRun:sender.dryRun,
          installationCount,
          runtime,
        },
      });
    }

    if (method === 'POST' && url.pathname === '/v1/installations') {
      const registered = await service.register(await readJson(req));
      return json(res, 200, {
        installId:registered.installId,
        enabled:registered.enabled,
        threshold:registered.threshold,
        ipoEnabled:registered.ipoEnabled,
        holdings:registered.holdings,
        updatedAt:registered.updatedAt,
      });
    }

    return json(res, 404, { error:'NOT_FOUND' });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
    return json(res, status, { error:String(error?.message || 'İstek işlenemedi.') });
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;

const timer = setInterval(runMarketCheck, PUSH_POLL_INTERVAL_MS);
timer.unref();
setTimeout(runMarketCheck, 1_000).unref();

server.on('close', () => clearInterval(timer));
server.listen(PORT, '0.0.0.0', () => console.log(`Push backend: http://localhost:${PORT}`));
