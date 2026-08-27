function bridgeGet(url) {
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
  const native = bridgeGet(url);
  if (native !== null) return native;
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
