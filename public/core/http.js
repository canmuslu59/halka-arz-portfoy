let nativeRequestId = 0;
const nativePending = new Map();

function installNativeCallbacks(win) {
  win.__nativeHttpResolve = (id, envelopeText) => {
    const pending = nativePending.get(String(id));
    if (!pending) return;
    nativePending.delete(String(id));
    clearTimeout(pending.timer);
    try {
      const envelope = JSON.parse(String(envelopeText || '{}'));
      if (!envelope?.ok) pending.reject(new Error(envelope?.error || `HTTP ${envelope?.status || 0}`));
      else pending.resolve(String(envelope.body ?? ''));
    } catch {
      pending.reject(new Error('Android ağ yanıtı okunamadı.'));
    }
  };
  win.__nativeHttpReject = (id, message) => {
    const pending = nativePending.get(String(id));
    if (!pending) return;
    nativePending.delete(String(id));
    clearTimeout(pending.timer);
    pending.reject(new Error(String(message || 'Ağ isteği başarısız.')));
  };
}

function bridgeGetAsync(url) {
  const win = globalThis.window;
  const bridge = win?.AndroidBridge;
  if (!bridge?.httpGetAsync) return null;
  installNativeCallbacks(win);
  const id = `req-${Date.now()}-${++nativeRequestId}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      nativePending.delete(id);
      reject(new Error('İstek zaman aşımına uğradı.'));
    }, 15_000);
    nativePending.set(id, { resolve, reject, timer });
    try {
      bridge.httpGetAsync(String(url), id);
    } catch (error) {
      clearTimeout(timer);
      nativePending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function bridgeGetLegacy(url) {
  const bridge = globalThis.window?.AndroidBridge;
  if (!bridge?.httpGet) return null;
  let envelope;
  try {
    envelope = JSON.parse(bridge.httpGet(String(url)));
  } catch {
    throw new Error('Android ağ yanıtı okunamadı.');
  }
  if (!envelope?.ok) throw new Error(envelope?.error || `HTTP ${envelope?.status || 0}`);
  return String(envelope.body ?? '');
}

async function fetchGet(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,text/html,*/*',
        'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('İstek zaman aşımına uğradı.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function httpGetText(url) {
  const asyncNative = bridgeGetAsync(url);
  if (asyncNative !== null) return asyncNative;
  const legacyNative = bridgeGetLegacy(url);
  if (legacyNative !== null) return legacyNative;
  return fetchGet(url);
}

export async function httpGetJson(url) {
  const text = await httpGetText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('JSON yanıtı okunamadı.');
  }
}
