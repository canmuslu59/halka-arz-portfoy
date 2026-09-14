import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createCloudflareFcmSender } from '../cloudflare/fcm-sender.js';

function base64Lines(buffer) {
  const b64 = Buffer.from(buffer).toString('base64');
  return b64.match(/.{1,64}/g).join('\n');
}

async function serviceAccount() {
  const pair = await webcrypto.subtle.generateKey(
    { name:'RSASSA-PKCS1-v1_5', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256' },
    true,
    ['sign','verify'],
  );
  const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    project_id:'unit-project',
    client_email:'unit@unit-project.iam.gserviceaccount.com',
    private_key:`-----BEGIN PRIVATE KEY-----\n${base64Lines(pkcs8)}\n-----END PRIVATE KEY-----\n`,
    token_uri:'https://oauth2.googleapis.com/token',
  };
}

test('Worker FCM sender signs OAuth with Web Crypto and sends data-only high-priority Android message', async () => {
  const account = await serviceAccount();
  const calls = [];
  const sender = createCloudflareFcmSender({
    serviceAccountJson:JSON.stringify(account),
    cryptoImpl:webcrypto,
    now:()=>Date.parse('2026-09-14T10:00:00Z'),
    fetchImpl:async (url, options = {}) => {
      calls.push({url:String(url),options});
      if (String(url) === account.token_uri) {
        return new Response(JSON.stringify({access_token:'access-token',expires_in:3600}), {status:200,headers:{'content-type':'application/json'}});
      }
      return new Response(JSON.stringify({name:'projects/unit-project/messages/1'}), {status:200,headers:{'content-type':'application/json'}});
    },
  });

  await sender.send('device-token', {
    title:'Portföy düşüşü',
    body:'Toplam portföy bugün -%1 seviyesini geçti.',
    data:{kind:'portfolio_fall',ticker:'',level:'-1',dailyPct:'-1.04'},
  });

  assert.equal(sender.configured, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, account.token_uri);
  assert.match(String(calls[0].options.body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
  assert.match(String(calls[0].options.body), /assertion=/);
  assert.equal(calls[1].url, 'https://fcm.googleapis.com/v1/projects/unit-project/messages:send');
  assert.equal(calls[1].options.headers.authorization, 'Bearer access-token');

  const payload = JSON.parse(calls[1].options.body);
  assert.equal(payload.message.token, 'device-token');
  assert.equal(payload.message.notification, undefined);
  assert.equal(payload.message.android.priority, 'high');
  assert.equal(payload.message.data.kind, 'portfolio_fall');
  assert.equal(payload.message.data.level, '-1');
  assert.equal(payload.message.data.title, 'Portföy düşüşü');
  assert.equal(payload.message.data.body, 'Toplam portföy bugün -%1 seviyesini geçti.');
});

test('Worker FCM sender reuses cached OAuth token before expiry', async () => {
  const account = await serviceAccount();
  let oauthCalls = 0;
  let fcmCalls = 0;
  const sender = createCloudflareFcmSender({
    serviceAccountJson:account,
    cryptoImpl:webcrypto,
    now:()=>Date.parse('2026-09-14T10:00:00Z'),
    fetchImpl:async url => {
      if (String(url) === account.token_uri) {
        oauthCalls += 1;
        return new Response(JSON.stringify({access_token:'cached-token',expires_in:3600}), {status:200});
      }
      fcmCalls += 1;
      return new Response(JSON.stringify({name:`messages/${fcmCalls}`}), {status:200});
    },
  });
  await sender.send('one', {title:'a',body:'b',data:{kind:'portfolio'}});
  await sender.send('two', {title:'a',body:'b',data:{kind:'portfolio'}});
  assert.equal(oauthCalls, 1);
  assert.equal(fcmCalls, 2);
});

test('Worker FCM sender rejects incomplete service account before delivery', async () => {
  const invalid = [
    {client_email:'x@y',private_key:'key'},
    {project_id:'x',private_key:'key'},
    {project_id:'x',client_email:'x@y'},
  ];
  for (const account of invalid) {
    let calls = 0;
    const sender = createCloudflareFcmSender({
      serviceAccountJson:account,
      cryptoImpl:webcrypto,
      fetchImpl:async()=>{ calls += 1; return new Response('{}',{status:200}); },
    });
    await assert.rejects(() => sender.send('token', {title:'x',body:'y',data:{}}), /service account/i);
    assert.equal(calls, 0);
  }
});

test('Worker FCM sender marks an UNREGISTERED response as a permanent token failure', async () => {
  const account = await serviceAccount();
  const sender = createCloudflareFcmSender({
    serviceAccountJson:account,
    cryptoImpl:webcrypto,
    now:()=>Date.parse('2026-09-14T10:00:00Z'),
    fetchImpl:async url => {
      if (String(url) === account.token_uri) {
        return new Response(JSON.stringify({access_token:'access-token',expires_in:3600}), {status:200});
      }
      return new Response(JSON.stringify({
        error:{
          code:404,
          status:'NOT_FOUND',
          message:'Requested entity was not found.',
          details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'UNREGISTERED'}],
        },
      }), {status:404,headers:{'content-type':'application/json'}});
    },
  });

  await assert.rejects(
    () => sender.send('expired-token', {title:'x',body:'y',data:{kind:'portfolio'}}),
    error => error?.permanentToken === true && error?.code === 'FCM_TOKEN_INVALID',
  );
});
