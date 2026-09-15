import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Android cached close fallback is only captured after 20:00 and only replaces a missing previous close on a later trading day', () => {
  const dir = mkdtempSync(join(tmpdir(), 'halka-close-fallback-java-'));
  try {
    execFileSync('javac', [
      '-d', dir,
      'android/app/src/main/java/com/innative/halkaarz/MarketCloseFallback.java',
      'test/fixtures/MarketCloseFallbackProbe.java',
    ], { stdio:'pipe' });
    execFileSync('java', ['-cp', dir, 'com.innative.halkaarz.MarketCloseFallbackProbe'], { stdio:'pipe' });
  } finally {
    rmSync(dir, { recursive:true, force:true });
  }
});
