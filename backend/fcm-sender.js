import crypto from 'node:crypto';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

function base64Url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function normalizeServiceAccount(value) {
  if (!value) return null;
  const account = typeof value === 'string' ? JSON.parse(value) : value;
  if (!account || typeof account !== 'object') return null;
  return account;
}

function serviceAccountJwt(account, nowMs) {
  if (!account.client_email || !account.private_key) {
    throw new Error('Firebase service account is missing client_email/private_key.');
  }
  const nowSec = Math.floor(nowMs / 1000);
  const header = base64Url(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss:account.client_email,
    scope:FCM_SCOPE,
    aud:account.token_uri || DEFAULT_TOKEN_URI,
    iat:nowSec,
    exp:nowSec + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.private_key);
  return `${unsigned}.${base64Url(signature)}`;
}

async function exchangeAccessToken(account, fetchImpl, nowMs) {
  const assertion = serviceAccountJwt(account, nowMs);
  const body = new URLSearchParams({
    grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const response = await fetchImpl(account.token_uri || DEFAULT_TOKEN_URI, {
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:body.toString(),
  });
  if (!response.ok) {
    const text = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`Firebase OAuth failed (${response.status || 'unknown'}): ${text.slice(0, 300)}`);
  }
  const json = await response.json();
  if (!json?.access_token) throw new Error('Firebase OAuth response did not include access_token.');
  return {
    token:String(json.access_token),
    expiresAt:nowMs + Math.max(60, Number(json.expires_in) || 3600) * 1000,
  };
}

export function createFcmSender({
  serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || null,
  fetchImpl = globalThis.fetch,
  dryRun = process.env.FCM_DRY_RUN === '1',
  now = () => Date.now(),
  accessTokenProvider = null,
} = {}) {
  const account = normalizeServiceAccount(serviceAccount);
  let cachedToken = null;

  async function accessToken() {
    if (typeof accessTokenProvider === 'function') return accessTokenProvider();
    if (!account) throw new Error('Firebase service account is not configured.');
    const nowMs = now();
    if (cachedToken && cachedToken.expiresAt - nowMs > 60_000) return cachedToken.token;
    cachedToken = await exchangeAccessToken(account, fetchImpl, nowMs);
    return cachedToken.token;
  }

  async function send(deviceToken, message = {}) {
    const token = String(deviceToken || '').trim();
    if (!token) throw new Error('FCM device token is required.');
    if (dryRun) return { dryRun:true };
    if (!account?.project_id) throw new Error('Firebase service account is not configured.');

    const auth = await accessToken();
    const data = {};
    for (const [key, value] of Object.entries(message.data || {})) {
      data[String(key)] = String(value ?? '');
    }
    data.title = String(message.title || 'Halka Arz Portföyüm');
    data.body = String(message.body || 'Portföyünüzde yeni bir hareket var.');

    const response = await fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
      {
        method:'POST',
        headers:{
          authorization:`Bearer ${auth}`,
          'content-type':'application/json; charset=utf-8',
        },
        body:JSON.stringify({
          message:{
            token,
            data,
            android:{ priority:'high' },
          },
        }),
      },
    );
    if (!response.ok) {
      const text = typeof response.text === 'function' ? await response.text() : '';
      throw new Error(`FCM send failed (${response.status || 'unknown'}): ${text.slice(0, 500)}`);
    }
    return typeof response.json === 'function' ? response.json() : { ok:true };
  }

  return Object.freeze({ send, configured:Boolean(account?.project_id) || dryRun, dryRun:Boolean(dryRun) });
}
