// Wholetone「Ivory & Lacquer」無料サンプラーのカードUI素材を取ってきて src/ui-assets/wt/ に置く。
// ライセンスにより素材ファイルは公開リポジトリに置けないので、git には入れずビルド時に取得する。
// （ビルドしたゲームに含めて公開するのは許可されている）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const OUT = 'src/ui-assets/wt';
const FILES = [
  'card_frame_attack', 'card_art_window', 'card_text_box', 'card_type_plate_attack', 'card_trim_common', 'card_trim_rare',
  'card_banner_common', 'card_banner_rare', 'card_cost_gem_attack', 'card_rarity_mark_common', 'card_rarity_mark_rare',
  'card_back', 'card_shadow', 'card_glow_playable', 'card_focus', 'panel', 'button_primary_normal', 'button_primary_pressed',
  'button_primary_disabled', 'end_turn_normal', 'end_turn_hover', 'energy_orb_full', 'pile_draw',
];
if (FILES.every((f) => fs.existsSync(path.join(OUT, `${f}.png`)))) {
  console.log('fetch-ui: 取得済み');
  process.exit(0);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-'));
const zip = path.join(tmp, 'wt.zip');
execFileSync('node', ['scripts/fetch-itch.mjs', 'https://wholetoneassets.itch.io/ivory-lacquer-free-sampler', '\\.zip', zip], { stdio: 'inherit' });
execFileSync('unzip', ['-o', '-q', zip, '-d', tmp]);
const root = fs.readdirSync(tmp).map((d) => path.join(tmp, d)).find((d) => fs.existsSync(path.join(d, 'ui', '2x')));
if (!root) throw new Error('zip の中身が想定と違います');
fs.mkdirSync(OUT, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(root, 'ui', '2x', `${f}.png`), path.join(OUT, `${f}.png`));
fs.copyFileSync(path.join(root, 'LICENSE.txt'), path.join(OUT, 'LICENSE.txt'));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`fetch-ui: ${FILES.length} 枚を ${OUT} に保存しました`);
