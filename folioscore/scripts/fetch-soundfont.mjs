// 同梱音源 (MuseScore General SF3, MIT License) を取得して SHA-256 を検証する
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'resources', 'soundfonts');
const file = path.join(dir, 'MuseScore_General.sf3');
const URL_SF = 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3';
const SHA256 = '5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

if (existsSync(file) && sha(readFileSync(file)) === SHA256) {
  console.log('soundfont: OK (already present)');
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
console.log('soundfont: downloading', URL_SF);
const res = await fetch(URL_SF);
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
if (sha(buf) !== SHA256) throw new Error('soundfont: SHA-256 mismatch');
writeFileSync(file, buf);
console.log(`soundfont: saved ${file} (${(buf.length / 1048576).toFixed(1)} MB)`);
