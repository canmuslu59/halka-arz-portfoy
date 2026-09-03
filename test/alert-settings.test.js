import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlertSettingsStore } from '../public/core/alert-settings.js';

test('native alert settings are normalized for first launch and persisted through the bridge', () => {
  let saved = null;
  const bridge = {
    readAlertSettings: () => '',
    writeAlertSettings: json => { saved = json; },
  };
  const store = createAlertSettingsStore({ bridge });

  assert.deepEqual(store.read(), { configured:false, enabled:true, threshold:3, notificationsAllowed:false });
  const result = store.save({ enabled:true, threshold:'2,5' });

  assert.deepEqual(result, { configured:true, enabled:true, threshold:2.5, notificationsAllowed:false });
  assert.deepEqual(JSON.parse(saved), { configured:true, enabled:true, threshold:2.5 });
});

test('invalid alert threshold is rejected without overwriting saved settings', () => {
  let writes = 0;
  const store = createAlertSettingsStore({
    bridge: {
      readAlertSettings: () => '{"configured":true,"enabled":true,"threshold":3,"notificationsAllowed":true}',
      writeAlertSettings: () => { writes += 1; },
    },
  });

  assert.throws(() => store.save({ enabled:true, threshold:0 }), /0,1 ile 100/);
  assert.equal(writes, 0);
});

test('permission and test-notification actions call the native bridge', () => {
  const calls = [];
  const store = createAlertSettingsStore({
    bridge: {
      requestNotificationPermission: () => calls.push('permission'),
      sendTestNotification: () => calls.push('test'),
    },
  });

  store.requestPermission();
  store.sendTestNotification();
  assert.deepEqual(calls, ['permission','test']);
});
