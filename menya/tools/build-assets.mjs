// アイコン(Phosphor duotone)と店長ポートレート(DiceBear Micah)を生成する
// 使い方: npm i @phosphor-icons/core @dicebear/core @dicebear/collection && node tools/build-assets.mjs <node_modulesのパス>
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const nm = path.resolve(process.argv[2] || 'node_modules');
const require = createRequire(nm + '/');
const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, '..');

const data = fs.readFileSync(path.join(out, 'js/data.js'), 'utf8');
const names = new Set([...data.matchAll(/icon: '([a-z0-9-]+)'/g)].map((m) => m[1]));
`coins megaphone flower-tulip sun leaf snowflake speaker-high speaker-slash storefront bowl-steam chef-hat microscope
chart-line-up users star lock key hammer armchair potted-plant briefcase bank bell-ringing airplane-takeoff sparkle
hourglass arrows-clockwise check-circle lightbulb smiley smiley-meh smiley-sad smiley-angry smiley-wink map-pin x plus
minus play pause fast-forward star-four trend-up caret-up caret-down piggy-bank info trash seal-check crown
user-circle-plus currency-jpy heart tree`.split(/\s+/).forEach((n) => names.add(n));

const icons = {};
for (const n of [...names].sort()) {
  const f = path.join(nm, '@phosphor-icons/core/assets/duotone', n + '-duotone.svg');
  if (!fs.existsSync(f)) throw new Error('missing icon ' + n);
  icons[n] = fs.readFileSync(f, 'utf8').replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
fs.writeFileSync(path.join(out, 'js/icons.js'),
  '/* Phosphor Icons (duotone) — MIT License, https://phosphoricons.com — tools/build-assets.mjs で生成 */\nwindow.MENYA_ICONS = ' + JSON.stringify(icons) + ';\n');

const { createAvatar } = require('@dicebear/core');
const { micah } = require('@dicebear/collection');
for (let i = 0; i < 18; i++) {
  const svg = createAvatar(micah, { seed: 'menya-staff-' + i, mouth: ['laughing', 'smile', 'smirk'], eyebrows: ['up', 'eyelashesUp'], eyes: ['eyes', 'round', 'smiling'] }).toString();
  fs.writeFileSync(path.join(out, `assets/avatars/m${i}.svg`), svg);
}
console.log(Object.keys(icons).length, 'icons, 18 avatars');
