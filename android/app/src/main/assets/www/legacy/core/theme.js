// legacy-webview source=core/theme.js blob=07e6ab97f7f29a6267aa048ad3c417e2f34cdb95 esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
export function resolveTheme(savedTheme, prefersDark = false) {
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return prefersDark ? "dark" : "light";
}
export function nextTheme(theme) {
  return theme === "dark" ? "light" : "dark";
}
