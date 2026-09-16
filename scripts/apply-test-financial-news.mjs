import { readFileSync, writeFileSync } from 'node:fs';

const indexPath = 'android/app/src/main/assets/www/index.html';
const appPath = 'android/app/src/main/assets/www/app.js';
const stylesPath = 'android/app/src/main/assets/www/styles.css';
const NEWS_BACKEND_URL = 'https://halka-arz-portfoy-news-test.grass-airboat.workers.dev';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

let index = readFileSync(indexPath, 'utf8');
const marketsStart = index.indexOf('    <section id="marketsView" class="app-view" hidden>');
const proStart = index.indexOf('    <section id="proView" class="app-view" hidden>', marketsStart);
if (marketsStart < 0 || proStart < 0) throw new Error('markets/pro view boundary not found');
const newsView = `    <section id="marketsView" class="app-view news-view" hidden>
      <section class="view-hero news-hero">
        <div><span class="eyebrow">FİNANSAL</span><h2>Haberler</h2></div>
        <button id="newsRefreshBtn" class="secondary-btn compact-btn" type="button">Yenile</button>
      </section>
      <div id="newsFilters" class="news-filters" role="tablist" aria-label="Haber kategorileri">
        <button class="news-filter active" data-news-category="" type="button">Tümü</button>
        <button class="news-filter" data-news-category="borsa" type="button">Borsa</button>
        <button class="news-filter" data-news-category="sirketler" type="button">Şirketler</button>
        <button class="news-filter" data-news-category="doviz" type="button">Döviz</button>
        <button class="news-filter" data-news-category="altin" type="button">Altın</button>
        <button class="news-filter" data-news-category="ekonomi" type="button">Ekonomi</button>
        <button class="news-filter" data-news-category="halka-arz" type="button">Halka Arz</button>
      </div>
      <div id="newsStatus" class="muted small news-status">Haberler yükleniyor…</div>
      <div id="newsList" class="news-list" aria-live="polite"></div>
    </section>

`;
index = index.slice(0, marketsStart) + newsView + index.slice(proStart);
index = replaceOnce(
  index,
  `    <button id="marketsTab" class="nav-tab" data-view="markets" type="button"><span>⌁</span><b>Piyasalar</b></button>`,
  `    <button id="marketsTab" class="nav-tab" data-view="markets" type="button"><span>▤</span><b>Haberler</b></button>`,
  'markets navigation label'
);
writeFileSync(indexPath, index);

let styles = readFileSync(stylesPath, 'utf8');
styles += `

/* Test-only finance news experience. */
.news-view{display:grid;gap:12px;align-content:start;padding-bottom:14px}
.news-view[hidden]{display:none}
.news-hero{margin-bottom:0}.news-hero h2{margin:3px 0 0}
.news-filters{display:flex;gap:7px;overflow-x:auto;padding:2px 1px 4px;scrollbar-width:none}
.news-filters::-webkit-scrollbar{display:none}
.news-filter{flex:0 0 auto;border:1px solid var(--line);background:var(--card);color:var(--muted);border-radius:999px;min-height:34px;padding:0 13px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}
.news-filter.active{color:#edf1ff;border-color:rgba(109,141,255,.42);background:rgba(109,141,255,.16)}
.news-status{min-height:18px;padding:0 2px}
.news-list{display:grid;gap:10px}
.news-card{border:1px solid var(--line);background:var(--card);border-radius:18px;padding:14px;display:grid;gap:10px;min-width:0}
.news-card.is-breaking{border-color:rgba(255,92,92,.38);box-shadow:inset 3px 0 0 rgba(255,92,92,.75)}
.news-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:10px;color:var(--muted);font-weight:750}
.news-breaking{color:#ff8a8a;font-weight:900}.news-category{color:#9eabff}
.news-title{margin:0;font-size:15px;line-height:1.4;letter-spacing:-.01em}
.news-summary{margin:0;color:var(--muted);font-size:12px;line-height:1.5}
.news-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.news-source-link,.news-comments-toggle{min-height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;padding:0 11px;font-size:11px;font-weight:800;text-decoration:none}
.news-source-link{background:rgba(109,141,255,.14);color:#aebaff;border:1px solid rgba(109,141,255,.2)}
.news-comments-toggle{background:transparent;color:var(--muted);border:1px solid var(--line);font:inherit;cursor:pointer}
.news-comments{display:grid;gap:9px;padding-top:2px}
.news-comment-list{display:grid;gap:7px}
.news-comment{border-radius:12px;background:rgba(255,255,255,.035);padding:9px 10px;display:grid;gap:3px}
.news-comment-head{display:flex;gap:8px;align-items:center;font-size:10px;color:var(--muted)}
.news-comment strong{color:var(--text);font-size:11px}.news-comment p{margin:0;font-size:12px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.news-comment-form{display:grid;grid-template-columns:minmax(96px,.34fr) minmax(0,1fr) auto;gap:7px;align-items:end}
.news-comment-form label{display:grid;gap:4px;min-width:0}.news-comment-form label span{font-size:9px;color:var(--muted);font-weight:800}
.news-comment-form input,.news-comment-form textarea{width:100%;box-sizing:border-box;border:1px solid var(--line);background:rgba(255,255,255,.035);color:var(--text);border-radius:10px;padding:9px 10px;font:inherit;font-size:12px;outline:none}
.news-comment-form textarea{min-height:38px;max-height:100px;resize:vertical}
.news-comment-form button{min-height:38px;white-space:nowrap}
.news-empty{border:1px dashed var(--line);border-radius:16px;padding:22px;text-align:center;color:var(--muted);font-size:12px}
@media(max-width:600px){.news-card{padding:13px}.news-comment-form{grid-template-columns:1fr}.news-comment-form button{width:100%}}
html[data-theme="light"] .news-filter{background:#fff;border-color:#dfe5ee;color:#65738a}
html[data-theme="light"] .news-filter.active{background:#e9edff;border-color:#d1daff;color:#314ca6}
html[data-theme="light"] .news-card{background:#fff;border-color:#dfe5ee;box-shadow:0 8px 24px rgba(48,62,93,.05)}
html[data-theme="light"] .news-comment{background:#f5f7fb}
html[data-theme="light"] .news-comment-form input,html[data-theme="light"] .news-comment-form textarea{background:#fff;border-color:#dfe5ee;color:#1d2940}
`;
writeFileSync(stylesPath, styles);

let app = readFileSync(appPath, 'utf8');
app = replaceOnce(app, `markets: { title:'Piyasalar' },`, `markets: { title:'Haberler' },`, 'markets title');
app = replaceOnce(
  app,
  `if (next === 'markets') { loadIpoCalendar(); loadHomeComparison(); }`,
  `if (next === 'markets') loadFinancialNews();`,
  'markets view loader'
);

const switchMarker = 'function switchView(view, { push = true, selectedTicker = null } = {}) {';
const switchIndex = app.indexOf(switchMarker);
if (switchIndex < 0) throw new Error('switchView marker not found');
const newsLogic = `const NEWS_BACKEND_URL = '${NEWS_BACKEND_URL}';
const NEWS_REFRESH_TTL_MS = 2 * 60 * 1000;
let financialNewsItems = [];
let financialNewsFetchedAt = 0;
let financialNewsPromise = null;
let financialNewsCategory = '';
const newsCategoryNames = { borsa:'Borsa', sirketler:'Şirketler', doviz:'Döviz', altin:'Altın', ekonomi:'Ekonomi', 'halka-arz':'Halka Arz' };

function newsInstallId() {
  const key = 'financial_news_install_id_v1';
  let value = localStorage.getItem(key) || '';
  if (value.length >= 8) return value;
  value = globalThis.crypto?.randomUUID?.() || \`news-\${Date.now().toString(36)}-\${Math.random().toString(36).slice(2)}\`;
  localStorage.setItem(key, value);
  return value;
}

function newsUserName() {
  return localStorage.getItem('financial_news_username_v1') || '';
}

function formatNewsTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

async function newsJson(path, options = {}) {
  const response = await fetch(\`\${NEWS_BACKEND_URL}\${path}\`, {
    ...options,
    headers:{ 'content-type':'application/json; charset=utf-8', ...(options.headers || {}) },
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.error || 'Haber servisine ulaşılamadı.');
  return body || {};
}

function renderNewsComments(listNode, comments) {
  listNode.replaceChildren();
  if (!Array.isArray(comments) || !comments.length) {
    const empty = document.createElement('div');
    empty.className = 'muted small';
    empty.textContent = 'Henüz yorum yok. İlk yorumu siz yazabilirsiniz.';
    listNode.append(empty);
    return;
  }
  comments.forEach(comment => {
    const row = document.createElement('div'); row.className = 'news-comment';
    const head = document.createElement('div'); head.className = 'news-comment-head';
    const name = document.createElement('strong'); name.textContent = comment.userName || 'Kullanıcı';
    const time = document.createElement('span'); time.textContent = formatNewsTime(comment.createdAt);
    const text = document.createElement('p'); text.textContent = comment.text || '';
    head.append(name, time); row.append(head, text); listNode.append(row);
  });
}

async function loadNewsComments(item, area, listNode) {
  area.hidden = false;
  listNode.textContent = 'Yorumlar yükleniyor…';
  try {
    const body = await newsJson(\`/v1/news/\${encodeURIComponent(item.id)}/comments\`);
    renderNewsComments(listNode, body.comments || []);
  } catch (error) {
    listNode.textContent = error?.message || 'Yorumlar yüklenemedi.';
  }
}

function createNewsCard(item) {
  const card = document.createElement('article');
  card.className = \`news-card\${item.breaking ? ' is-breaking' : ''}\`;

  const meta = document.createElement('div'); meta.className = 'news-meta';
  if (item.breaking) { const breaking = document.createElement('span'); breaking.className = 'news-breaking'; breaking.textContent = 'SON DAKİKA'; meta.append(breaking); }
  const source = document.createElement('span'); source.textContent = item.source || 'Kaynak';
  const category = document.createElement('span'); category.className = 'news-category'; category.textContent = newsCategoryNames[item.category] || 'Ekonomi';
  const time = document.createElement('span'); time.textContent = formatNewsTime(item.publishedAt);
  meta.append(source, category, time);

  const title = document.createElement('h3'); title.className = 'news-title'; title.textContent = item.title || '';
  card.append(meta, title);
  if (item.summary) { const summary = document.createElement('p'); summary.className = 'news-summary'; summary.textContent = item.summary; card.append(summary); }

  const actions = document.createElement('div'); actions.className = 'news-actions';
  const sourceLink = document.createElement('a'); sourceLink.className = 'news-source-link'; sourceLink.href = item.url; sourceLink.target = '_blank'; sourceLink.rel = 'noopener noreferrer'; sourceLink.textContent = 'Kaynağa Git';
  const commentsToggle = document.createElement('button'); commentsToggle.type = 'button'; commentsToggle.className = 'news-comments-toggle'; commentsToggle.textContent = \`Yorumlar (\${Number(item.commentCount || 0)})\`;
  actions.append(sourceLink, commentsToggle); card.append(actions);

  const area = document.createElement('div'); area.className = 'news-comments'; area.hidden = true;
  const list = document.createElement('div'); list.className = 'news-comment-list';
  const form = document.createElement('form'); form.className = 'news-comment-form';
  const nameLabel = document.createElement('label'); const nameCaption = document.createElement('span'); nameCaption.textContent = 'Kullanıcı adı'; const nameInput = document.createElement('input'); nameInput.maxLength = 24; nameInput.placeholder = 'Adınız'; nameInput.value = newsUserName(); nameLabel.append(nameCaption, nameInput);
  const textLabel = document.createElement('label'); const textCaption = document.createElement('span'); textCaption.textContent = 'Yorum'; const textInput = document.createElement('textarea'); textInput.maxLength = 400; textInput.rows = 1; textInput.placeholder = 'Yorum yazın…'; textLabel.append(textCaption, textInput);
  const send = document.createElement('button'); send.type = 'submit'; send.className = 'primary-btn compact-btn'; send.textContent = 'Gönder';
  form.append(nameLabel, textLabel, send); area.append(list, form); card.append(area);

  commentsToggle.addEventListener('click', async () => {
    if (!area.hidden) { area.hidden = true; return; }
    await loadNewsComments(item, area, list);
  });
  nameInput.addEventListener('input', () => localStorage.setItem('financial_news_username_v1', nameInput.value.trim()));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const userName = nameInput.value.trim();
    const text = textInput.value.trim();
    if (userName.length < 2) { showToast('Kullanıcı adı en az 2 karakter olmalı.'); return; }
    if (!text) { showToast('Yorum boş olamaz.'); return; }
    send.disabled = true;
    try {
      await newsJson(\`/v1/news/\${encodeURIComponent(item.id)}/comments\`, {
        method:'POST',
        body:JSON.stringify({ installId:newsInstallId(), userName, text }),
      });
      localStorage.setItem('financial_news_username_v1', userName);
      textInput.value = '';
      item.commentCount = Number(item.commentCount || 0) + 1;
      commentsToggle.textContent = \`Yorumlar (\${item.commentCount})\`;
      await loadNewsComments(item, area, list);
      showToast('Yorum gönderildi.');
    } catch (error) {
      showToast(error?.message || 'Yorum gönderilemedi.');
    } finally { send.disabled = false; }
  });
  return card;
}

function renderFinancialNews() {
  const list = $('#newsList');
  const status = $('#newsStatus');
  if (!list || !status) return;
  list.replaceChildren();
  const rows = financialNewsCategory
    ? financialNewsItems.filter(item => item.category === financialNewsCategory)
    : financialNewsItems;
  if (!rows.length) {
    const empty = document.createElement('div'); empty.className = 'news-empty'; empty.textContent = financialNewsItems.length ? 'Bu kategoride haber yok.' : 'Henüz finansal haber alınamadı.'; list.append(empty);
  } else rows.forEach(item => list.append(createNewsCard(item)));
  const updated = financialNewsFetchedAt ? new Date(financialNewsFetchedAt).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }) : '';
  status.textContent = updated ? \`Son güncelleme \${updated} · \${rows.length} haber\` : \`\${rows.length} haber\`;
  $$('[data-news-category]').forEach(button => button.classList.toggle('active', (button.dataset.newsCategory || '') === financialNewsCategory));
}

async function loadFinancialNews({ force = false } = {}) {
  if (!force && financialNewsItems.length && Date.now() - financialNewsFetchedAt < NEWS_REFRESH_TTL_MS) { renderFinancialNews(); return financialNewsItems; }
  if (!force && financialNewsPromise) return financialNewsPromise;
  const status = $('#newsStatus'); if (status) status.textContent = 'Haberler yükleniyor…';
  const task = newsJson('/v1/news?limit=80').then(body => {
    financialNewsItems = Array.isArray(body.items) ? body.items : [];
    financialNewsFetchedAt = Date.now();
    renderFinancialNews();
    return financialNewsItems;
  }).catch(error => {
    if (status) status.textContent = error?.message || 'Haberler şu anda alınamıyor.';
    if (!financialNewsItems.length && $('#newsList')) $('#newsList').innerHTML = '<div class="news-empty">Haberler şu anda alınamıyor. Yenile ile tekrar deneyin.</div>';
    return financialNewsItems;
  }).finally(() => { if (financialNewsPromise === task) financialNewsPromise = null; });
  financialNewsPromise = task;
  return task;
}

$('#newsRefreshBtn')?.addEventListener('click', () => loadFinancialNews({ force:true }));
$$('[data-news-category]').forEach(button => button.addEventListener('click', () => {
  financialNewsCategory = button.dataset.newsCategory || '';
  renderFinancialNews();
}));

`;
app = app.slice(0, switchIndex) + newsLogic + app.slice(switchIndex);
writeFileSync(appPath, app);

console.log('Applied isolated finance-only Haberler + shared comments overlay.');
