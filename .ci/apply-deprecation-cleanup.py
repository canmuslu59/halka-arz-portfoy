from pathlib import Path

MAIN = Path('android/app/src/main/java/com/innative/halkaarz/MainActivity.java')
TEST = Path('test/android-notification-background-behavior.test.js')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


main = MAIN.read_text(encoding='utf-8')
main = replace_once(main, 'import android.app.Activity;\n', '', 'remove Activity import')
main = replace_once(
    main,
    'import androidx.core.content.ContextCompat;\n',
    'import androidx.activity.ComponentActivity;\nimport androidx.activity.OnBackPressedCallback;\nimport androidx.core.content.ContextCompat;\n',
    'add AndroidX activity imports',
)
main = replace_once(main, 'public class MainActivity extends Activity {', 'public class MainActivity extends ComponentActivity {', 'ComponentActivity base')
main = replace_once(
    main,
    '    private final Runnable startupPermissionRequest = this::requestStartupNotificationPermission;\n',
    '    private final Runnable startupPermissionRequest = this::requestStartupNotificationPermission;\n'
    '    private final OnBackPressedCallback backPressedCallback = new OnBackPressedCallback(true) {\n'
    '        @Override\n'
    '        public void handleOnBackPressed() {\n'
    '            handleNativeBackPress();\n'
    '        }\n'
    '    };\n',
    'back callback field',
)
main = replace_once(
    main,
    '        super.onCreate(savedInstanceState);\n        WindowCompat.enableEdgeToEdge(getWindow());',
    '        super.onCreate(savedInstanceState);\n        getOnBackPressedDispatcher().addCallback(this, backPressedCallback);\n        WindowCompat.enableEdgeToEdge(getWindow());',
    'register back callback',
)
main = replace_once(main, '        settings.setDatabaseEnabled(true);\n', '', 'remove WebSQL setting')
main = replace_once(
    main,
    '    @Override\n    public void onBackPressed() {\n',
    '    private void handleNativeBackPress() {\n',
    'replace deprecated back override',
)
main = replace_once(
    main,
    '        if (now - lastBackPressMs <= EXIT_BACK_WINDOW_MS) {\n            super.onBackPressed();\n            return;\n        }',
    '        if (now - lastBackPressMs <= EXIT_BACK_WINDOW_MS) {\n'
    '            backPressedCallback.setEnabled(false);\n'
    '            try {\n'
    '                getOnBackPressedDispatcher().onBackPressed();\n'
    '            } finally {\n'
    '                backPressedCallback.setEnabled(true);\n'
    '            }\n'
    '            return;\n'
    '        }',
    'dispatcher fallback on second press',
)
MAIN.write_text(main, encoding='utf-8')

test = TEST.read_text(encoding='utf-8')
test = replace_once(
    test,
    "  assert.match(main, /now - lastBackPressMs <= EXIT_BACK_WINDOW_MS[\\s\\S]*super\\.onBackPressed\\(\\)/);\n",
    "  assert.match(main, /now - lastBackPressMs <= EXIT_BACK_WINDOW_MS[\\s\\S]*backPressedCallback\\.setEnabled\\(false\\)[\\s\\S]*getOnBackPressedDispatcher\\(\\)\\.onBackPressed\\(\\)/);\n  assert.doesNotMatch(main, /super\\.onBackPressed\\(\\)/);\n",
    'update back behavior regression assertion',
)
TEST.write_text(test, encoding='utf-8')

print('Applied guarded Android deprecation cleanup.')
