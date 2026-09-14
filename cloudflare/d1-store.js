function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToRegistration(row = {}) {
  return {
    installId:String(row.install_id || ''),
    fcmToken:String(row.fcm_token || ''),
    enabled:Number(row.enabled) !== 0,
    threshold:Number.isFinite(Number(row.threshold)) ? Number(row.threshold) : 3,
    ipoEnabled:Number(row.ipo_enabled) !== 0,
    holdings:Array.isArray(parseJson(row.holdings_json, [])) ? parseJson(row.holdings_json, []) : [],
    alertState:parseJson(row.alert_state_json, null),
    ipoState:parseJson(row.ipo_state_json, null),
    createdAt:String(row.created_at || ''),
    updatedAt:String(row.updated_at || ''),
  };
}

function registrationToArgs(item = {}) {
  const createdAt = String(item.createdAt || item.updatedAt || new Date().toISOString());
  const updatedAt = String(item.updatedAt || createdAt);
  return [
    String(item.installId || ''),
    String(item.fcmToken || ''),
    item.enabled === false ? 0 : 1,
    Number.isFinite(Number(item.threshold)) ? Number(item.threshold) : 3,
    item.ipoEnabled === false ? 0 : 1,
    JSON.stringify(Array.isArray(item.holdings) ? item.holdings : []),
    item.alertState == null ? null : JSON.stringify(item.alertState),
    item.ipoState == null ? null : JSON.stringify(item.ipoState),
    createdAt,
    updatedAt,
  ];
}

function stable(value) {
  return JSON.stringify(value);
}

const UPSERT_INSTALLATION = `
INSERT INTO installations (
  install_id,fcm_token,enabled,threshold,ipo_enabled,holdings_json,
  alert_state_json,ipo_state_json,created_at,updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(install_id) DO UPDATE SET
  fcm_token=excluded.fcm_token,
  enabled=excluded.enabled,
  threshold=excluded.threshold,
  ipo_enabled=excluded.ipo_enabled,
  holdings_json=excluded.holdings_json,
  alert_state_json=excluded.alert_state_json,
  ipo_state_json=excluded.ipo_state_json,
  updated_at=excluded.updated_at
`;

const UPSERT_RUNTIME = `
INSERT INTO runtime_state (state_key,state_json,updated_at)
VALUES (?,?,?)
ON CONFLICT(state_key) DO UPDATE SET
  state_json=excluded.state_json,
  updated_at=excluded.updated_at
`;

export function createD1Store(db) {
  if (!db?.prepare || !db?.batch) throw new TypeError('D1 DB binding is required.');

  async function read() {
    const result = await db.prepare('SELECT * FROM installations').all();
    const installations = {};
    for (const row of result?.results || []) {
      const item = rowToRegistration(row);
      if (item.installId) installations[item.installId] = item;
    }
    return { installations };
  }

  async function mutate(mutator) {
    if (typeof mutator !== 'function') throw new TypeError('mutator is required.');
    const before = await read();
    const draft = structuredClone(before);
    const result = await mutator(draft);
    draft.installations ||= {};

    const statements = [];
    for (const [installId, item] of Object.entries(draft.installations)) {
      if (!item || typeof item !== 'object') continue;
      item.installId = String(item.installId || installId);
      const previous = before.installations?.[installId];
      if (previous && stable(previous) === stable(item)) continue;
      statements.push(db.prepare(UPSERT_INSTALLATION).bind(...registrationToArgs(item)));
    }
    if (statements.length) await db.batch(statements);
    return result;
  }

  async function runtimeRead() {
    const row = await db.prepare('SELECT state_json FROM runtime_state WHERE state_key = ?').bind('market_scheduler').first();
    return parseJson(row?.state_json, null);
  }

  async function runtimeWrite(value) {
    const updatedAt = new Date().toISOString();
    await db.prepare(UPSERT_RUNTIME)
      .bind('market_scheduler', JSON.stringify(value ?? null), updatedAt)
      .run();
    return value;
  }

  return Object.freeze({ read, mutate, runtimeRead, runtimeWrite });
}
