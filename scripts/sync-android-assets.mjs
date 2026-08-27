import fs from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve('public');
const target = path.resolve('android/app/src/main/assets/www');
await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.cp(source, target, { recursive: true });
console.log(`Android assets synced: ${source} -> ${target}`);
