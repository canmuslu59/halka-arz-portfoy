import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'android/app/src/main/assets/www/app.js';
const stylesPath = 'android/app/src/main/assets/www/styles.css';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

let styles = readFileSync(stylesPath, 'utf8');
styles += `

/* Test-only add-sheet usability + repeated-purchase details. */
body.sheet-open #addFab{display:none!important}
#addForm{padding-bottom:6px}
#addSubmit{position:sticky;bottom:max(8px,calc(var(--keyboard-inset,0px) + 8px));z-index:6;box-shadow:0 12px 30px rgba(0,0,0,.28)}
.purchase-history{margin-top:14px}
.purchase-history-list{display:grid;gap:8px;margin-top:10px}
.purchase-history-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:9px;padding:10px 11px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.03);font-size:11px}
.purchase-history-row span{color:var(--muted)}
.purchase-history-row strong{font-size:12px}
.purchase-history-row b{font-variant-numeric:tabular-nums;font-size:12px}
html[data-theme="light"] .purchase-history-row{background:#f7f9fc;border-color:#dfe5ee}
`;
writeFileSync(stylesPath, styles);

let app = readFileSync(appPath, 'utf8');
app = replaceOnce(
  app,
  "function hideSheets() {\n  $('#sheetBackdrop').hidden = true;\n  $$('.sheet').forEach(sheet => { sheet.hidden = true; });\n  document.body.style.overflow = '';\n}",
  "function hideSheets() {\n  $('#sheetBackdrop').hidden = true;\n  $$('.sheet').forEach(sheet => { sheet.hidden = true; });\n  document.body.style.overflow = '';\n  document.body.classList.remove('sheet-open');\n}",
  'sheet closed class',
);
app = replaceOnce(
  app,
  "function showSheet(id) {\n  hideSheets();\n  $('#sheetBackdrop').hidden = false;\n  $(id).hidden = false;\n  document.body.style.overflow = 'hidden';\n}",
  "function showSheet(id) {\n  hideSheets();\n  $('#sheetBackdrop').hidden = false;\n  $(id).hidden = false;\n  document.body.style.overflow = 'hidden';\n  document.body.classList.add('sheet-open');\n}",
  'sheet open class',
);

app = replaceOnce(
  app,
  '<div class="detail-tile"><span>Alış fiyatı</span><strong>${money(h.ipoPrice)}</strong></div>',
  '<div class="detail-tile"><span>Ortalama alış</span><strong>${money(h.averagePurchasePrice ?? h.ipoPrice)}</strong></div>\n      <div class="detail-tile"><span>Mevcut maliyet</span><strong>${money(h.positionCost)}</strong></div>',
  'average purchase detail',
);

const warningNeedle = "    ${warnings.length ? `<div class=\"warning-box\">${warnings.map(esc).join('<br>')}</div>` : ''}";
const purchaseHistory = `    \${Array.isArray(h.purchases) && h.purchases.length
      ? '<div class="edit-box purchase-history"><h3>Alış geçmişi</h3><div class="purchase-history-list">' + h.purchases.slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(purchase =>
          '<div class="purchase-history-row"><span>' + trDate(purchase.date) + '</span><strong>' + purchase.lots + ' lot · ' + money(purchase.price) + '</strong><b>' + money(Number(purchase.lots) * Number(purchase.price)) + '</b></div>'
        ).join('') + '</div></div>'
      : ''}
    \${warnings.length ? \`<div class="warning-box">\${warnings.map(esc).join('<br>')}</div>\` : ''}`;
app = replaceOnce(app, warningNeedle, purchaseHistory, 'purchase history detail');

app = replaceOnce(
  app,
  '    toast(`\${result.holding.ticker} hissesi eklendi.`);',
  '    toast(result.merged ? `\${result.holding.ticker} alımı mevcut pozisyona eklendi.` : `\${result.holding.ticker} hissesi eklendi.`);',
  'merged purchase toast',
);

writeFileSync(appPath, app);
console.log('Applied add-sheet FAB/submit usability and repeated-purchase detail UI.');
