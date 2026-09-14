import test from 'node:test';
import assert from 'node:assert/strict';
import { createFcmSender } from '../backend/fcm-sender.js';

test('FCM sender uses a data-only high-priority Android message so app notification routing always runs', async () => {
  const calls = [];
  const sender = createFcmSender({
    serviceAccount:{ project_id:'demo-project' },
    accessTokenProvider:async()=> 'access-token',
    fetchImpl:async (url, options) => {
      calls.push({url,options});
      return { ok:true, json:async()=>({name:'messages/1'}) };
    },
  });

  await sender.send('device-token', {
    title:'Portföy düşüşü',
    body:'Portföyünüz -%1,0 seviyesine ulaştı.',
    data:{kind:'portfolio_fall',ticker:'',level:'-1',dailyPct:'-1.04'},
  });

  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.message.token, 'device-token');
  assert.equal(payload.message.android.priority, 'high');
  assert.equal(payload.message.notification, undefined);
  assert.equal(payload.message.data.kind, 'portfolio_fall');
  assert.equal(payload.message.data.title, 'Portföy düşüşü');
  assert.equal(payload.message.data.body, 'Portföyünüz -%1,0 seviyesine ulaştı.');
});

test('FCM sender refuses production delivery without server credentials', async () => {
  const sender = createFcmSender({ serviceAccount:null, dryRun:false });
  await assert.rejects(() => sender.send('token', {title:'x',body:'y',data:{}}), /service account/i);
});
