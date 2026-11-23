// Tiny Swords 素材の読み込みとアニメーション定義
import Phaser from 'phaser';

export const BASE = 'assets/tiny-swords/';
export const u = (p: string) => BASE + p;

interface SheetDef {
  key: string;
  path: string;
  fw: number;
  fh: number;
  frames: number;
  rate?: number;
  repeat?: number;
}

const unitSheets = (color: 'Blue' | 'Black', prefix: string): SheetDef[] => {
  const U = `Units/${color} Units/`;
  const p = prefix;
  return [
    { key: `${p}warrior_idle`, path: U + 'Warrior/Warrior_Idle.png', fw: 192, fh: 192, frames: 8 },
    { key: `${p}warrior_run`, path: U + 'Warrior/Warrior_Run.png', fw: 192, fh: 192, frames: 6 },
    { key: `${p}warrior_attack`, path: U + 'Warrior/Warrior_Attack1.png', fw: 192, fh: 192, frames: 4, repeat: 0, rate: 12 },
    { key: `${p}warrior_guard`, path: U + 'Warrior/Warrior_Guard.png', fw: 192, fh: 192, frames: 6 },
  ];
};

export const SHEETS: SheetDef[] = [
  // 村人
  { key: 'pawn_idle', path: 'Units/Blue Units/Pawn/Pawn_Idle.png', fw: 192, fh: 192, frames: 8 },
  { key: 'pawn_run', path: 'Units/Blue Units/Pawn/Pawn_Run.png', fw: 192, fh: 192, frames: 6 },
  { key: 'pawn_idle_wood', path: 'Units/Blue Units/Pawn/Pawn_Idle Wood.png', fw: 192, fh: 192, frames: 8 },
  { key: 'pawn_run_wood', path: 'Units/Blue Units/Pawn/Pawn_Run Wood.png', fw: 192, fh: 192, frames: 6 },
  { key: 'pawn_idle_meat', path: 'Units/Blue Units/Pawn/Pawn_Idle Meat.png', fw: 192, fh: 192, frames: 8 },
  { key: 'pawn_run_meat', path: 'Units/Blue Units/Pawn/Pawn_Run Meat.png', fw: 192, fh: 192, frames: 6 },
  { key: 'pawn_idle_gold', path: 'Units/Blue Units/Pawn/Pawn_Idle Gold.png', fw: 192, fh: 192, frames: 8 },
  { key: 'pawn_run_gold', path: 'Units/Blue Units/Pawn/Pawn_Run Gold.png', fw: 192, fh: 192, frames: 6 },
  { key: 'pawn_run_axe', path: 'Units/Blue Units/Pawn/Pawn_Run Axe.png', fw: 192, fh: 192, frames: 6 },
  { key: 'pawn_run_pickaxe', path: 'Units/Blue Units/Pawn/Pawn_Run Pickaxe.png', fw: 192, fh: 192, frames: 6 },
  { key: 'pawn_run_hammer', path: 'Units/Blue Units/Pawn/Pawn_Run Hammer.png', fw: 192, fh: 192, frames: 6 },
  { key: 'pawn_run_knife', path: 'Units/Blue Units/Pawn/Pawn_Run Knife.png', fw: 192, fh: 192, frames: 6 },
  { key: 'pawn_chop', path: 'Units/Blue Units/Pawn/Pawn_Interact Axe.png', fw: 192, fh: 192, frames: 6 },
  { key: 'pawn_mine', path: 'Units/Blue Units/Pawn/Pawn_Interact Pickaxe.png', fw: 192, fh: 192, frames: 6 },
  { key: 'pawn_hammer', path: 'Units/Blue Units/Pawn/Pawn_Interact Hammer.png', fw: 192, fh: 192, frames: 3 },
  { key: 'pawn_knife', path: 'Units/Blue Units/Pawn/Pawn_Interact Knife.png', fw: 192, fh: 192, frames: 4 },
  // 兵士・僧侶
  ...unitSheets('Blue', ''),
  { key: 'archer_idle', path: 'Units/Blue Units/Archer/Archer_Idle.png', fw: 192, fh: 192, frames: 6 },
  { key: 'archer_run', path: 'Units/Blue Units/Archer/Archer_Run.png', fw: 192, fh: 192, frames: 4 },
  { key: 'archer_shoot', path: 'Units/Blue Units/Archer/Archer_Shoot.png', fw: 192, fh: 192, frames: 8, repeat: 0, rate: 14 },
  { key: 'monk_idle', path: 'Units/Blue Units/Monk/Idle.png', fw: 192, fh: 192, frames: 6 },
  { key: 'monk_run', path: 'Units/Blue Units/Monk/Run.png', fw: 192, fh: 192, frames: 4 },
  { key: 'monk_heal', path: 'Units/Blue Units/Monk/Heal.png', fw: 192, fh: 192, frames: 11 },
  { key: 'fx_heal', path: 'Units/Blue Units/Monk/Heal_Effect.png', fw: 192, fh: 192, frames: 11, repeat: 0, rate: 14 },
  // 盗賊(黒の軍勢)
  ...unitSheets('Black', 'raider_'),
  // 動物・資源
  { key: 'sheep_idle', path: 'Terrain/Resources/Meat/Sheep/Sheep_Idle.png', fw: 128, fh: 128, frames: 6 },
  { key: 'sheep_move', path: 'Terrain/Resources/Meat/Sheep/Sheep_Move.png', fw: 128, fh: 128, frames: 4 },
  { key: 'sheep_grass', path: 'Terrain/Resources/Meat/Sheep/Sheep_Grass.png', fw: 128, fh: 128, frames: 12 },
  { key: 'tree1', path: 'Terrain/Resources/Wood/Trees/Tree1.png', fw: 192, fh: 256, frames: 8, rate: 8 },
  { key: 'tree2', path: 'Terrain/Resources/Wood/Trees/Tree2.png', fw: 192, fh: 256, frames: 8, rate: 8 },
  { key: 'tree3', path: 'Terrain/Resources/Wood/Trees/Tree3.png', fw: 192, fh: 192, frames: 8, rate: 8 },
  { key: 'tree4', path: 'Terrain/Resources/Wood/Trees/Tree4.png', fw: 192, fh: 192, frames: 8, rate: 8 },
  { key: 'bush1', path: 'Terrain/Decorations/Bushes/Bushe1.png', fw: 128, fh: 128, frames: 8, rate: 8 },
  { key: 'bush2', path: 'Terrain/Decorations/Bushes/Bushe2.png', fw: 128, fh: 128, frames: 8, rate: 8 },
  { key: 'bush3', path: 'Terrain/Decorations/Bushes/Bushe3.png', fw: 128, fh: 128, frames: 8, rate: 8 },
  { key: 'bush4', path: 'Terrain/Decorations/Bushes/Bushe4.png', fw: 128, fh: 128, frames: 8, rate: 8 },
  { key: 'wrock1', path: 'Terrain/Decorations/Rocks in the Water/Water Rocks_01.png', fw: 64, fh: 64, frames: 16, rate: 8 },
  { key: 'wrock2', path: 'Terrain/Decorations/Rocks in the Water/Water Rocks_02.png', fw: 64, fh: 64, frames: 16, rate: 8 },
  { key: 'wrock3', path: 'Terrain/Decorations/Rocks in the Water/Water Rocks_03.png', fw: 64, fh: 64, frames: 16, rate: 8 },
  { key: 'wrock4', path: 'Terrain/Decorations/Rocks in the Water/Water Rocks_04.png', fw: 64, fh: 64, frames: 16, rate: 8 },
  { key: 'duck', path: 'Terrain/Decorations/Rubber Duck/Rubber duck.png', fw: 32, fh: 32, frames: 3, rate: 4 },
  { key: 'foam', path: 'Terrain/Tileset/Water Foam.png', fw: 192, fh: 192, frames: 16 },
  // エフェクト
  { key: 'fx_dust', path: 'Particle FX/Dust_01.png', fw: 64, fh: 64, frames: 8, repeat: 0, rate: 16 },
  { key: 'fx_dust2', path: 'Particle FX/Dust_02.png', fw: 64, fh: 64, frames: 10, repeat: 0, rate: 16 },
  { key: 'fx_explosion', path: 'Particle FX/Explosion_01.png', fw: 192, fh: 192, frames: 8, repeat: 0, rate: 14 },
  { key: 'fx_fire1', path: 'Particle FX/Fire_01.png', fw: 64, fh: 64, frames: 8 },
  { key: 'fx_fire2', path: 'Particle FX/Fire_02.png', fw: 64, fh: 64, frames: 10 },
  { key: 'fx_fire3', path: 'Particle FX/Fire_03.png', fw: 64, fh: 64, frames: 12 },
  { key: 'fx_splash', path: 'Particle FX/Water Splash.png', fw: 192, fh: 192, frames: 9, repeat: 0, rate: 14 },
];

export const IMAGES: Record<string, string> = {
  stump1: 'Terrain/Resources/Wood/Trees/Stump 1.png',
  stump2: 'Terrain/Resources/Wood/Trees/Stump 2.png',
  stump3: 'Terrain/Resources/Wood/Trees/Stump 3.png',
  stump4: 'Terrain/Resources/Wood/Trees/Stump 4.png',
  rock1: 'Terrain/Decorations/Rocks/Rock1.png',
  rock2: 'Terrain/Decorations/Rocks/Rock2.png',
  rock3: 'Terrain/Decorations/Rocks/Rock3.png',
  rock4: 'Terrain/Decorations/Rocks/Rock4.png',
  cloud1: 'Terrain/Decorations/Clouds/Clouds_01.png',
  cloud2: 'Terrain/Decorations/Clouds/Clouds_02.png',
  cloud3: 'Terrain/Decorations/Clouds/Clouds_03.png',
  cloud4: 'Terrain/Decorations/Clouds/Clouds_04.png',
  cloud5: 'Terrain/Decorations/Clouds/Clouds_05.png',
  arrow: 'Units/Blue Units/Archer/Arrow.png',
  res_wood: 'Terrain/Resources/Wood/Wood Resource/Wood Resource.png',
  res_meat: 'Terrain/Resources/Meat/Meat Resource/Meat Resource.png',
  res_gold: 'UI Elements/UI Elements/Icons/Icon_03.png',
  tiles1: 'Terrain/Tileset/Tilemap_color1.png',
  tiles2: 'Terrain/Tileset/Tilemap_color2.png',
  tiles3: 'Terrain/Tileset/Tilemap_color3.png',
  tiles4: 'Terrain/Tileset/Tilemap_color4.png',
  tiles5: 'Terrain/Tileset/Tilemap_color5.png',
  shadow: 'Terrain/Tileset/Shadow.png',
};
for (let i = 1; i <= 6; i++) IMAGES[`gold${i}`] = `Terrain/Resources/Gold/Gold Stones/Gold Stone ${i}.png`;
for (const b of ['House1', 'House2', 'House3', 'Tower', 'Barracks', 'Archery', 'Monastery', 'Castle']) IMAGES[`b_${b.toLowerCase()}`] = `Buildings/Blue Buildings/${b}.png`;

/** 各スプライトの足元(原点)の位置 */
export const ORIGIN_Y: Record<string, number> = {
  unit: 135 / 192,
  sheep: 84 / 128,
  tree12: 241 / 256,
  tree34: 170 / 192,
  stump12: 240 / 256,
  stump34: 232 / 256,
  gold: 0.72,
  bush: 79 / 128,
  b_house1: 173 / 192,
  b_house2: 178 / 192,
  b_house3: 172 / 192,
  b_tower: 230 / 256,
  b_barracks: 245 / 256,
  b_archery: 240 / 256,
  b_monastery: 310 / 320,
  b_castle: 249 / 256,
};

export function preloadAll(scene: Phaser.Scene) {
  for (const s of SHEETS) scene.load.spritesheet(s.key, u(s.path), { frameWidth: s.fw, frameHeight: s.fh });
  for (const [k, p] of Object.entries(IMAGES)) scene.load.image(k, u(p));
}

export function createAnims(scene: Phaser.Scene) {
  for (const s of SHEETS) {
    if (scene.anims.exists(s.key)) continue;
    scene.anims.create({
      key: s.key,
      frames: scene.anims.generateFrameNumbers(s.key, { start: 0, end: s.frames - 1 }),
      frameRate: s.rate ?? 10,
      repeat: s.repeat ?? -1,
    });
  }
}
