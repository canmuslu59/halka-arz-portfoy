// legacy-webview source=core/repository.js blob=f7adec390e115458950c1b82bcd48020828503eb esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
const STORAGE_KEY = "halka_arz_portfolio_v1";
export function createRepository(storage) {
  if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") {
    throw new TypeError("Geçerli bir storage adapter gerekli.");
  }
  return {
    async load() {
      try {
        const raw = await storage.get();
        if (!raw) return { holdings: [] };
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object") return { holdings: [] };
        if (!Array.isArray(data.holdings)) data.holdings = [];
        return data;
      } catch (e) {
        return { holdings: [] };
      }
    },
    async save(data) {
      const safe = data && typeof data === "object" ? { ...data } : { holdings: [] };
      if (!Array.isArray(safe.holdings)) safe.holdings = [];
      await storage.set(JSON.stringify(safe));
      return safe;
    }
  };
}
export function createPlatformStorage() {
  var _a;
  const bridge = (_a = globalThis.window) == null ? void 0 : _a.AndroidBridge;
  if ((bridge == null ? void 0 : bridge.readPortfolio) && (bridge == null ? void 0 : bridge.writePortfolio)) {
    return {
      get: async () => bridge.readPortfolio() || null,
      set: async (value) => {
        if (bridge.writePortfolio(String(value)) === false) throw new Error("Kayıt diske yazılamadı. Tekrar deneyin.");
      }
    };
  }
  return {
    get: async () => {
      var _a2, _b;
      return (_b = (_a2 = globalThis.localStorage) == null ? void 0 : _a2.getItem(STORAGE_KEY)) != null ? _b : null;
    },
    set: async (value) => {
      var _a2;
      return (_a2 = globalThis.localStorage) == null ? void 0 : _a2.setItem(STORAGE_KEY, String(value));
    }
  };
}
