// legacy-webview source=core/navigation.js blob=33b5edfbde4339ea586b66036b81cfbc4074f329 esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
function normalizedDepth(state) {
  if ((state == null ? void 0 : state.appRoot) !== true) return 0;
  const value = Number(state.navDepth);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}
function normalizedView(value, fallback = "portfolio") {
  const view = String(value || "").trim();
  return view || fallback;
}
export function createRootNavigationState(view = "portfolio") {
  return {
    appRoot: true,
    view: normalizedView(view),
    navDepth: 0
  };
}
export function nextNavigationState(current, patch = {}) {
  const source = patch && typeof patch === "object" ? patch : {};
  const next = {
    appRoot: true,
    view: normalizedView(source.view, normalizedView(current == null ? void 0 : current.view)),
    navDepth: normalizedDepth(current) + 1
  };
  for (const key of ["sheet", "holdingId", "selectedTicker"]) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (value != null && value !== "") next[key] = value;
  }
  return next;
}
export function canHandleAppBack(state) {
  return (state == null ? void 0 : state.appRoot) === true && normalizedDepth(state) > 0;
}
