// データの検証と統計表示:  node tools/check.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../lib/compile.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const warnings = [];
const db = compile(path.join(root, 'data'), (w) => warnings.push(w));
for (const w of warnings) console.warn('WARN', w);
const byDomain = {};
for (const e of db.entities) byDomain[e.d] = (byDomain[e.d] || 0) + 1;
console.log(`questions: ${db.questions.length}`);
console.log(`entities:  ${db.entities.length}`, byDomain);
process.exitCode = warnings.length ? 1 : 0;
