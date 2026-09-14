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
  const background = status.background;
  const outcomes = {
    running:'Kontrol sürüyor.',
    waiting_quotes:'Bazı hisselerin güncel fiyatı bekleniyor.',
    channel_blocked:'Bildirim kanalı kapalı.',
    permission_blocked:'Bildirim izni kapalı.',
    no_config:'Bildirim ayarları henüz aktarılmadı.',
    no_holdings:'Takip edilecek aktif hisse yok.',
    disabled:'Bildirim takibi kapalı.',
    error:'Son kontrol tamamlanamadı.',
    checked:'Son kontrol tamamlandı.',
  };
  const detail = outcomes[background?.outcome] || 'Arka plan kontrolü bekleniyor.';
  const stamp = Number(background?.checkedAt);
  const time = stamp > 0 ? new Date(stamp).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'}) + ' — ' : '';
  return 'Bildirim izni ve kanallar açık. ' + time + detail;
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
  const settingsButton = document.querySelector('#notificationSettingsButton');

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
