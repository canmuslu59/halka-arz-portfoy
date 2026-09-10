import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readMain = () => readFile(new URL('../android/app/src/main/java/com/innative/halkaarz/MainActivity.java', import.meta.url), 'utf8');

test('Android portfolio read falls back from an invalid primary to a valid backup and empties only when both are invalid', async () => {
  const java = await readMain();
  assert.match(java, /String primary = prefs\.getString\(PORTFOLIO_KEY, ""\);\s*if \(isValidJsonObject\(primary\)\) return primary;/s);
  assert.match(java, /String backup = prefs\.getString\(BACKUP_KEY, ""\);\s*return isValidJsonObject\(backup\) \? backup : "";/s);
});

test('Android portfolio write preserves the previous valid primary as backup before committing the replacement', async () => {
  const java = await readMain();
  const start = java.indexOf('public void writePortfolio(String json)');
  const end = java.indexOf('@JavascriptInterface', start + 1);
  const body = java.slice(start, end > start ? end : undefined);

  assert.match(body, /if \(!isValidJsonObject\(json\)\) return/);
  assert.match(body, /if \(isValidJsonObject\(current\)\) editor\.putString\(BACKUP_KEY, current\)/);
  assert.ok(body.indexOf('putString(BACKUP_KEY, current)') < body.indexOf('putString(PORTFOLIO_KEY, json)'));
  assert.match(body, /editor\.commit\(\)/);
});
