import { normalizeAlertThreshold } from './alert-policy.js';

const STORAGE_KEY = 'halka_arz_alert_settings_v1';

function normalize(raw) {
  const threshold = normalizeAlertThreshold(raw?.threshold) ?? 3;
  return {
    configured: raw?.configured === true,
    enabled: raw?.enabled !== false,
    threshold,
    notificationsAllowed: raw?.notificationsAllowed === true,
  };
}

export function createAlertSettingsStore({ bridge = globalThis.window?.AndroidBridge, storage = globalThis.localStorage } = {}) {
  function read() {
    try {
      const raw = bridge?.readAlertSettings ? bridge.readAlertSettings() : storage?.getItem(STORAGE_KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch {
      return normalize(null);
    }
  }

  function save({ enabled, threshold }) {
    const parsedThreshold = normalizeAlertThreshold(threshold);
    if (parsedThreshold == null) throw new Error('Bildirim yüzdesi 0,1 ile 100 arasında olmalı.');
    const payload = { configured:true, enabled:enabled !== false, threshold:parsedThreshold };
    const json = JSON.stringify(payload);
    if (bridge?.writeAlertSettings) bridge.writeAlertSettings(json);
    else storage?.setItem(STORAGE_KEY, json);
    return { ...payload, notificationsAllowed:read().notificationsAllowed };
  }

  function requestPermission() {
    bridge?.requestNotificationPermission?.();
  }

  function sendTestNotification() {
    return bridge?.sendTestNotification?.() ?? false;
  }

  return { read, save, requestPermission, sendTestNotification };
}
