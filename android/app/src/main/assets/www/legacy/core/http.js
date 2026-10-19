// legacy-webview source=core/http.js blob=7ca9240b782abbafb917ece6b181c7047fa5c016 esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
let nativeRequestId = 0;
const nativePending = /* @__PURE__ */ new Map();
function installNativeCallbacks(win) {
  win.__nativeHttpResolve = (id, envelopeText) => {
    var _a;
    const pending = nativePending.get(String(id));
    if (!pending) return;
    nativePending.delete(String(id));
    clearTimeout(pending.timer);
    try {
      const envelope = JSON.parse(String(envelopeText || "{}"));
      if (!(envelope == null ? void 0 : envelope.ok)) pending.reject(new Error((envelope == null ? void 0 : envelope.error) || `HTTP ${(envelope == null ? void 0 : envelope.status) || 0}`));
      else pending.resolve(String((_a = envelope.body) != null ? _a : ""));
    } catch (e) {
      pending.reject(new Error("Android ağ yanıtı okunamadı."));
    }
  };
  win.__nativeHttpReject = (id, message) => {
    const pending = nativePending.get(String(id));
    if (!pending) return;
    nativePending.delete(String(id));
    clearTimeout(pending.timer);
    pending.reject(new Error(String(message || "Ağ isteği başarısız.")));
  };
}
function bridgeGetAsync(url) {
  const win = globalThis.window;
  const bridge = win == null ? void 0 : win.AndroidBridge;
  if (!(bridge == null ? void 0 : bridge.httpGetAsync)) return null;
  installNativeCallbacks(win);
  const id = `req-${Date.now()}-${++nativeRequestId}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      nativePending.delete(id);
      reject(new Error("İstek zaman aşımına uğradı."));
    }, 15e3);
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
  var _a, _b;
  const bridge = (_a = globalThis.window) == null ? void 0 : _a.AndroidBridge;
  if (!(bridge == null ? void 0 : bridge.httpGet)) return null;
  let envelope;
  try {
    envelope = JSON.parse(bridge.httpGet(String(url)));
  } catch (e) {
    throw new Error("Android ağ yanıtı okunamadı.");
  }
  if (!(envelope == null ? void 0 : envelope.ok)) throw new Error((envelope == null ? void 0 : envelope.error) || `HTTP ${(envelope == null ? void 0 : envelope.status) || 0}`);
  return String((_b = envelope.body) != null ? _b : "");
}
async function fetchGet(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12e3);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain,text/html,*/*",
        "accept-language": "tr-TR,tr;q=0.9,en;q=0.8"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if ((error == null ? void 0 : error.name) === "AbortError") throw new Error("İstek zaman aşımına uğradı.");
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
  } catch (e) {
    throw new Error("JSON yanıtı okunamadı.");
  }
}
