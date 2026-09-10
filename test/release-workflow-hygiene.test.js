import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

async function read(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function collectFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
    else files.push(entryPath);
  }
  return files;
}

test('release candidate uses the open-source basic Gradle cache provider', async () => {
  const workflow = await read('.github/workflows/release-candidate.yml');
  assert.match(workflow, /gradle\/actions\/setup-gradle@v6\.3\.0[\s\S]*cache-provider:\s*basic/);
});

test('release runtime has no dependency on historical CI staging files and carries no staging directory', async () => {
  const roots = ['.github/workflows', 'android', 'backend', 'public', 'scripts', 'test'];
  const rootFiles = ['package.json', 'server.js'];
  const candidates = [...rootFiles];
  for (const root of roots) candidates.push(...await collectFiles(root));

  const self = path.normalize('test/release-workflow-hygiene.test.js');
  const stagingRef = '.' + 'ci/';
  const references = [];
  for (const filePath of candidates) {
    if (path.normalize(filePath) === self) continue;
    const content = await read(filePath).catch(() => '');
    if (content.includes(stagingRef)) references.push(filePath);
  }

  assert.deepEqual(references, [], `live release files still reference historical CI staging: ${references.join(', ')}`);
  await assert.rejects(fs.access('.' + 'ci'), { code: 'ENOENT' });
});
