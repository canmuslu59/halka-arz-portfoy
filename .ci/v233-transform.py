from pathlib import Path
import shutil, sys

root = Path(sys.argv[1])
icon_source = Path(sys.argv[2])

def rw(rel, fn):
    p = root / rel
    p.write_text(fn(p.read_text()))

def gradle(s):
    s = s.replace('versionCode 14', 'versionCode 15').replace("versionName '2.3.2'", "versionName '2.3.3'")
    needle = "    implementation 'androidx.core:core:1.15.0'\n"
    addition = needle + "    implementation 'androidx.activity:activity:1.13.0'\n    implementation 'androidx.fragment:fragment:1.9.0'\n"
    if "androidx.activity:activity:1.13.0" not in s:
        s = s.replace(needle, addition)
    return s
rw('android/app/build.gradle', gradle)

rw('android/app/src/main/assets/www/index.html', lambda s: s.replace('v2.3.2 • Build 14', 'v2.3.3 • Build 15'))

css = r'''

/* v2.3.3 floating dock + thicker glass edges */
:root{
  --glass-edge-thickness:2px;
  --glass-edge-bright:rgba(166,210,255,.34);
  --glass-edge-shadow:rgba(35,104,221,.18);
}
.hero-card,.chart-card,.holding-card,.analytics-card,.settings-card,.view-hero,.calendar-card,.bottom-nav,.sheet,.notification-intro-card,.pro-access-card,.pro-detail-section,.review-access-box{
  border-width:var(--glass-edge-thickness);
  border-style:solid;
  border-color:var(--glass-edge-bright);
  box-shadow:
    inset 0 2px 0 rgba(255,255,255,.16),
    inset 0 -2px 0 var(--glass-edge-shadow),
    inset 2px 0 0 rgba(128,186,255,.08),
    inset -2px 0 0 rgba(57,124,238,.09),
    0 18px 58px rgba(0,20,58,.34);
}
.sheet{border-bottom-width:0}
.bottom-nav{
  position:fixed;
  z-index:72;
  left:50%;
  bottom:max(10px,env(safe-area-inset-bottom),calc(var(--android-safe-bottom,0px) + 10px));
  transform:translateX(-50%);
  overflow:hidden;
  isolation:isolate;
}
.main{padding-bottom:calc(158px + var(--android-safe-bottom,0px))}
.fab{z-index:73}
html[data-theme="light"] .hero-card,html[data-theme="light"] .chart-card,html[data-theme="light"] .holding-card,html[data-theme="light"] .analytics-card,html[data-theme="light"] .settings-card,html[data-theme="light"] .view-hero,html[data-theme="light"] .calendar-card,html[data-theme="light"] .bottom-nav,html[data-theme="light"] .sheet,html[data-theme="light"] .notification-intro-card{
  border-color:rgba(74,113,180,.20);
  box-shadow:inset 0 2px 0 rgba(255,255,255,.82),inset 0 -2px 0 rgba(72,112,184,.08),0 16px 44px rgba(41,57,83,.15);
}
'''

def styles(s):
    return s if '/* v2.3.3 floating dock + thicker glass edges */' in s else s + css
rw('android/app/src/main/assets/www/styles.css', styles)

old_icon = root / 'android/app/src/main/res/drawable/ic_launcher.xml'
if old_icon.exists():
    old_icon.unlink()
out_dir = root / 'android/app/src/main/res/drawable-nodpi'
out_dir.mkdir(parents=True, exist_ok=True)
shutil.copyfile(icon_source, out_dir / 'ic_launcher.png')
