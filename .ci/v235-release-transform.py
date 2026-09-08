from pathlib import Path
import sys

root = Path(sys.argv[1])


def req_replace(rel, old, new, count=1):
    p = root / rel
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'missing pattern in {rel}: {old[:120]!r}')
    p.write_text(s.replace(old, new, count))


# Release identity and AndroidX Core version that contains WindowCompat.enableEdgeToEdge.
req_replace('android/app/build.gradle', 'versionCode 16', 'versionCode 17')
req_replace('android/app/build.gradle', "versionName '2.3.4'", "versionName '2.3.5'")
req_replace('android/app/build.gradle', "implementation 'androidx.core:core:1.15.0'", "implementation 'androidx.core:core:1.17.0'")

# Explicit AndroidX edge-to-edge helper. Existing systemBars + displayCutout inset
# delivery remains the source of CSS safe-area values for the WebView UI.
req_replace(
    'android/app/src/main/java/com/innative/halkaarz/MainActivity.java',
    'WindowCompat.setDecorFitsSystemWindows(getWindow(), false);',
    'WindowCompat.enableEdgeToEdge(getWindow());',
)

# Visible release identity only; no visual style changes in this release.
req_replace(
    'android/app/src/main/assets/www/index.html',
    'v2.3.4 • Build 16',
    'v2.3.5 • Build 17',
)

# Update inherited contract tests to the new release and edge-to-edge API.
p = root / 'test/android-contract.test.js'
s = p.read_text()
s = s.replace('/versionCode 13/', '/versionCode 17/')
s = s.replace('/versionName [\'\"]2\\.3\\.1[\'\"]/', '/versionName [\'\"]2\\.3\\.5[\'\"]/')
s = s.replace(
    "  assert.doesNotMatch(java, /WindowCompat\\.enableEdgeToEdge/);\n"
    "  assert.match(java, /WindowCompat\\.setDecorFitsSystemWindows\\(getWindow\\(\\), false\\)/);",
    "  assert.match(java, /WindowCompat\\.enableEdgeToEdge\\(getWindow\\(\\)\\)/);\n"
    "  assert.doesNotMatch(java, /WindowCompat\\.setDecorFitsSystemWindows\\(getWindow\\(\\), false\\)/);",
)
s = s.replace('/androidx\\.core:core:1\\.15\\.0/', '/androidx\\.core:core:1\\.17\\.0/')
p.write_text(s)
