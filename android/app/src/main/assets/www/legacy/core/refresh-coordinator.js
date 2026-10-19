// legacy-webview source=core/refresh-coordinator.js blob=413c4bc24383af73d360c6fc89a873036869ec4b esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
export function createRefreshGate() {
  let active = null;
  let queuedForce = null;
  function start(task, force) {
    let promise;
    try {
      promise = Promise.resolve(task({ force }));
    } catch (error) {
      promise = Promise.reject(error);
    }
    const entry = { promise, force };
    active = entry;
    const clearActive = () => {
      if (active === entry) active = null;
    };
    promise.then(clearActive, clearActive);
    return promise;
  }
  function run(task, { force = false } = {}) {
    if (typeof task !== "function") return Promise.reject(new TypeError("refresh task gerekli."));
    const wantsForce = Boolean(force);
    if (!active) return start(task, wantsForce);
    if (!wantsForce || active.force) return active.promise;
    if (!queuedForce) {
      const current = active.promise;
      const queued = current.catch(() => void 0).then(() => start(task, true));
      queuedForce = queued;
      const clearQueued = () => {
        if (queuedForce === queued) queuedForce = null;
      };
      queued.then(clearQueued, clearQueued);
    }
    return queuedForce;
  }
  return Object.freeze({ run });
}
