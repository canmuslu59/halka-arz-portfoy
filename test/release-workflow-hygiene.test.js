import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(path, 'utf8');
}

test('release candidate uses the open-source basic Gradle cache provider', async () => {
  const workflow = await read('.github/workflows/release-candidate.yml');
  assert.match(workflow, /gradle\/actions\/setup-gradle@v6\.3\.0[\s\S]*cache-provider:\s*basic/);
});
