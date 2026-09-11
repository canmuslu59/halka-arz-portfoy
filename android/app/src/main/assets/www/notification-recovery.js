function bridge() {
  return globalThis.AndroidBridge || null;
}

function parseStatus() {
  try {
    const raw = bridge()?.getNotificationStatus?.();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function channelBlocked(status) {
  const channels = status?.channels;
  if (!channels || typeof channels !== 'object') return false;
  return Object.values(channels).some(channel => channel && channel.enabled === false);
}

function statusText(status) {
  if (!status) return 'Bildirim tanılaması kullanılamıyor.';
  if (status.permissionGranted === false) return 'Bildirim izni kapalı. İzin ver düğmesi Android ayarlarını açabilir.';
  if (status.notificationsEnabled === false) return 'Bu uygulamanın bildirimleri Android ayarlarında kapalı.';
  if (channelBlocked(status)) return 'Bir veya daha fazla bildirim kanalı Android ayarlarında kapalı.';
  return 'Bildirim izni ve kanallar açık.';
}

function refreshNotificationDiagnostics() {
  const status = parseStatus();
  const label = document.querySelector('#notificationPermissionStatus');
  if (label && status) label.textContent = statusText(status);
  const settingsButton = document.querySelector('#notificationSettingsButton');
  if (settingsButton) {
    settingsButton.hidden = !status || (status.permissionGranted !== false && status.notificationsEnabled !== false && !channelBlocked(status));
  }
  return status;
}

function setup() {
  const native = bridge();
  const debugButton = document.querySelector('#debugNotificationTest');
  const settingsButton = document.querySelector('#notificationSettingsButton');

  let isDebugBuild = false;
  try { isDebugBuild = native?.isDebugBuild?.() === true; } catch {}
  if (debugButton) debugButton.hidden = !isDebugBuild;

  debugButton?.addEventListener('click', () => {
    let ok = false;
    try { ok = native?.showDebugTestNotification?.() === true; } catch {}
    const label = document.querySelector('#notificationPermissionStatus');
    if (label) label.textContent = ok
      ? 'Test bildirimi gönderildi. Telefonun bildirim perdesini kontrol edin.'
      : 'Test bildirimi engellendi. Android bildirim ayarlarını kontrol edin.';
    if (!ok && settingsButton) settingsButton.hidden = false;
    setTimeout(refreshNotificationDiagnostics, 1200);
  });

  settingsButton?.addEventListener('click', () => {
    try { native?.openNotificationSettings?.(); } catch {}
  });

  document.querySelector('#settingsTab')?.addEventListener('click', () => setTimeout(refreshNotificationDiagnostics, 80));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(refreshNotificationDiagnostics, 100);
  });
  setTimeout(refreshNotificationDiagnostics, 250);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once:true });
else setup();
