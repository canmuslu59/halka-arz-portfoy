#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TOOLS="$ROOT/.render-tools"
SDK="$ROOT/.render-android-sdk"
DIST="$ROOT/render_dist"
GRADLE_VERSION="8.11.1"
CMDLINE_ZIP="commandlinetools-linux-11076708_latest.zip"

mkdir -p "$TOOLS" "$SDK" "$DIST"

if ! command -v java >/dev/null 2>&1; then
  echo "Java 17 not found; downloading Temurin JDK..."
  curl -fL --retry 3 "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse" -o "$TOOLS/jdk17.tar.gz"
  mkdir -p "$TOOLS/jdk17"
  tar -xzf "$TOOLS/jdk17.tar.gz" -C "$TOOLS/jdk17" --strip-components=1
  export JAVA_HOME="$TOOLS/jdk17"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [ ! -x "$TOOLS/gradle-$GRADLE_VERSION/bin/gradle" ]; then
  echo "Downloading Gradle $GRADLE_VERSION..."
  curl -fL --retry 3 "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip" -o "$TOOLS/gradle.zip"
  unzip -q -o "$TOOLS/gradle.zip" -d "$TOOLS"
fi
export PATH="$TOOLS/gradle-$GRADLE_VERSION/bin:$PATH"

if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Downloading Android command-line tools..."
  curl -fL --retry 3 "https://dl.google.com/android/repository/$CMDLINE_ZIP" -o "$TOOLS/cmdline-tools.zip"
  rm -rf "$SDK/cmdline-tools"
  mkdir -p "$SDK/cmdline-tools/latest"
  unzip -q -o "$TOOLS/cmdline-tools.zip" -d "$TOOLS/cmdline-unpacked"
  cp -R "$TOOLS/cmdline-unpacked/cmdline-tools/." "$SDK/cmdline-tools/latest/"
fi

export ANDROID_SDK_ROOT="$SDK"
export ANDROID_HOME="$SDK"
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$PATH"

yes | sdkmanager --licenses >/dev/null 2>&1 || true
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"

npm ci

node --test --test-concurrency=1 \
  test/news-local-test-worker.test.js \
  test/news-notifications.test.js \
  test/news-notification-source-metadata.test.js \
  test/news-notification-integration.test.js

npm run android:sync

node scripts/apply-test-share-ui.mjs
node scripts/apply-test-wallet-metrics-nav.mjs
node scripts/apply-test-portfolio-app-navigation.mjs
node scripts/apply-performance-history-data-fix.mjs
node scripts/apply-fixed-bottom-dock-test.mjs

echo "Verifying live Code32 market notification core is byte-locked..."
test "$(git hash-object android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java)" = "7d911722cdbd0f7fd1a96317752399c232a6e5e3"
test "$(git hash-object android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java)" = "5474484163e63853e9b6639199cc92b9467f11ef"
test "$(git hash-object android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java)" = "2636caca40f5eb5ed44bfb80bc2f9e8fe539f25b"

python3 - <<'PY'
from pathlib import Path
import re
p=Path("android/app/build.gradle")
s=p.read_text(encoding="utf-8")
s=re.sub(r"versionCode\s+\d+", "versionCode 33015", s, count=1)
s=s.replace("applicationIdSuffix '.test'", "applicationIdSuffix '.graphtest'")
s=s.replace("versionNameSuffix '-test'", "versionNameSuffix '-news-fallback-fix'")
s=s.replace("resValue 'string', 'app_name', 'Hisse Portföyüm Test'", "resValue 'string', 'app_name', 'Hisse Portföyüm Haber Test'")
p.write_text(s, encoding="utf-8")
PY

cat > android/app/google-services.json <<'JSON'
{"project_info":{"project_number":"181104463772","project_id":"halka-arz-portfoyum-d86ff","storage_bucket":"halka-arz-portfoyum-d86ff.firebasestorage.app"},"client":[{"client_info":{"mobilesdk_app_id":"1:181104463772:android:0079989b9d3c4ef85fcb9d","android_client_info":{"package_name":"com.innative.halkaarz.graphtest"}},"oauth_client":[],"api_key":[{"current_key":"AIzaSyByYlMz5g9cwzXUjfVFlLIM0A564z-fO88"}],"services":{"appinvite_service":{"other_platform_oauth_client":[]}}}],"configuration_version":"1"}
JSON

export PUSH_BACKEND_URL="https://halka-arz-portfoy-push.grass-airboat.workers.dev"

gradle -p android --no-daemon compileDebugJavaWithJavac
gradle -p android --no-daemon assembleDebug

APK="android/app/build/outputs/apk/debug/app-debug.apk"
test -f "$APK"

cp "$APK" "$DIST/Hisse-Portfoyum-Haber-Local-Fallback-FIX.apk"
sha256sum "$DIST/Hisse-Portfoyum-Haber-Local-Fallback-FIX.apk" > "$DIST/SHA256SUMS.txt"

cat > "$DIST/index.html" <<'HTML'
<!doctype html>
<meta charset="utf-8">
<title>Hisse Portföyüm Haber Test APK</title>
<h1>Hisse Portföyüm Haber + Local Fallback FIX</h1>
<p>Canlı market bildirim çekirdeği hash kilitli; yalnız haber FCM ve local fallback düzeltildi.</p>
<p><a href="Hisse-Portfoyum-Haber-Local-Fallback-FIX.apk">APK'yi indir</a></p>
<p><a href="SHA256SUMS.txt">SHA-256</a></p>
HTML

echo "Build complete."
