// src/renderer 内の HTML / CSS を dist/renderer にコピーする
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = 'src/renderer';
const outDir = 'dist/renderer';
mkdirSync(outDir, { recursive: true });

for (const file of readdirSync(srcDir)) {
  if (/\.(html|css|svg|png)$/.test(file)) {
    cpSync(join(srcDir, file), join(outDir, file));
  }
}
