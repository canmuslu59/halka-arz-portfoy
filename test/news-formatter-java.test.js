import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Android news display keeps scheduled titles and removes generic landing-page bullets', {
  skip:spawnSync('javac', ['-version']).error ? 'JDK compiler unavailable locally' : false,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'news-formatter-'));
  try {
    const harness = join(dir, 'NewsFormatterHarness.java');
    writeFileSync(harness, `package com.innative.halkaarz;
class NewsFormatterHarness {
  public static void main(String[] args) {
    String body = "• TCMB rezervlerinde düşüş sürüyor\\n\\n• Borsa Kapanış\\n\\n• Çeyrek Altın\\n\\n• Cumhuriyet Altını";
    System.out.println(NewsNotificationFormatter.digestTitle("📰 Akşama Düşenler", body, "evening"));
    System.out.println(NewsNotificationFormatter.digestTitle("🏦 Faiz ve Piyasa Gündemi", body, "morning"));
    System.out.println(NewsNotificationFormatter.digestBody(body));
    System.out.println("onlyGenericEmpty=" + NewsNotificationFormatter.digestBody("• Borsa Kapanış\\n\\n• Çeyrek Altın").isEmpty());
  }
}`);
    const source = 'android/app/src/main/java/com/innative/halkaarz/NewsNotificationFormatter.java';
    const compile = spawnSync('javac', ['-encoding', 'UTF-8', '-d', dir, source, harness], { encoding:'utf8' });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync('java', ['-cp', dir, 'com.innative.halkaarz.NewsFormatterHarness'], { encoding:'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.stdout.trim().split(/\r?\n/), [
      '🌙 Akşam Finans Özeti',
      '☀️ Sabah Finans Özeti',
      '• TCMB rezervlerinde düşüş sürüyor',
      'onlyGenericEmpty=true',
    ]);
  } finally {
    rmSync(dir, { recursive:true, force:true });
  }
});
