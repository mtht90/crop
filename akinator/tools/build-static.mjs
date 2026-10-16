// サーバーなしで動かす用（GitHub Pages 等）: public/db.json を書き出す
//   node tools/build-static.mjs
// この場合、学習データは各プレイヤーのブラウザ(localStorage)にだけ貯まる。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../lib/compile.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = compile(path.join(root, 'data'), (w) => console.warn('WARN', w));
fs.writeFileSync(path.join(root, 'public', 'db.json'), JSON.stringify(db));
console.log(`public/db.json: ${db.entities.length} entities / ${db.questions.length} questions`);
