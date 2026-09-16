import test from 'node:test';
import assert from 'node:assert/strict';
import { NewsStateModel, validateCommentInput } from '../cloudflare/news-store.js';

test('validates username and comment limits', () => {
  assert.throws(() => validateCommentInput({ newsId:'news_abcd', installId:'install-1234', userName:'A', text:'ok' }), /2-24/);
  assert.throws(() => validateCommentInput({ newsId:'news_abcd', installId:'install-1234', userName:'Can', text:'x'.repeat(401) }), /1-400/);
  const value = validateCommentInput({ newsId:'news_abcd', installId:'install-1234', userName:' Can  ', text:' Güzel haber ' });
  assert.equal(value.userName, 'Can');
  assert.equal(value.text, 'Güzel haber');
});

test('comments are public without leaking install id and enforce cooldown / duplicate window', () => {
  let nowMs = Date.parse('2026-09-17T00:00:00Z');
  const model = new NewsStateModel({}, () => nowMs);
  const first = model.addComment({ newsId:'news_abcd', installId:'install-1234', userName:'Can', text:'Takipteyim' });
  assert.deepEqual(Object.keys(first).sort(), ['createdAt','id','text','userName']);
  assert.equal(first.userName, 'Can');
  assert.equal(model.listComments('news_abcd').length, 1);
  assert.ok(!('installId' in model.listComments('news_abcd')[0]));

  nowMs += 10_000;
  assert.throws(() => model.addComment({ newsId:'news_abcd', installId:'install-1234', userName:'Can', text:'Başka yorum' }), error => error.statusCode === 429);

  nowMs += 15_000;
  assert.throws(() => model.addComment({ newsId:'news_abcd', installId:'install-1234', userName:'Can', text:'Takipteyim' }), error => error.statusCode === 409);

  nowMs += 5 * 60_000;
  const repeatedLater = model.addComment({ newsId:'news_abcd', installId:'install-1234', userName:'Can', text:'Takipteyim' });
  assert.equal(repeatedLater.text, 'Takipteyim');
});

test('breaking claim only returns unseen source-designated breaking items once', () => {
  const model = new NewsStateModel({}, () => Date.parse('2026-09-17T00:00:00Z'));
  const breaking = { id:'news_break1', title:'BIST devre kesici', breaking:true };
  const normal = { id:'news_normal1', title:'Normal haber', breaking:false };
  assert.deepEqual(model.claimBreaking([breaking, normal]).map(item => item.id), ['news_break1']);
  assert.deepEqual(model.claimBreaking([breaking]), []);
  assert.equal(Object.keys(model.snapshot().breakingSeen).length, 1);
});

test('registering an installation accepts tokenless test builds', () => {
  const model = new NewsStateModel({}, () => Date.parse('2026-09-17T00:00:00Z'));
  const result = model.registerInstallation({ installId:'install-1234' });
  assert.equal(result.pushReady, false);
  assert.equal(result.installId, 'install-1234');
});
