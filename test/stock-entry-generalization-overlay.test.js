import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overlay = readFileSync(new URL('../scripts/apply-test-portfolio-app-navigation.mjs', import.meta.url), 'utf8');

test('stock add form is purchase-first with optional IPO assistance', () => {
  assert.match(overlay, /Hisse ekle/);
  assert.match(overlay, /id="purchasePriceInput"/);
  assert.match(overlay, /name="purchasePrice"/);
  assert.match(overlay, /Alış fiyatı/);
  assert.match(overlay, /id="purchaseDateInput"/);
  assert.match(overlay, /name="purchaseDate"/);
  assert.match(overlay, /Alış tarihi/);
  assert.match(overlay, /id="ipoPurchaseCheck"/);
  assert.match(overlay, /Halka arzdan aldım/);
  assert.match(overlay, /purchaseDate\.value = todayIstanbul\(\)/);
});

test('stock add submits purchase cost and date through existing calculation fields', () => {
  assert.match(overlay, /const purchasePrice = Number\(form\.get\('purchasePrice'\)\)/);
  assert.match(overlay, /const purchaseDate = String\(form\.get\('purchaseDate'\)/);
  assert.match(overlay, /ipoPriceOverride:\s*purchasePrice/);
  assert.match(overlay, /firstTradeDateOverride:\s*purchaseDate/);
  assert.match(overlay, /hissesi eklendi/);
  assert.match(overlay, /btn\.textContent = 'Hisseyi ekle'/);
});

test('stock-facing labels use purchase language while IPO market calendar stays intact', () => {
  assert.match(overlay, /<h2>Hisselerim<\/h2>/);
  assert.match(overlay, /Alış fiyatı:/);
  assert.match(overlay, /Alış tarihi:/);
  assert.match(overlay, /<span>Alış fiyatı<\/span>/);
  assert.match(overlay, /placeholder="Alış fiyatı"/);
  assert.match(overlay, /calendarRefreshBtn/);
  assert.match(overlay, /calendarList/);
});

test('add stock FAB is visible on Wallet and Holdings and remains above the floating dock', () => {
  assert.match(overlay, /!\['portfolio','holdings'\]\.includes\(next\)/);
  assert.match(overlay, /#addFab/);
  assert.match(overlay, /--dock-height/);
  assert.match(overlay, /--dock-control-gap/);
});

test('IPO checkbox only triggers automatic IPO fill when explicitly selected', () => {
  assert.match(overlay, /ipoPurchaseCheck/);
  assert.match(overlay, /if \(!ipoPurchase\?\.checked\)/);
  assert.match(overlay, /result\.ipo\?\.ipoPrice/);
  assert.match(overlay, /result\.ipo\?\.firstTradeDate/);
});
