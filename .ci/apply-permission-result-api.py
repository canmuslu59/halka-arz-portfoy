from pathlib import Path

MAIN = Path('android/app/src/main/java/com/innative/halkaarz/MainActivity.java')
LIFECYCLE_TEST = Path('test/android-lifecycle-hardening.test.js')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


main = MAIN.read_text(encoding='utf-8')
main = replace_once(
    main,
    'import androidx.activity.OnBackPressedCallback;\n',
    'import androidx.activity.OnBackPressedCallback;\n'
    'import androidx.activity.result.ActivityResultLauncher;\n'
    'import androidx.activity.result.contract.ActivityResultContracts;\n',
    'Activity Result imports',
)
main = replace_once(
    main,
    '    private static final int NOTIFICATION_PERMISSION_REQUEST = 2301;\n',
    '',
    'remove legacy permission request code',
)
main = replace_once(
    main,
    '    private final Runnable startupPermissionRequest = this::requestStartupNotificationPermission;\n',
    '    private final Runnable startupPermissionRequest = this::requestStartupNotificationPermission;\n'
    '    private final ActivityResultLauncher<String> notificationPermissionLauncher = registerForActivityResult(\n'
    '            new ActivityResultContracts.RequestPermission(),\n'
    '            granted -> handleNotificationPermissionResult()\n'
    '    );\n',
    'register notification permission launcher',
)
main = replace_once(
    main,
    '        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);\n',
    '        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);\n',
    'startup permission launch',
)
main = replace_once(
    main,
    '    @Override\n'
    '    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {\n'
    '        super.onRequestPermissionsResult(requestCode, permissions, grantResults);\n'
    '        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {\n'
    '            getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(NOTIFICATION_ASKED_KEY, true).apply();\n'
    '            if (webView != null) {\n'
    '                webView.post(() -> webView.evaluateJavascript("window.__notificationPermissionChanged && window.__notificationPermissionChanged();", null));\n'
    '            }\n'
    '            BackgroundAlertScheduler.ensure(this);\n'
    '        }\n'
    '    }\n',
    '    private void handleNotificationPermissionResult() {\n'
    '        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(NOTIFICATION_ASKED_KEY, true).apply();\n'
    '        if (webView != null) {\n'
    '            webView.post(() -> webView.evaluateJavascript("window.__notificationPermissionChanged && window.__notificationPermissionChanged();", null));\n'
    '        }\n'
    '        BackgroundAlertScheduler.ensure(this);\n'
    '    }\n',
    'replace deprecated permission callback',
)
main = replace_once(
    main,
    '                activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);\n',
    '                activity.notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);\n',
    'manual permission launch',
)
MAIN.write_text(main, encoding='utf-8')

lifecycle = LIFECYCLE_TEST.read_text(encoding='utf-8')
lifecycle = replace_once(
    lifecycle,
    '  assert.match(bridgeRequest, /requestPermissions\\(new String\\[\\]\\{Manifest\\.permission\\.POST_NOTIFICATIONS\\}, NOTIFICATION_PERMISSION_REQUEST\\)/);\n',
    '  assert.match(bridgeRequest, /notificationPermissionLauncher\\.launch\\(Manifest\\.permission\\.POST_NOTIFICATIONS\\)/);\n',
    'update manual permission behavior assertion',
)
LIFECYCLE_TEST.write_text(lifecycle, encoding='utf-8')

print('Applied guarded Activity Result permission migration.')
