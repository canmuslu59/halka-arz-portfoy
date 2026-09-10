import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function normalizePortfolio(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Portföy veri dosyası bozuk.');
  }
  if (!Array.isArray(data.holdings)) data.holdings = [];
  return data;
}

export function createPortfolioStore({ filePath }) {
  if (!filePath || typeof filePath !== 'string') throw new TypeError('filePath gerekli.');
  let mutationTail = Promise.resolve();

  async function read() {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return normalizePortfolio(JSON.parse(raw));
    } catch (error) {
      if (error?.code === 'ENOENT') return { holdings:[] };
      if (error instanceof SyntaxError) throw new Error('Portföy veri dosyası bozuk.');
      throw error;
    }
  }

  async function durableWrite(data) {
    await fs.mkdir(path.dirname(filePath), { recursive:true });
    const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let handle = null;
    try {
      handle = await fs.open(tmpPath, 'w', 0o600);
      await handle.writeFile(JSON.stringify(data, null, 2), 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(tmpPath, filePath);
    } finally {
      if (handle) await handle.close().catch(() => {});
      await fs.rm(tmpPath, { force:true }).catch(() => {});
    }
  }

  function mutate(mutator) {
    if (typeof mutator !== 'function') return Promise.reject(new TypeError('mutator gerekli.'));
    const task = async () => {
      const data = await read();
      const result = await mutator(data);
      await durableWrite(data);
      return result;
    };
    const run = mutationTail.then(task, task);
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
  }

  return Object.freeze({ read, mutate });
}
