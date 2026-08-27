const STORAGE_KEY = 'halka_arz_portfolio_v1';

export function createRepository(storage) {
  if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
    throw new TypeError('Geçerli bir storage adapter gerekli.');
  }
  return {
    async load() {
      try {
        const raw = await storage.get();
        if (!raw) return { holdings: [] };
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return { holdings: [] };
        if (!Array.isArray(data.holdings)) data.holdings = [];
        return data;
      } catch {
        return { holdings: [] };
      }
    },
    async save(data) {
      const safe = data && typeof data === 'object' ? { ...data } : { holdings: [] };
      if (!Array.isArray(safe.holdings)) safe.holdings = [];
      await storage.set(JSON.stringify(safe));
      return safe;
    },
  };
}

export function createPlatformStorage() {
  const bridge = globalThis.window?.AndroidBridge;
  if (bridge?.readPortfolio && bridge?.writePortfolio) {
    return {
      get: async () => bridge.readPortfolio() || null,
      set: async value => { bridge.writePortfolio(String(value)); },
    };
  }
  return {
    get: async () => globalThis.localStorage?.getItem(STORAGE_KEY) ?? null,
    set: async value => globalThis.localStorage?.setItem(STORAGE_KEY, String(value)),
  };
}
