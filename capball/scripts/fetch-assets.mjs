// 外部素材を配布元から取得し、ゲーム用に加工して public/assets に置く。
// 効果音ラボ・OpenTracks の音源は再配布できないため、リポジトリには含めずビルドのたびに取得する。
// CC0 素材（KayKit / Poly Haven）も同じ流れで取得する（出典を一か所で管理するため）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { processModels } from './process-models.mjs';
import { processSky } from './process-sky.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(ROOT, '.asset-cache');
const OUT = path.join(ROOT, 'public', 'assets');

const KK_ADV = 'https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0@main/addons/kaykit_character_pack_adventures';
const KK_CITY = 'https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0@main/addons/kaykit_city_builder_bits/Assets/gltf';
// KayKit Character Animations 1.1 (CC0)。公式配布は itch.io のみのため、同梱ライセンス付きの GitHub ミラーから取得する。
const KK_ANIM = 'https://cdn.jsdelivr.net/gh/NoLimitNexus/game-models@main/library/animations';
const PH = 'https://dl.polyhaven.org/file/ph-assets';
const SEL = 'https://soundeffect-lab.info/sound';

export const SOURCES = {
  kaykit: [
    ...['Knight', 'Barbarian', 'Mage', 'Rogue'].map((n) => [`${KK_ADV}/Characters/gltf/${n}.glb`, `kaykit/${n}.glb`]),
    [`${KK_ADV}/LICENSE.txt`, 'kaykit/LICENSE-adventurers.txt'],
    [`${KK_ANIM}/Rig_Medium_MovementAdvanced.glb`, 'kaykit/Rig_Medium_MovementAdvanced.glb'],
    [`${KK_ANIM}/Rig_Medium_General.glb`, 'kaykit/Rig_Medium_General.glb'],
    [`${KK_ANIM}/Rig_Medium_Simulation.glb`, 'kaykit/Rig_Medium_Simulation.glb'],
    [`${KK_ANIM}/Rig_Medium_CombatMelee.glb`, 'kaykit/Rig_Medium_CombatMelee.glb'],
    [`${KK_ANIM}/Rig_Medium_MovementBasic.glb`, 'kaykit/Rig_Medium_MovementBasic.glb'],
    [`${KK_ANIM}/../../licenses/kaykit-character-animations.txt`, 'kaykit/LICENSE-animations.txt'],
    [`${KK_CITY}/citybits_texture.png`, 'city/citybits_texture.png'],
    [`${KK_CITY}/../LICENSE.txt`, 'city/LICENSE.txt'],
    ...['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H',
      'streetlight', 'bench', 'bush', 'watertower', 'trash_A', 'trash_B', 'dumpster', 'firehydrant', 'box_A', 'box_B',
      'car_hatchback', 'car_sedan', 'car_taxi', 'car_stationwagon', 'road_straight', 'road_corner', 'base']
      .flatMap((n) => [[`${KK_CITY}/${n}.gltf`, `city/${n}.gltf`], [`${KK_CITY}/${n}.bin`, `city/${n}.bin`]]),
  ],
  polyhaven: [
    [`${PH}/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr`, 'polyhaven/sky_2k.hdr'],
    [`${PH}/Models/gltf/1k/baseball_bat/baseball_bat_1k.gltf`, 'polyhaven/bat/baseball_bat_1k.gltf'],
    [`${PH}/Models/gltf/8k/baseball_bat/baseball_bat.bin`, 'polyhaven/bat/baseball_bat.bin'],
    ...['diff', 'nor_gl', 'arm'].map((t) => [`${PH}/Models/jpg/1k/baseball_bat/baseball_bat_${t}_1k.jpg`, `polyhaven/bat/textures/baseball_bat_${t}_1k.jpg`]),
  ],
  // 画面の部品（OpenGameArt に置かれている Kenney の配布物と、自販機の 3D モデル。どれも CC0）
  ui: [
    ['https://opengameart.org/sites/default/files/kenney_ui-pack.zip', 'ui/kenney_ui-pack.zip'],
    ['https://opengameart.org/sites/default/files/Kenney_gameIcons.zip', 'ui/kenney_game-icons.zip'],
    ['https://opengameart.org/sites/default/files/vending_machines.zip', 'ui/vending_machines.zip'],
  ],
  // 効果音ラボ（https://soundeffect-lab.info/）: 商用可・クレジット不要・再配布禁止
  // サイトの直リンク禁止に従い自動取得はしない。サイトから手で保存した mp3 を sounds-local/ に置くと取り込む
  // （[元のファイル名, ゲーム内の名前]）
  se: [
    ['various/mp3/tennis-racket2.mp3', 'hit_light'],
    ['various/mp3/metal-bat2.mp3', 'hit_hard'],
    ['various/mp3/metal-bat1.mp3', 'hit_homerun'],
    ['various/mp3/ball-mitt-catch1.mp3', 'catch'],
    ['various/mp3/ball-mitt-catch2.mp3', 'catch_fast'],
    ['battle/mp3/sword-gesture2.mp3', 'swing'],
    ['battle/mp3/whip-gesture1.mp3', 'throw'],
    ['various/mp3/table-tennis-ball1.mp3', 'bounce'],
    ['various/mp3/sliding1.mp3', 'slide'],
    ['various/mp3/dash-soil1.mp3', 'run'],
    ['various/mp3/cheer1.mp3', 'cheer'],
    ['voice/mp3/people/people-stadium-cheer1.mp3', 'cheer_big'],
    ['various/mp3/clapping-hands1.mp3', 'clap'],
    ['various/mp3/police-whistle1.mp3', 'whistle'],
    ['environment/mp3/furin-house2.mp3', 'ambience'],
    ['anime/mp3/tin1.mp3', 'sad'],
    ['anime/mp3/shakin3.mp3', 'shakin'],
    ['button/mp3/decision3.mp3', 'ui_ok'],
    ['button/mp3/cursor7.mp3', 'ui_move'],
    ['button/mp3/cancel3.mp3', 'ui_cancel'],
    ['anime/mp3/school-chime1.mp3', 'chime'],
  ].map(([p, n]) => [`${SEL}/${p}`, `se/${n}.mp3`, p.split('/').pop()]),
  // OpenTracks（旧DOVA-SYNDROME）: 商用可・クレジット任意・再配布禁止
  bgm: [
    [1887, 'title', '夏の日のベースボール', 'F3'],
    [8965, 'game', 'メジャーの星 cheering pep squad', 'TOGA'],
    [23140, 'win', '勝利したあと', 'VeryGoodMan'],
    [0, 'lose', '', ''],
  ],
};

async function fetchBuf(url, init = {}, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow', ...init, headers: { 'user-agent': 'Mozilla/5.0 (asset fetch)', ...(init.headers || {}) } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return { res, buf: Buffer.from(await res.arrayBuffer()) };
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

async function get(url, rel, init) {
  const dst = path.join(CACHE, rel);
  if (fs.existsSync(dst) && fs.statSync(dst).size > 0) return dst;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const { buf } = await fetchBuf(url, init);
  fs.writeFileSync(dst, buf);
  console.log('  ✓', rel, `${(buf.length / 1024).toFixed(0)}KB`);
  return dst;
}

// OpenTracks は「ダウンロードページ → フォーム送信」の手順でファイルを渡す（ブラウザと同じ手順を踏む）
async function getOpenTracks(id, rel) {
  const dst = path.join(CACHE, rel);
  if (fs.existsSync(dst) && fs.statSync(dst).size > 0) return dst;
  const pageUrl = `https://opentracks.com/bgm/detail/${id}/download`;
  const { res, buf } = await fetchBuf(pageUrl);
  const html = buf.toString('utf8');
  const token = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1];
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (!token) throw new Error('csrf token not found: ' + pageUrl);
  const { buf: mp3 } = await fetchBuf(pageUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, referer: pageUrl, origin: 'https://opentracks.com' },
    body: new URLSearchParams({ csrfmiddlewaretoken: token, track: '1' }).toString(),
  });
  if (mp3.length < 10000 || mp3.subarray(0, 15).toString().includes('<')) throw new Error('not an audio file: ' + id);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, mp3);
  console.log('  ✓', rel, `${(mp3.length / 1024).toFixed(0)}KB`);
  return dst;
}

/** BGM を配信向けのビットレートに変換する（ffmpeg があれば。曲の内容は変えない） */
function shrinkBgm() {
  const dir = path.join(CACHE, 'bgm');
  if (!fs.existsSync(dir)) return;
  const has = spawnSync('ffmpeg', ['-version']).status === 0;
  if (!has) return;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.mp3') && !f.includes('.96k.'))) {
    const src = path.join(dir, f), dst = path.join(dir, f.replace('.mp3', '.96k.mp3'));
    if (!fs.existsSync(dst)) spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-b:a', '96k', '-ar', '44100', dst]);
  }
}

/** UI の部品：Kenney UI Pack のボタン・Kenney Game Icons のアイコンを public/assets/ui に、自販機を models/vending.glb に */
const UI_COLORS = ['Yellow', 'Red', 'Green', 'Blue', 'Grey'];
const UI_ICONS = ['trophy', 'shoppingCart', 'target', 'star', 'singleplayer', 'home', 'pause', 'musicOn', 'musicOff', 'audioOn', 'audioOff', 'arrowLeft', 'locked', 'medal1', 'leaderboardsComplex', 'checkmark', 'cross', 'information', 'return', 'gear', 'plus', 'next', 'right'];
async function processUi() {
  const ex = (zip) => {
    const dir = path.join(CACHE, 'ui', 'x_' + path.basename(zip, '.zip'));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      const r = spawnSync('unzip', ['-q', '-o', path.join(CACHE, zip), '-d', dir]);
      if (r.status !== 0) throw new Error('unzip failed: ' + zip);
    }
    return dir;
  };
  const out = path.join(OUT, 'ui');
  fs.mkdirSync(out, { recursive: true });
  const kui = path.join(ex('ui/kenney_ui-pack.zip'), 'PNG');
  for (const c of UI_COLORS) {
    const lc = c.toLowerCase();
    fs.copyFileSync(path.join(kui, c, 'Double', 'button_rectangle_depth_flat.png'), path.join(out, `btn_${lc}.png`));
    fs.copyFileSync(path.join(kui, c, 'Double', 'button_rectangle_flat.png'), path.join(out, `btn_${lc}_down.png`));
    fs.copyFileSync(path.join(kui, c, 'Double', 'button_square_depth_flat.png'), path.join(out, `sq_${lc}.png`));
    fs.copyFileSync(path.join(kui, c, 'Double', 'button_round_depth_flat.png'), path.join(out, `round_${lc}.png`));
  }
  fs.copyFileSync(path.join(kui, 'Yellow', 'Double', 'star.png'), path.join(out, 'star.png'));
  fs.copyFileSync(path.join(kui, 'Grey', 'Double', 'star.png'), path.join(out, 'star_off.png'));
  fs.copyFileSync(path.join(kui, 'Extra', 'Double', 'input_rectangle.png'), path.join(out, 'input.png'));
  const icons = path.join(ex('ui/kenney_game-icons.zip'), 'PNG', 'White', '2x');
  for (const n of UI_ICONS) fs.copyFileSync(path.join(icons, `${n}.png`), path.join(out, `i_${n}.png`));
  // 自販機（FBX）→ glTF バイナリ
  const vm = path.join(OUT, 'models', 'vending.glb');
  if (!fs.existsSync(vm)) {
    const dir = ex('ui/vending_machines.zip');
    const fbx = fs.readdirSync(dir).find((f) => f.endsWith('.fbx'));
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'fbx-to-glb.mjs'), path.join(dir, fbx), vm], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('vending machine conversion failed');
  }
  console.log('[ui] Kenney UI / icons / vending machine');
}

/** sounds-local/ に置かれた効果音ラボの mp3 を、ゲーム内の名前に揃えて取り込む */
function importLocalSounds() {
  const dir = path.join(ROOT, 'sounds-local');
  if (!fs.existsSync(dir)) {
    console.log('[se] sounds-local/ がないので効果音なしで進めます（SOUNDS.md 参照）');
    return;
  }
  const files = fs.readdirSync(dir);
  let n = 0;
  for (const [, rel, original] of SOURCES.se) {
    const name = path.basename(rel);
    const hit = files.find((f) => f === original || f === name);
    if (!hit) continue;
    fs.mkdirSync(path.join(CACHE, 'se'), { recursive: true });
    fs.copyFileSync(path.join(dir, hit), path.join(CACHE, rel));
    n++;
  }
  console.log(`[se] sounds-local/ から ${n}/${SOURCES.se.length} 個を取り込みました`);
}

async function main() {
  console.log('[fetch] KayKit / Poly Haven');
  for (const [u, r] of [...SOURCES.kaykit, ...SOURCES.polyhaven, ...SOURCES.ui]) await get(u, r);
  console.log('[fetch] OpenTracks');
  for (const [id, name] of SOURCES.bgm) if (id) await getOpenTracks(id, `bgm/${name}.mp3`);

  console.log('[process]');
  fs.mkdirSync(OUT, { recursive: true });
  await processModels(CACHE, OUT);
  await processSky(CACHE, OUT);
  await processUi();
  importLocalSounds();
  shrinkBgm();
  for (const dir of ['se', 'bgm']) {
    fs.mkdirSync(path.join(OUT, dir), { recursive: true });
    if (!fs.existsSync(path.join(CACHE, dir))) continue;
    for (const f of fs.readdirSync(path.join(CACHE, dir))) {
      if (dir === 'bgm' && !f.includes('.96k.') && fs.existsSync(path.join(CACHE, dir, f.replace('.mp3', '.96k.mp3')))) continue;
      fs.copyFileSync(path.join(CACHE, dir, f), path.join(OUT, dir, f.replace('.96k.', '.')));
    }
  }
  console.log('[done]', OUT);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
