import { readFileSync, writeFileSync } from 'node:fs';

const indexPath = 'android/app/src/main/assets/www/index.html';
const appPath = 'android/app/src/main/assets/www/app.js';
const stylesPath = 'android/app/src/main/assets/www/styles.css';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

let index = readFileSync(indexPath, 'utf8');

// Keep the IPO calendar contract intact; only generalize the user's stock/holding flow.
for (const marker of ['calendarRefreshBtn', 'calendarStatus', 'calendarFilter', 'calendarList']) {
  if (!index.includes(marker)) throw new Error(`IPO calendar contract missing: ${marker}`);
}

index = replaceOnce(index, '<h2>Halka arzlar</h2>', '<h2>Hisselerim</h2>', 'holdings heading');
index = replaceOnce(index, '<h2 id="addTitle">Halka arz ekle</h2>', '<h2 id="addTitle">Hisse ekle</h2>', 'add sheet heading');

const oldAddFields = `      <label>
        <span>Elinizdeki lot</span>
        <input id="lotsInput" name="lots" inputmode="numeric" type="number" min="1" step="1" placeholder="Örn. 24" required />
      </label>
      <div id="lookupPreview" class="lookup-preview" hidden></div>
      <button id="addSubmit" class="primary-btn" type="submit">Otomatik bul ve ekle</button>`;

const newAddFields = `      <label>
        <span>Elinizdeki lot</span>
        <input id="lotsInput" name="lots" inputmode="numeric" type="number" min="1" step="1" placeholder="Örn. 24" required />
      </label>
      <label>
        <span>Alış fiyatı</span>
        <input id="purchasePriceInput" name="purchasePrice" inputmode="decimal" type="number" min="0.01" step="0.01" placeholder="Örn. 42,50" required />
      </label>
      <label>
        <span>Alış tarihi</span>
        <input id="purchaseDateInput" name="purchaseDate" type="date" required />
      </label>
      <label class="ipo-purchase-option">
        <input id="ipoPurchaseCheck" name="ipoPurchase" type="checkbox" />
        <span class="ipo-purchase-copy">
          <strong>Halka arzdan aldım</strong>
          <small>İşaretlersen halka arz fiyatı ve ilk işlem tarihi otomatik doldurulmaya çalışılır.</small>
        </span>
      </label>
      <div id="lookupPreview" class="lookup-preview" hidden></div>
      <button id="addSubmit" class="primary-btn" type="submit">Hisseyi ekle</button>`;

index = replaceOnce(index, oldAddFields, newAddFields, 'purchase-first add fields');
writeFileSync(indexPath, index);

let styles = readFileSync(stylesPath, 'utf8');
styles += `

/* Test-only general stock-entry flow. */
.ipo-purchase-option{display:flex!important;grid-template-columns:auto 1fr!important;align-items:flex-start;gap:11px!important;padding:12px 13px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.035);cursor:pointer}
.ipo-purchase-option>input{width:20px!important;height:20px!important;min-width:20px;margin:1px 0 0;padding:0;accent-color:#6d8dff;box-shadow:none!important}
.ipo-purchase-copy{display:grid;gap:3px;line-height:1.25}
.ipo-purchase-copy strong{font-size:12px;color:var(--text)}
.ipo-purchase-copy small{font-size:10px;line-height:1.4;color:var(--muted);font-weight:500}
#portfolioView,#holdingsView{padding-bottom:82px}
#addFab{
  right:max(14px,calc(var(--android-safe-right,0px) + 14px));
  bottom:max(
    calc(env(safe-area-inset-bottom) + 98px),
    calc(var(--android-safe-bottom,0px) + var(--dock-height,64px) + var(--dock-control-gap,22px) + 16px)
  );
}
html[data-theme="light"] .ipo-purchase-option{background:#f7f9fc;border-color:#dfe5ee}
html[data-theme="light"] .ipo-purchase-copy strong{color:#25324a}
@media(max-width:365px){
  #addFab{width:auto;min-width:56px;padding:0 14px;border-radius:17px}
  #addFab b{display:inline}
}
`;
writeFileSync(stylesPath, styles);

let app = readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  "if ($('#addFab')) $('#addFab').hidden = next !== 'holdings';",
  "if ($('#addFab')) $('#addFab').hidden = !['portfolio','holdings'].includes(next);",
  'wallet and holdings FAB visibility'
);

app = replaceOnce(
  app,
  "  $('.ipo-price',node).textContent = `Arz: ${money(h.ipoPrice)}`;\n  $('.trade-date',node).textContent = h.firstTradeDate ? `İlk işlem: ${trDate(h.firstTradeDate)}` : 'İlk işlem tarihi: —';",
  "  $('.ipo-price',node).textContent = `Alış fiyatı: ${money(h.ipoPrice)}`;\n  $('.trade-date',node).textContent = h.firstTradeDate ? `Alış tarihi: ${trDate(h.firstTradeDate)}` : 'Alış tarihi: —';",
  'holding purchase labels'
);

app = replaceOnce(
  app,
  '<div class="detail-tile"><span>Halka arz fiyatı</span><strong>${money(h.ipoPrice)}</strong></div>',
  '<div class="detail-tile"><span>Alış fiyatı</span><strong>${money(h.ipoPrice)}</strong></div>',
  'detail purchase price label'
);

app = replaceOnce(
  app,
  '<input name="ipoPriceOverride" type="number" min="0.01" step="0.01" value="${h.ipoPrice ?? \'\'}" placeholder="Halka arz fiyatı">',
  '<input name="ipoPriceOverride" type="number" min="0.01" step="0.01" value="${h.ipoPrice ?? \'\'}" placeholder="Alış fiyatı">',
  'detail edit purchase price'
);

app = replaceOnce(
  app,
  '<input name="firstTradeDateOverride" type="date" value="${h.firstTradeDate ?? \'\'}">',
  '<input name="firstTradeDateOverride" type="date" value="${h.firstTradeDate ?? \'\'}" aria-label="Alış tarihi">',
  'detail edit purchase date'
);

const resetStart = 'function resetAddEntryForm() {';
const resetEnd = '\n}\n\nfunction openAddSheet';
const resetStartIndex = app.indexOf(resetStart);
const resetEndIndex = app.indexOf(resetEnd, resetStartIndex);
if (resetStartIndex < 0 || resetEndIndex < 0) throw new Error('reset add form boundary not found');
const newReset = `function resetAddEntryForm() {
  lookupGeneration += 1;
  clearTimeout(lookupTimer);
  const form = $('#addForm');
  if (form) form.reset();
  const purchaseDate = $('#purchaseDateInput');
  if (purchaseDate) purchaseDate.value = todayIstanbul();
  const preview = $('#lookupPreview');
  if (preview) { preview.hidden = true; preview.textContent = ''; }
}`;
app = app.slice(0, resetStartIndex) + newReset + app.slice(resetEndIndex + 2);

const tickerStart = app.indexOf("$('#tickerInput').addEventListener('input', () => {");
const submitStart = app.indexOf("\n\n$('#addForm').addEventListener('submit', async event => {", tickerStart);
if (tickerStart < 0 || submitStart < 0) throw new Error('ticker lookup boundary not found');
const newTickerLookup = `$('#tickerInput').addEventListener('input', () => {
  clearTimeout(lookupTimer);
  const generation = ++lookupGeneration;
  const ticker = $('#tickerInput').value.trim().toUpperCase();
  const preview = $('#lookupPreview');
  if (!ticker) {
    preview.hidden = true;
    preview.textContent = '';
    return;
  }
  preview.hidden = false;
  preview.textContent = 'Hisse kontrol ediliyor…';
  lookupTimer = setTimeout(async () => {
    try {
      const result = await service.lookup(ticker);
      if (generation !== lookupGeneration || $('#tickerInput').value.trim().toUpperCase() !== ticker) return;
      const current = result.market?.current;
      const ipoPurchase = $('#ipoPurchaseCheck');
      if (!ipoPurchase?.checked) {
        preview.innerHTML = \`<b>\${esc(result.ticker)}</b> · Güncel \${money(current)}<br>Alış fiyatı ve tarihini girerek hisseyi ekleyebilirsiniz.\`;
        return;
      }
      const ipoPrice = result.ipo?.ipoPrice;
      const ipoDate = result.ipo?.firstTradeDate;
      const priceInput = $('#purchasePriceInput');
      const dateInput = $('#purchaseDateInput');
      if (ipoPrice && priceInput) priceInput.value = String(ipoPrice);
      if (ipoDate && dateInput) dateInput.value = String(ipoDate);
      preview.innerHTML = ipoPrice
        ? \`<b>\${esc(result.ticker)}</b> · Güncel \${money(current)}<br>Halka arz bilgisi bulundu: \${money(ipoPrice)}\${ipoDate ? \` · \${trDate(ipoDate)}\` : ''}\`
        : \`<b>\${esc(result.ticker)}</b> · Güncel \${money(current)}<br>Halka arz bilgisi otomatik bulunamadı; alış bilgilerini elle girebilirsiniz.\`;
    } catch (error) {
      if (generation === lookupGeneration) preview.textContent = error.message;
    }
  }, 450);
});
$('#ipoPurchaseCheck')?.addEventListener('change', () => {
  $('#tickerInput')?.dispatchEvent(new Event('input', { bubbles:true }));
});`;
app = app.slice(0, tickerStart) + newTickerLookup + app.slice(submitStart);

const addSubmitStart = app.indexOf("$('#addForm').addEventListener('submit', async event => {");
const chartStart = app.indexOf('\nfunction chartWindow()', addSubmitStart);
if (addSubmitStart < 0 || chartStart < 0) throw new Error('add submit boundary not found');
const newAddSubmit = `$('#addForm').addEventListener('submit', async event => {
  event.preventDefault();
  const addForm = event.currentTarget;
  if (addForm.dataset.saving === 'true') return;
  addForm.dataset.saving = 'true';
  const btn = $('#addSubmit');
  const form = new FormData(addForm);
  const purchasePrice = Number(form.get('purchasePrice'));
  const purchaseDate = String(form.get('purchaseDate') || '');
  btn.disabled = true;
  btn.textContent = 'Ekleniyor…';
  try {
    if (!(purchasePrice > 0) || !purchaseDate) throw new Error('Alış fiyatı ve alış tarihi gerekli.');
    const result = await service.addHolding({
      ticker:form.get('ticker'),
      lots:Number(form.get('lots')),
      ipoPriceOverride: purchasePrice,
      firstTradeDateOverride: purchaseDate,
    });
    closeSheets();
    addForm.reset();
    const purchaseDateInput = $('#purchaseDateInput');
    if (purchaseDateInput) purchaseDateInput.value = todayIstanbul();
    $('#lookupPreview').hidden = true;
    await loadPortfolio({ quiet:true });
    toast(\`\${result.holding.ticker} hissesi eklendi.\`);
  } catch (error) {
    toast(error.message);
  } finally {
    addForm.dataset.saving = 'false';
    btn.disabled = false;
    btn.textContent = 'Hisseyi ekle';
  }
});
`;
app = app.slice(0, addSubmitStart) + newAddSubmit + app.slice(chartStart);

writeFileSync(appPath, app);

console.log('Applied isolated general stock-entry + wallet/holdings FAB overlay.');
