const STATE_KEY = 'financial-news-state-v1';
const MAX_COMMENTS_PER_NEWS = 200;
const COMMENT_COOLDOWN_MS = 20_000;
const DUPLICATE_WINDOW_MS = 5 * 60_000;

function clone(value) {
  return structuredClone(value);
}

function initialState(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    commentsByNews:{ ...(source.commentsByNews || {}) },
    installations:{ ...(source.installations || {}) },
    commentRate:{ ...(source.commentRate || {}) },
    breakingSeen:{ ...(source.breakingSeen || {}) },
  };
}

function trimVisible(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function statusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function validateCommentInput({ newsId, installId, userName, text } = {}) {
  const safeNewsId = trimVisible(newsId);
  const safeInstallId = trimVisible(installId);
  const safeUserName = trimVisible(userName);
  const safeText = trimVisible(text);
  if (!/^news_[a-z0-9]{4,80}$/i.test(safeNewsId)) throw statusError('Geçersiz haber kimliği.', 400);
  if (safeInstallId.length < 8 || safeInstallId.length > 128) throw statusError('Geçersiz cihaz kimliği.', 400);
  if (safeUserName.length < 2 || safeUserName.length > 24) throw statusError('Kullanıcı adı 2-24 karakter olmalı.', 400);
  if (safeText.length < 1 || safeText.length > 400) throw statusError('Yorum 1-400 karakter olmalı.', 400);
  return { newsId:safeNewsId, installId:safeInstallId, userName:safeUserName, text:safeText };
}

function publicComment(comment) {
  return Object.freeze({
    id:String(comment.id),
    userName:String(comment.userName),
    text:String(comment.text),
    createdAt:String(comment.createdAt),
  });
}

export class NewsStateModel {
  constructor(state, now = () => Date.now()) {
    this.state = initialState(state);
    this.now = now;
  }

  listComments(newsId) {
    const id = trimVisible(newsId);
    return (this.state.commentsByNews[id] || []).map(publicComment);
  }

  commentCounts(ids = []) {
    const counts = {};
    for (const raw of ids.slice(0, 100)) {
      const id = trimVisible(raw);
      if (id) counts[id] = (this.state.commentsByNews[id] || []).length;
    }
    return counts;
  }

  addComment(input) {
    const safe = validateCommentInput(input);
    const nowMs = Number(this.now());
    const rate = this.state.commentRate[safe.installId] || { lastAt:0, recent:[] };
    if (nowMs - Number(rate.lastAt || 0) < COMMENT_COOLDOWN_MS) {
      throw statusError('Yeni yorum için kısa bir süre bekleyin.', 429);
    }
    const normalizedText = safe.text.toLocaleLowerCase('tr-TR');
    const recent = (Array.isArray(rate.recent) ? rate.recent : [])
      .filter(entry => nowMs - Number(entry?.at || 0) <= DUPLICATE_WINDOW_MS);
    if (recent.some(entry => entry.newsId === safe.newsId && entry.text === normalizedText)) {
      throw statusError('Aynı yorum kısa süre içinde tekrar gönderilemez.', 409);
    }
    const createdAt = new Date(nowMs).toISOString();
    const comment = {
      id:`c_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userName:safe.userName,
      text:safe.text,
      createdAt,
      installId:safe.installId,
    };
    const list = Array.isArray(this.state.commentsByNews[safe.newsId])
      ? [...this.state.commentsByNews[safe.newsId]]
      : [];
    list.push(comment);
    this.state.commentsByNews[safe.newsId] = list.slice(-MAX_COMMENTS_PER_NEWS);
    this.state.commentRate[safe.installId] = {
      lastAt:nowMs,
      recent:[...recent, { newsId:safe.newsId, text:normalizedText, at:nowMs }].slice(-20),
    };
    return publicComment(comment);
  }

  registerInstallation({ installId, fcmToken } = {}) {
    const id = trimVisible(installId);
    const token = trimVisible(fcmToken);
    if (id.length < 8 || id.length > 128) throw statusError('Geçersiz cihaz kimliği.', 400);
    this.state.installations[id] = {
      fcmToken:token.slice(0, 4096),
      updatedAt:new Date(Number(this.now())).toISOString(),
    };
    return { installId:id, pushReady:Boolean(token) };
  }

  claimBreaking(items = []) {
    const nowMs = Number(this.now());
    const unseen = [];
    for (const item of Array.isArray(items) ? items : []) {
      if (!item?.breaking || !/^news_[a-z0-9]+$/i.test(String(item.id || ''))) continue;
      if (this.state.breakingSeen[item.id]) continue;
      this.state.breakingSeen[item.id] = nowMs;
      unseen.push(clone(item));
    }
    const cutoff = nowMs - 14 * 24 * 60 * 60_000;
    for (const [id, seenAt] of Object.entries(this.state.breakingSeen)) {
      if (Number(seenAt) < cutoff) delete this.state.breakingSeen[id];
    }
    return unseen;
  }

  snapshot() {
    return clone(this.state);
  }
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
  });
}

export class NewsStateDurableObject {
  constructor(state) {
    this.state = state;
    this.storage = state.storage;
  }

  async readState() {
    return initialState(await this.storage.get(STATE_KEY));
  }

  async mutate(fn) {
    return this.state.blockConcurrencyWhile(async () => {
      const model = new NewsStateModel(await this.readState(), () => Date.now());
      const result = await fn(model);
      await this.storage.put(STATE_KEY, model.snapshot());
      return result;
    });
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const method = String(request.method || 'GET').toUpperCase();
      if (method === 'GET' && url.pathname === '/comments') {
        const model = new NewsStateModel(await this.readState());
        return json(200, { comments:model.listComments(url.searchParams.get('newsId') || '') });
      }
      if (method === 'POST' && url.pathname === '/comments') {
        const comment = await this.mutate(model => model.addComment(await readJson(request)));
        return json(201, { comment });
      }
      if (method === 'POST' && url.pathname === '/comment-counts') {
        const body = await readJson(request);
        const model = new NewsStateModel(await this.readState());
        return json(200, { counts:model.commentCounts(Array.isArray(body.ids) ? body.ids : []) });
      }
      if (method === 'POST' && url.pathname === '/installations') {
        const result = await this.mutate(model => model.registerInstallation(await readJson(request)));
        return json(200, result);
      }
      if (method === 'POST' && url.pathname === '/breaking/claim') {
        const body = await readJson(request);
        const items = await this.mutate(model => model.claimBreaking(Array.isArray(body.items) ? body.items : []));
        return json(200, { items });
      }
      if (method === 'GET' && url.pathname === '/health') {
        const model = new NewsStateModel(await this.readState());
        const snapshot = model.snapshot();
        return json(200, {
          ok:true,
          comments:Object.values(snapshot.commentsByNews).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
          installations:Object.keys(snapshot.installations).length,
          breakingSeen:Object.keys(snapshot.breakingSeen).length,
        });
      }
      return json(404, { error:'NOT_FOUND' });
    } catch (error) {
      return json(Number(error?.statusCode) || 400, { error:String(error?.message || 'İstek işlenemedi.') });
    }
  }
}
