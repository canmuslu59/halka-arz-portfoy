export const DEFAULT_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
const START_KEY = 'halka_arz_pro_trial_started_at_v1';

function asFiniteTimestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function createProAccess(storage, { now = () => Date.now(), trialMs = DEFAULT_TRIAL_MS } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('Pro erişimi için storage gerekli.');
  }

  function getState() {
    const startedAt = asFiniteTimestamp(storage.getItem(START_KEY));
    if (!startedAt) return { status:'not_started', hasAccess:false, startedAt:null, remainingMs:trialMs };
    const remainingMs = Math.max(0, trialMs - Math.max(0, now() - startedAt));
    if (remainingMs <= 0) return { status:'expired', hasAccess:false, startedAt, remainingMs:0 };
    return { status:'trial', hasAccess:true, startedAt, remainingMs };
  }

  function enterAdvanced() {
    if (!asFiniteTimestamp(storage.getItem(START_KEY))) storage.setItem(START_KEY, String(now()));
    return getState();
  }

  return { getState, enterAdvanced };
}
