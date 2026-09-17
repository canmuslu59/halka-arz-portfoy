import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const wrapper = read('../scripts/apply-test-portfolio-app-navigation.mjs');
const polishUrl = new URL('../scripts/apply-test-stock-detail-polish.mjs', import.meta.url);
const polish = existsSync(polishUrl) ? readFileSync(polishUrl, 'utf8') : '';

test('stock detail polish is isolated and applied last', () => {
  assert.match(wrapper, /apply-test-news-notification-route\.mjs[\s\S]*apply-test-stock-detail-polish\.mjs/);
});

test('detail sheet and backdrop render above the floating dock', () => {
  assert.match(polish, /\.sheet-backdrop\{[^}]*z-index:(?:7[3-9]|[89]\d|\d{3,})/s);
  assert.match(polish, /\.sheet\{[^}]*z-index:(?:7[3-9]|[89]\d|\d{3,})/s);
});

test('custom delete confirmation replaces the browser confirm dialog', () => {
  assert.match(polish, /id="deleteHoldingModal"/);
  assert.match(polish, /id="deleteHoldingConfirmTitle"[^>]*>Hisseyi sil</);
  assert.match(polish, /id="deleteHoldingCancel"[^>]*>Vazgeç</);
  assert.match(polish, /id="deleteHoldingConfirm"[^>]*>Sil</);
  assert.match(polish, /function openDeleteHoldingConfirm\(/);
  assert.doesNotMatch(polish, /\bconfirm\s*\(/);
});

test('delete confirmation uses the selected ticker in a friendly in-app message', () => {
  assert.match(polish, /deleteHoldingConfirmText/);
  assert.match(polish, /state\.selected\.ticker/);
  assert.match(polish, /portföyünden kaldırılsın mı\?/);
});

test('confirmed deletion preserves the existing service and reload behavior', () => {
  assert.match(polish, /service\.deleteHolding\(selected\.id\)/);
  assert.match(polish, /closeSheets\(\)/);
  assert.match(polish, /state\.selected = null/);
  assert.match(polish, /loadPortfolio\(\{ quiet:true \}\)/);
  assert.match(polish, /Hisse silindi\./);
});

test('delete confirmation has explicit cancel, confirm and backdrop-close bindings', () => {
  assert.match(polish, /deleteHoldingCancel[^\n]*addEventListener\(['"]click['"]/);
  assert.match(polish, /deleteHoldingConfirm[^\n]*addEventListener\(['"]click['"]/);
  assert.match(polish, /event\.target === event\.currentTarget/);
});

test('custom delete card follows the app theme and destructive action styling', () => {
  assert.match(polish, /\.delete-confirm-overlay\{/);
  assert.match(polish, /z-index:(?:8\d|9\d|\d{3,})/);
  assert.match(polish, /\.delete-confirm-card\{/);
  assert.match(polish, /\.delete-confirm-actions/);
  assert.match(polish, /html\[data-theme="light"\] \.delete-confirm-card/);
});
