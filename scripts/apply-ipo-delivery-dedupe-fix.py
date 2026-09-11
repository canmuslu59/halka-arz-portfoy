from pathlib import Path

path = Path('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java')
text = path.read_text(encoding='utf-8')
old = '        } else if ("ceiling".equals(kind) || "floor".equals(kind)) {\n            deliveryKey = kind + "|" + ticker;'
new = '        } else if ("ceiling".equals(kind) || "floor".equals(kind) || "ipo".equals(kind)) {\n            deliveryKey = kind + "|" + ticker;'
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected exactly one delivery-key branch, found {count}')
path.write_text(text.replace(old, new), encoding='utf-8')
