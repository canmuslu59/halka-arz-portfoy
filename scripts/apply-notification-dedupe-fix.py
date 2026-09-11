from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new), encoding='utf-8')


replace_once(
    'public/core/notification-rules.js',
    "  return { kind:'portfolio', ticker:'', title:'Portföy yükselişi', body:`Toplam portföy bugün +%${Math.abs(level)} seviyesini geçti.` };",
    "  return { kind:'portfolio', ticker:'', level:String(level), title:'Portföy yükselişi', body:`Toplam portföy bugün +%${Math.abs(level)} seviyesini geçti.` };",
)

replace_once(
    'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java',
    "        data.put(\"ticker\", \"\");\n        data.put(\"title\", \"Portföy yükselişi\");",
    "        data.put(\"ticker\", \"\");\n        data.put(\"level\", String.valueOf(level));\n        data.put(\"title\", \"Portföy yükselişi\");",
)

replace_once(
    'android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java',
    "        String deliveryDay = LocalDate.now(ZoneId.of(\"Europe/Istanbul\")).toString();\n        String deliveryKey = kind + \"|\" + ticker + \"|\" + body;",
    "        String deliveryDay = LocalDate.now(ZoneId.of(\"Europe/Istanbul\")).toString();\n        String deliveryKey;\n        if (\"portfolio\".equals(kind)) {\n            deliveryKey = kind + \"|\" + value(data, \"level\", body);\n        } else if (\"ceiling\".equals(kind) || \"floor\".equals(kind)) {\n            deliveryKey = kind + \"|\" + ticker;\n        } else {\n            deliveryKey = kind + \"|\" + ticker + \"|\" + body;\n        }",
)
