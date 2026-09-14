const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

function parseAccount(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return typeof value === 'object' ? value : null;
}

function validateAccount(account) {
  if (!account?.project_id || !account?.client_email || !account?.private_key) {
    throw new Error('Firebase service account is incomplete.');
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function base64UrlBytes(bytes) {
  return bytesToBase64(bytes).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlText(value) {
  return base64UrlBytes(new TextEncoder().encode(String(value)));
}

function pemToBytes(pem) {
  const body = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('Firebase service account private key is invalid.');
  let binary;
  try { binary = atob(body); } catch { throw new Error('Firebase service account private key is invalid.'); }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importPrivateKey(account, cryptoImpl) {
  validateAccount(account);
  return cryptoImpl.subtle.importKey(
    'pkcs8',
    pemToBytes(account.private_key),
    { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' },
    false,
    ['sign'],
  );
}

async function signedAssertion(account, cryptoImpl, nowMs) {
  const nowSec = Math.floor(nowMs / 1000);
  const header = base64UrlText(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  const claims = base64UrlText(JSON.stringify({
    iss:account.client_email,
    scope:FCM_SCOPE,
    aud:account.token_uri || DEFAULT_TOKEN_URI,
    iat:nowSec,
    exp:nowSec + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(account, cryptoImpl);
  const signature = new Uint8Array(await cryptoImpl.subtle.sign(
    { name:'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsigned),
  ));
  return `${unsigned}.${base64UrlBytes(signature)}`;
}

async function readError(response) {
  try { return (await response.text()).slice(0, 500); } catch { return ''; }
}

export function createCloudflareFcmSender({
  serviceAccountJson,
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  now = () => Date.now(),
} = {}) {
  const account = parseAccount(serviceAccountJson);
  let cachedToken = null;

  async function accessToken() {
    validateAccount(account);
    if (!cryptoImpl?.subtle) throw new Error('Web Crypto is unavailable for Firebase service account signing.');
    const nowMs = Number(now());
    if (cachedToken && cachedToken.expiresAt - nowMs > 60_000) return cachedToken.token;

    const assertion = await signedAssertion(account, cryptoImpl, nowMs);
    const form = new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    const response = await fetchImpl(account.token_uri || DEFAULT_TOKEN_URI, {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded' },
      body:form.toString(),
    });
    if (!response?.ok) {
      throw new Error(`Firebase OAuth failed (${response?.status || 'unknown'}): ${await readError(response)}`);
    }
    const json = await response.json();
    if (!json?.access_token) throw new Error('Firebase OAuth response did not include access_token.');
    cachedToken = {
      token:String(json.access_token),
      expiresAt:nowMs + Math.max(60, Number(json.expires_in) || 3600) * 1000,
    };
    return cachedToken.token;
  }

  async function send(deviceToken, message = {}) {
    validateAccount(account);
    const token = String(deviceToken || '').trim();
    if (!token) throw new Error('FCM device token is required.');

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
    if (!response?.ok) {
      throw new Error(`FCM send failed (${response?.status || 'unknown'}): ${await readError(response)}`);
    }
    return response.json();
  }

  return Object.freeze({
    send,
    configured:Boolean(account?.project_id && account?.client_email && account?.private_key),
  });
}
