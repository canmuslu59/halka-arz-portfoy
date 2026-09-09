from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


main = 'android/app/src/main/java/com/innative/halkaarz/MainActivity.java'
replace_once(
    main,
    '        webView.loadUrl(START_URL);\n    }',
    '        webView.loadUrl(START_URL);\n        webView.postDelayed(this::requestStartupNotificationPermission, 700L);\n    }',
)
replace_once(
    main,
    '    private void applyInsets(WebView view) {',
    '    private void requestStartupNotificationPermission() {\n'
    '        if (Build.VERSION.SDK_INT < 33) return;\n'
    '        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;\n'
    '        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);\n'
    '    }\n\n'
    '    private void applyInsets(WebView view) {',
)
replace_once(
    main,
    '        if (requestCode == NOTIFICATION_PERMISSION_REQUEST && webView != null) {\n'
    '            webView.post(() -> webView.evaluateJavascript("window.__notificationPermissionChanged && window.__notificationPermissionChanged();", null));\n'
    '        }',
    '        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {\n'
    '            getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(NOTIFICATION_ASKED_KEY, true).apply();\n'
    '            if (webView != null) {\n'
    '                webView.post(() -> webView.evaluateJavascript("window.__notificationPermissionChanged && window.__notificationPermissionChanged();", null));\n'
    '            }\n'
    '        }',
)

replace_once('public/app.js', 'setTimeout(maybeRequestNotificationPermissionOnce, 450);\n', '')
replace_once('android/app/build.gradle', 'versionCode 19', 'versionCode 20')
replace_once('android/app/build.gradle', "versionName '2.3.7'", "versionName '2.3.8'")
replace_once('public/index.html', 'v2.3.7 • Build 19', 'v2.3.8 • Build 20')

# Keep reconstructed test contracts aligned with the Play build identity and startup-permission fix.
for rel in ('test/android-contract.test.js', 'test/settings-contract.test.js', 'test/code19-behavior.test.js'):
    p = Path(rel)
    text = p.read_text(encoding='utf-8')
    text = text.replace('versionCode 19', 'versionCode 20')
    text = text.replace('versionName 2.3.7', 'versionName 2.3.8')
    text = text.replace("versionName ['\\\"]2\\.3\\.7['\\\"]", "versionName ['\\\"]2\\.3\\.8['\\\"]")
    text = text.replace('v2\\.3\\.7', 'v2\\.3\\.8')
    text = text.replace('Build 19', 'Build 20')
    p.write_text(text, encoding='utf-8')

behavior = Path('test/code19-behavior.test.js')
text = behavior.read_text(encoding='utf-8')
if 'requests notification permission automatically on app startup' not in text:
    text += '''\n\ntest('Android requests notification permission automatically on app startup when still missing', async () => {\n  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');\n  const app = await read('public/app.js');\n  assert.match(main, /requestStartupNotificationPermission/);\n  assert.match(main, /webView\\.postDelayed\\([\\s\\S]*requestStartupNotificationPermission/);\n  assert.match(main, /ContextCompat\\.checkSelfPermission\\(this, Manifest\\.permission\\.POST_NOTIFICATIONS\\)\\s*==\\s*PackageManager\\.PERMISSION_GRANTED/);\n  assert.match(main, /requestPermissions\\(new String\\[\\]\\{Manifest\\.permission\\.POST_NOTIFICATIONS\\}, NOTIFICATION_PERMISSION_REQUEST\\)/);\n  assert.doesNotMatch(main, /requestStartupNotificationPermission[\\s\\S]{0,1200}NOTIFICATION_ASKED_KEY/);\n  assert.doesNotMatch(app, /setTimeout\\(maybeRequestNotificationPermissionOnce/);\n});\n'''
    behavior.write_text(text, encoding='utf-8')
