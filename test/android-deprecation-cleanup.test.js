import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const MAIN = 'android/app/src/main/java/com/innative/halkaarz/MainActivity.java';

test('native back handling uses AndroidX dispatcher instead of deprecated Activity.onBackPressed', async () => {
  const java = await fs.readFile(MAIN, 'utf8');

  assert.match(java, /import androidx\.activity\.ComponentActivity;/);
  assert.match(java, /import androidx\.activity\.OnBackPressedCallback;/);
  assert.match(java, /public class MainActivity extends ComponentActivity/);
  assert.match(java, /getOnBackPressedDispatcher\(\)\.addCallback\(this,/);
  assert.match(java, /new OnBackPressedCallback\(true\)/);
  assert.match(java, /handleNativeBackPress\(\)/);
  assert.doesNotMatch(java, /public void onBackPressed\s*\(/);
  assert.doesNotMatch(java, /super\.onBackPressed\s*\(/);
});

test('WebView configuration does not enable deprecated WebSQL database support', async () => {
  const java = await fs.readFile(MAIN, 'utf8');

  assert.match(java, /settings\.setDomStorageEnabled\(true\)/);
  assert.doesNotMatch(java, /settings\.setDatabaseEnabled\s*\(/);
});

test('notification permission uses Activity Result API without deprecated permission callbacks', async () => {
  const java = await fs.readFile(MAIN, 'utf8');

  assert.match(java, /import androidx\.activity\.result\.ActivityResultLauncher;/);
  assert.match(java, /import androidx\.activity\.result\.contract\.ActivityResultContracts;/);
  assert.match(java, /ActivityResultLauncher<String> notificationPermissionLauncher/);
  assert.match(java, /registerForActivityResult\(new ActivityResultContracts\.RequestPermission\(\)/);
  assert.match(java, /notificationPermissionLauncher\.launch\(Manifest\.permission\.POST_NOTIFICATIONS\)/);
  assert.match(java, /handleNotificationPermissionResult\(\)/);
  assert.doesNotMatch(java, /onRequestPermissionsResult\s*\(/);
  assert.doesNotMatch(java, /requestPermissions\s*\(/);
  assert.doesNotMatch(java, /NOTIFICATION_PERMISSION_REQUEST/);
});