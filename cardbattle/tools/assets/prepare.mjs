/**
 * 素材の加工：cardbattle/thirdparty（ダウンロードした未加工の素材）から、
 * ゲームで使うファイルだけを選んで packages/client/public/assets/game/ に書き出す。
 *  - 3Dモデル：glTF → GLB（テクスチャは 512px の WebP に縮小、不要データを削除）
 *  - カード枠：LAYERLAB の枠をレアリティの色に色替え
 *  - UI・パーティクル・効果音・フォント：選んだファイルをコピー
 * 使い方：npm run assets:prepare
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'thirdparty');
const OUT = join(ROOT, 'packages/client/public/assets/game');

const Q = 'Quaternius';
const UAC = `${Q}/UltimateAnimatedCharacter/glTF`;
const MON = `${Q}/UltimateMonsters`;
const MVK = `${Q}/MedievalVillageMegaKit/glTF`;

/** 出力名 → 元ファイル */
const MODELS = {
  // ユニット
  knight: `${UAC}/Knight_Male.gltf`,
  archer: `${UAC}/Elf.gltf`,
  giant: `${MON}/Big/glTF/Yeti.gltf`,
  skeleton: `${MON}/Big/glTF/Orc_Skull.gltf`,
  wyvern: `${MON}/Flying/glTF/Dragon_Evolved.gltf`,
  // タワー・建物・アリーナの部品
  wall: `${MVK}/Wall_UnevenBrick_Straight.gltf`,
  pillar: `${MVK}/Corner_Exterior_Brick.gltf`,
  tower_roof: `${MVK}/Roof_Tower_RoundTiles.gltf`,
  crate: `${MVK}/Prop_Crate.gltf`,
  chimney: `${MVK}/Prop_Chimney.gltf`,
  fence: `${MVK}/Prop_WoodenFence_Single.gltf`,
  fence_ext: `${MVK}/Prop_WoodenFence_Extension1.gltf`,
  floor_wood: `${MVK}/Floor_WoodDark.gltf`,
  border: `${MVK}/Prop_ExteriorBorder_Straight1.gltf`,
  vine: `${MVK}/Prop_Vine2.gltf`,
};

const KUI = 'Kenney/ui-pack/PNG';
const RPG = 'Kenney/ui-pack-rpg-expansion/PNG';
const FUI = 'Kenney/fantasy-ui-borders/PNG/Default';
const PART = 'Kenney/particle-pack/PNG (Transparent)';
const LAY = 'LAYERLAB/GUICardFrame/PNG';

/** 出力パス → 元ファイル（そのままコピー） */
const COPIES = {
  'ui/panel_brown.png': `${RPG}/panel_brown.png`,
  'ui/panel_beige.png': `${RPG}/panel_beige.png`,
  'ui/panel_inset_brown.png': `${RPG}/panelInset_brown.png`,
  'ui/button_beige.png': `${RPG}/buttonLong_beige.png`,
  'ui/button_beige_pressed.png': `${RPG}/buttonLong_beige_pressed.png`,
  'ui/button_blue.png': `${RPG}/buttonLong_blue.png`,
  'ui/button_blue_pressed.png': `${RPG}/buttonLong_blue_pressed.png`,
  'ui/button_brown.png': `${RPG}/buttonLong_brown.png`,
  'ui/button_brown_pressed.png': `${RPG}/buttonLong_brown_pressed.png`,
  'ui/bar_back_l.png': `${RPG}/barBack_horizontalLeft.png`,
  'ui/bar_back_m.png': `${RPG}/barBack_horizontalMid.png`,
  'ui/bar_back_r.png': `${RPG}/barBack_horizontalRight.png`,
  'ui/bar_blue_m.png': `${RPG}/barBlue_horizontalBlue.png`,
  'ui/bar_red_m.png': `${RPG}/barRed_horizontalMid.png`,
  'ui/bar_yellow_m.png': `${RPG}/barYellow_horizontalMid.png`,
  'ui/border_panel.png': `${FUI}/Panel/panel-011.png`,
  'ui/border_frame.png': `${FUI}/Border/panel-border-011.png`,
  'ui/star_yellow.png': `${KUI}/Yellow/Default/star.png`,
  'ui/star_blue.png': `${KUI}/Blue/Default/star.png`,
  'ui/star_red.png': `${KUI}/Red/Default/star.png`,
  'ui/star_grey.png': `${KUI}/Grey/Default/star_outline_depth.png`,
  'ui/icon_play.png': `${KUI}/Extra/Default/icon_play_light.png`,
  'ui/icon_repeat.png': `${KUI}/Extra/Default/icon_repeat_light.png`,
  'ui/cursor_sword.png': `${RPG}/cursorSword_gold.png`,
  'cards/frame_bg.png': `${LAY}/CardFrame_Rectangle_01_Blue_Bg.png`,
  'cards/spell_fire_orb.png': `${Q}/3DCardKitFantasy/Renders/1_Fireball.png`,
  'cards/spell_thunder_strike.png': `${Q}/3DCardKitFantasy/Renders/21_Element_Lightning.png`,
  // パーティクル
  'fx/star.png': `${PART}/star_06.png`,
  'fx/spark.png': `${PART}/spark_02.png`,
  'fx/smoke.png': `${PART}/smoke_05.png`,
  'fx/fire.png': `${PART}/fire_01.png`,
  'fx/flame.png': `${PART}/flame_05.png`,
  'fx/circle.png': `${PART}/circle_03.png`,
  'fx/dirt.png': `${PART}/dirt_02.png`,
  'fx/magic.png': `${PART}/magic_03.png`,
  'fx/scorch.png': `${PART}/scorch_02.png`,
  'fx/light.png': `${PART}/light_01.png`,
  'fx/lightning.png': `${PART}/spark_06.png`,
  'fx/slash.png': `${PART}/slash_03.png`,
  'fx/trace.png': `${PART}/trace_06.png`,
  // 効果音
  'sfx/deploy.ogg': 'Kenney/impact-sounds/Audio/impactSoft_heavy_000.ogg',
  'sfx/hit_1.ogg': 'Kenney/impact-sounds/Audio/impactPunch_medium_000.ogg',
  'sfx/hit_2.ogg': 'Kenney/impact-sounds/Audio/impactPunch_medium_001.ogg',
  'sfx/hit_3.ogg': 'Kenney/impact-sounds/Audio/impactPunch_medium_002.ogg',
  'sfx/arrow.ogg': 'Kenney/impact-sounds/Audio/impactWood_light_000.ogg',
  'sfx/tower_shot.ogg': 'Kenney/impact-sounds/Audio/impactPlank_medium_000.ogg',
  'sfx/fireball.ogg': 'Kenney/impact-sounds/Audio/impactPlate_heavy_000.ogg',
  'sfx/lightning.ogg': 'Kenney/impact-sounds/Audio/impactGlass_heavy_000.ogg',
  'sfx/tower_break.ogg': 'Kenney/impact-sounds/Audio/impactMining_002.ogg',
  'sfx/tower_break2.ogg': 'Kenney/impact-sounds/Audio/impactMetal_heavy_000.ogg',
  'sfx/death.ogg': 'Kenney/impact-sounds/Audio/impactSoft_medium_001.ogg',
  'sfx/crown.ogg': 'Kenney/interface-sounds/Audio/confirmation_002.ogg',
  'sfx/select.ogg': 'Kenney/interface-sounds/Audio/select_001.ogg',
  'sfx/place.ogg': 'Kenney/interface-sounds/Audio/drop_002.ogg',
  'sfx/invalid.ogg': 'Kenney/interface-sounds/Audio/error_004.ogg',
  'sfx/click.ogg': 'Kenney/interface-sounds/Audio/click_002.ogg',
  'sfx/announce.ogg': 'Kenney/interface-sounds/Audio/maximize_006.ogg',
  'sfx/win.ogg': 'Kenney/interface-sounds/Audio/confirmation_004.ogg',
  'sfx/lose.ogg': 'Kenney/interface-sounds/Audio/back_003.ogg',
  'sfx/card.ogg': 'Kenney/rpg-audio/Audio/bookFlip1.ogg',
  // フォント
  'fonts/MPLUSRounded1c-Bold.ttf': 'Fonts/MPLUSRounded1c/MPLUSRounded1c-Bold.ttf',
  'fonts/MPLUSRounded1c-ExtraBold.ttf': 'Fonts/MPLUSRounded1c/MPLUSRounded1c-ExtraBold.ttf',
};

/** カード枠の色替え（レアリティ：コモン＝灰、レア＝橙、エピック＝紫、レジェンド＝虹色系） */
const FRAMES = [
  { out: 'cards/frame_common.png', src: `${LAY}/CardFrame_Rectangle_01_Blue_Border.png`, op: (s) => s.modulate({ saturation: 0.05, brightness: 1.15 }) },
  { out: 'cards/frame_rare.png', src: `${LAY}/CardFrame_Rectangle_01_Yellow_Border.png`, op: (s) => s },
  { out: 'cards/frame_epic.png', src: `${LAY}/CardFrame_Rectangle_01_Purple_Border.png`, op: (s) => s },
  { out: 'cards/frame_legendary.png', src: `${LAY}/CardFrame_Rectangle_01_Red_BorderGem.png`, op: (s) => s.modulate({ saturation: 1.3 }) },
];

/** BGM：用途 → 魔王魂の曲ファイル（https://maou.audio/ から手動でダウンロードして置く） */
const BGM = {
  battle: 'MaouDamashii/maou_game_battle01.mp3',
  home: 'MaouDamashii/maou_game_town01.mp3',
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** ゲームで使うアニメーションだけ残す（ファイルサイズ削減） */
const KEEP_ANIMS = {
  knight: ['Idle', 'Walk', 'Run', 'SwordSlash', 'Death'],
  archer: ['Idle', 'Walk', 'Shoot_OneHanded', 'Death'],
  giant: ['Idle', 'Walk', 'Punch', 'Death'],
  skeleton: ['Idle', 'Run', 'Weapon', 'Death'],
  wyvern: ['Flying_Idle', 'Fast_Flying', 'Headbutt', 'Death'],
};

async function prepareModel(name, rel) {
  const doc = await io.read(join(SRC, rel));
  const keep = KEEP_ANIMS[name];
  if (keep) for (const a of doc.getRoot().listAnimations()) if (!keep.includes(a.getName())) a.dispose();
  await doc.transform(
    resample(), // アニメーションの冗長なキーフレームを削除
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 85 }),
  );
  const out = join(OUT, 'models', `${name}.glb`);
  await io.write(out, doc);
  // 陣営の色替え：屋根などのテクスチャを、明るさを保ったまま青・赤に染めた版も作る
  if (TEAM_TINT[name]) {
    for (const [team, rgb] of Object.entries(TEAM_TINT[name].colors)) {
      const variant = await io.read(out);
      for (const tex of variant.getRoot().listTextures()) {
        if (!TEAM_TINT[name].match.test(tex.getName() + tex.getURI())) continue;
        // 白黒にして明るさを持ち上げ、陣営色を乗算する
        const src = sharp(tex.getImage());
        const { width, height } = await src.metadata();
        const grey = await src.grayscale().linear(1.35, 40).toColorspace('srgb').png().toBuffer();
        const img = await sharp(grey)
          .composite([{ input: { create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }, blend: 'multiply' }])
          .webp({ quality: 85 })
          .toBuffer();
        tex.setImage(new Uint8Array(img)).setMimeType('image/webp');
      }
      await io.write(join(OUT, 'models', `${name}_${team}.glb`), variant);
    }
  }
  return (await stat(out)).size;
}

/** 陣営色の版を作るモデル（自分＝青、相手＝赤） */
const TEAM_TINT = {
  tower_roof: { match: /RoundTiles_BaseColor/, colors: { blue: [60, 120, 255], red: [255, 70, 55] } },
};

async function main() {
  if (!existsSync(SRC)) throw new Error(`${SRC} がありません。先に npm run assets:fetch を実行してください`);
  await rm(OUT, { recursive: true, force: true });
  for (const d of ['models', 'ui', 'cards', 'fx', 'sfx', 'fonts']) await mkdir(join(OUT, d), { recursive: true });

  let total = 0;
  for (const [name, rel] of Object.entries(MODELS)) {
    const size = await prepareModel(name, rel);
    total += size;
    console.log(`model ${name.padEnd(12)} ${(size / 1024).toFixed(0).padStart(6)} KB  ← ${rel}`);
  }
  for (const [out, rel] of Object.entries(COPIES)) {
    const dst = join(OUT, out);
    if (out.startsWith('cards/spell_')) {
      // Card Kit のレンダー画像をカードの絵の大きさに縮小
      // 絵の周りの飾り枠を切り落としてから縮小する
      const img = sharp(join(SRC, rel));
      const { width, height } = await img.metadata();
      await img.extract({ left: Math.round(width * 0.12), top: Math.round(height * 0.1), width: Math.round(width * 0.76), height: Math.round(height * 0.8) })
        .resize(320, 400, { fit: 'cover', position: 'centre' }).webp({ quality: 85 }).toFile(dst.replace(/\.png$/, '.webp'));
    } else await copyFile(join(SRC, rel), dst);
  }
  for (const f of FRAMES) await f.op(sharp(join(SRC, f.src))).png().toFile(join(OUT, f.out));
  await writeFile(join(OUT, 'README.txt'), 'tools/assets/prepare.mjs が自動生成したファイルです。手で編集しないでください。\n');
  // BGM（魔王魂）：thirdparty/MaouDamashii/ に置かれていればコピーする
  const bgm = [];
  for (const [name, rel] of Object.entries(BGM)) {
    if (!existsSync(join(SRC, rel))) continue;
    await mkdir(join(OUT, 'bgm'), { recursive: true });
    await copyFile(join(SRC, rel), join(OUT, 'bgm', `${name}.mp3`));
    bgm.push(name);
  }
  console.log(bgm.length ? `bgm: ${bgm.join(', ')}` : 'bgm: なし（thirdparty/MaouDamashii/ に置くと使われます）');
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ modelExt: 'glb', bgm, generatedBy: 'tools/assets/prepare.mjs' }));
  console.log(`models total ${(total / 1024 / 1024).toFixed(2)} MB, files copied ${Object.keys(COPIES).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
