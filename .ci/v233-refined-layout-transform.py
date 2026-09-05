from pathlib import Path
import sys

root = Path(sys.argv[1]) / 'android/app/src/main/assets/www'

# Remove app-owned notification pre-prompt; Android system prompt is the only prompt.
p = root / 'index.html'
s = p.read_text()
start = s.find('  <div id="notificationIntro" class="notification-intro" hidden>')
if start >= 0:
    end = s.find('  <nav id="bottomNav"', start)
    if end < 0:
        raise SystemExit('bottom nav marker missing')
    s = s[:start] + s[end:]
p.write_text(s)

p = root / 'app.js'
s = p.read_text()
s = s.replace("const NOTIFICATION_INTRO_KEY = 'notification_intro_seen_v1';\n", '')
old = '''function hideNotificationIntro() {\n  const intro = $('#notificationIntro');\n  if (intro) intro.hidden = true;\n}\n\nfunction maybeShowNotificationIntro() {\n  if (readNativeNotificationPermission() !== 'prompt') return;\n  if (safeGetLocal(NOTIFICATION_INTRO_KEY) === '1') return;\n  const intro = $('#notificationIntro');\n  if (intro) intro.hidden = false;\n}\n\nfunction rememberNotificationIntro() {\n  safeSetLocal(NOTIFICATION_INTRO_KEY, '1');\n  hideNotificationIntro();\n}\n\n'''
new = '''function maybeRequestNotificationPermissionOnce() {\n  if (readNativeNotificationPermission() !== 'prompt') return;\n  try { window.AndroidBridge?.requestNotificationPermission?.(); } catch {}\n}\n\n'''
if old not in s:
    raise SystemExit('notification pre-prompt block missing')
s = s.replace(old, new)
s = s.replace("window.__notificationPermissionChanged = () => { hideNotificationIntro(); renderSettings(); };", "window.__notificationPermissionChanged = () => renderSettings();")
s = s.replace("$('#notificationIntroLater')?.addEventListener('click', () => rememberNotificationIntro());\n$('#notificationIntroAllow')?.addEventListener('click', () => {\n  rememberNotificationIntro();\n  try { window.AndroidBridge?.requestNotificationPermission?.(); } catch {}\n});\n", '')
s = s.replace('setTimeout(maybeShowNotificationIntro, 450);', 'setTimeout(maybeRequestNotificationPermissionOnce, 450);')
p.write_text(s)

# Restore code14 glass visual style; retain the floating dock, then use shared geometry variables
# so FAB, dock and system insets cannot drift apart at different breakpoints.
p = root / 'styles.css'
s = p.read_text()
lines = s.splitlines()
skip_prefixes = (
    '.notification-intro{', '.notification-intro[hidden]{', '.notification-intro-card{',
    '.notification-intro-icon{', '.notification-intro-card h2{', '.notification-intro-actions{',
    '.notification-intro-actions .primary-btn', 'html[data-theme="light"] .notification-intro{',
    'html[data-theme="light"] .notification-intro-card{'
)
s = '\n'.join(line for line in lines if not line.strip().startswith(skip_prefixes)) + '\n'
marker = '/* v2.3.3 floating dock + thicker glass edges */'
idx = s.find(marker)
if idx < 0:
    raise SystemExit('code15 visual override marker missing')
s = s[:idx].rstrip() + '''\n\n/* v2.3.3 floating dock */\n.bottom-nav{\n  position:fixed;\n  z-index:72;\n  left:50%;\n  bottom:max(10px,env(safe-area-inset-bottom),calc(var(--android-safe-bottom,0px) + 10px));\n  transform:translateX(-50%);\n  overflow:hidden;\n  isolation:isolate;\n}\n.main{padding-bottom:calc(158px + var(--android-safe-bottom,0px))}\n.fab{z-index:73}\n\n/* v2.3.3 floating control geometry fix */\n:root{\n  --dock-height:64px;\n  --dock-edge-gap:10px;\n  --dock-control-gap:22px;\n}\n.bottom-nav{\n  min-height:var(--dock-height);\n  left:calc(50% + (var(--android-safe-left,0px) - var(--android-safe-right,0px))/2);\n  width:min(calc(100% - 22px - var(--android-safe-left,0px) - var(--android-safe-right,0px)),560px);\n}\n.fab{\n  right:max(14px,calc(var(--android-safe-right,0px) + 14px),calc((100vw - 980px)/2 + 18px));\n  bottom:max(\n    calc(var(--dock-edge-gap) + var(--dock-height) + var(--dock-control-gap)),\n    calc(env(safe-area-inset-bottom) + var(--dock-edge-gap) + var(--dock-height) + var(--dock-control-gap)),\n    calc(var(--android-safe-bottom,0px) + var(--dock-edge-gap) + var(--dock-height) + var(--dock-control-gap))\n  );\n}\n.sheet{padding-bottom:max(22px,env(safe-area-inset-bottom),calc(var(--android-safe-bottom,0px) + 14px))}\n@media(max-width:720px){\n  .bottom-nav{width:min(calc(100% - 18px - var(--android-safe-left,0px) - var(--android-safe-right,0px)),520px)}\n}\n@media(max-width:430px){\n  :root{--dock-height:60px}\n}\n@media(max-width:365px){\n  .bottom-nav{width:calc(100% - 14px - var(--android-safe-left,0px) - var(--android-safe-right,0px))}\n}\n'''
p.write_text(s)
