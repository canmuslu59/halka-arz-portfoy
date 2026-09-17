import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../android/app/src/main/assets/www/', import.meta.url);
const indexPath = new URL('index.html', root);
const appPath = new URL('app.js', root);
const stylesPath = new URL('styles.css', root);

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Stock detail polish anchor missing: ${label}`);
  return source.replace(before, after);
}

let html = readFileSync(indexPath, 'utf8');
const modalMarkup = `  <div id="deleteHoldingModal" class="delete-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="deleteHoldingConfirmTitle" hidden>
    <div class="delete-confirm-card">
      <div class="delete-confirm-icon" aria-hidden="true">!</div>
      <div class="delete-confirm-copy">
        <span class="eyebrow">PORTFÖY</span>
        <h3 id="deleteHoldingConfirmTitle">Hisseyi sil</h3>
        <p id="deleteHoldingConfirmText">Bu hisse portföyünden kaldırılacak.</p>
      </div>
      <div class="delete-confirm-actions">
        <button id="deleteHoldingCancel" class="secondary-btn" type="button">Vazgeç</button>
        <button id="deleteHoldingConfirm" class="danger-btn" type="button">Sil</button>
      </div>
    </div>
  </div>

`;
html = replaceOnce(
  html,
  '  <div id="toast" class="toast" role="status" aria-live="polite"></div>\n',
  `${modalMarkup}  <div id="toast" class="toast" role="status" aria-live="polite"></div>\n`,
  'delete modal markup',
);
writeFileSync(indexPath, html);

let app = readFileSync(appPath, 'utf8');
const deleteFunctions = `function closeDeleteHoldingConfirm() {
  const modal = $('#deleteHoldingModal');
  if (modal) modal.hidden = true;
}

function openDeleteHoldingConfirm() {
  if (!state.selected) return;
  const modal = $('#deleteHoldingModal');
  const text = $('#deleteHoldingConfirmText');
  if (text) text.textContent = \`${'${state.selected.ticker}'} portföyünden kaldırılsın mı?\`;
  if (modal) modal.hidden = false;
}

async function confirmDeleteHolding() {
  const selected = state.selected;
  if (!selected) {
    closeDeleteHoldingConfirm();
    return;
  }
  const button = $('#deleteHoldingConfirm');
  if (button) button.disabled = true;
  try {
    await service.deleteHolding(selected.id);
    closeDeleteHoldingConfirm();
    closeSheets();
    state.selected = null;
    await loadPortfolio({ quiet:true });
    toast('Hisse silindi.');
  } catch (error) {
    toast(error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function deleteHolding() {
  openDeleteHoldingConfirm();
}`;
const deleteBlock = /async function deleteHolding\(\) \{[\s\S]*?\n\}\n\nlet lookupTimer;/;
if (!app.includes('function openDeleteHoldingConfirm()')) {
  if (!deleteBlock.test(app)) throw new Error('Stock detail polish anchor missing: delete handler');
  app = app.replace(deleteBlock, `${deleteFunctions}\n\nlet lookupTimer;`);
}

const backdropBinding = `$('#sheetBackdrop').addEventListener('click', () => closeSheets());`;
const modalBindings = `${backdropBinding}
$('#deleteHoldingCancel')?.addEventListener('click', closeDeleteHoldingConfirm);
$('#deleteHoldingConfirm')?.addEventListener('click', confirmDeleteHolding);
$('#deleteHoldingModal')?.addEventListener('click', event => {
  if (event.target === event.currentTarget) closeDeleteHoldingConfirm();
});`;
app = replaceOnce(app, backdropBinding, modalBindings, 'delete modal bindings');

const hideSheetsStart = `function hideSheets() {
  $('#sheetBackdrop').hidden = true;`;
const hideSheetsWithModal = `function hideSheets() {
  closeDeleteHoldingConfirm();
  $('#sheetBackdrop').hidden = true;`;
app = replaceOnce(app, hideSheetsStart, hideSheetsWithModal, 'sheet close integration');
writeFileSync(appPath, app);

let styles = readFileSync(stylesPath, 'utf8');
const marker = '/* Test-only stock detail modal polish */';
if (!styles.includes(marker)) {
  styles += `\n\n${marker}
.sheet-backdrop{z-index:79}
.sheet{z-index:80}
.detail-sheet{padding-bottom:max(30px,env(safe-area-inset-bottom),calc(var(--android-safe-bottom,0px) + 20px))}
.delete-confirm-overlay{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:20px max(20px,var(--android-safe-right,0px)) max(20px,calc(var(--android-safe-bottom,0px) + 8px)) max(20px,var(--android-safe-left,0px));background:rgba(2,6,15,.74);backdrop-filter:blur(10px)}
.delete-confirm-overlay[hidden]{display:none}
.delete-confirm-card{width:min(100%,360px);border:1px solid rgba(255,255,255,.1);border-radius:22px;background:linear-gradient(160deg,#151e32,#0d1425);box-shadow:0 24px 70px rgba(0,0,0,.42);padding:20px}
.delete-confirm-icon{display:grid;place-items:center;width:42px;height:42px;margin-bottom:14px;border-radius:14px;background:rgba(255,107,120,.12);border:1px solid rgba(255,107,120,.22);color:#ff7c87;font-size:22px;font-weight:900}
.delete-confirm-copy{display:grid;gap:6px}.delete-confirm-copy h3{margin:0;color:#f4f7ff;font-size:20px;line-height:1.2}.delete-confirm-copy p{margin:0;color:#8f9bb0;font-size:13px;line-height:1.5}
.delete-confirm-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.delete-confirm-actions button{min-height:50px}.delete-confirm-actions .danger-btn{background:rgba(255,107,120,.16);border:1px solid rgba(255,107,120,.32);color:#ff7c87}
html[data-theme="light"] .delete-confirm-overlay{background:rgba(20,29,45,.42)}
html[data-theme="light"] .delete-confirm-card{background:#fff;border-color:rgba(22,37,63,.12);box-shadow:0 24px 70px rgba(41,57,83,.24)}
html[data-theme="light"] .delete-confirm-copy h3{color:#22324e}html[data-theme="light"] .delete-confirm-copy p{color:#66758c}
`;
}
writeFileSync(stylesPath, styles);
