/**
 * 見た目の設定（どのカードにどのモデル・アニメーションを使うか）。
 * ゲームの数値（HP・攻撃力など）ではなく、描画だけの調整値なのでここに置く。
 */
export interface UnitVisual {
  model: string;
  /** 表示上の高さ（タイル） */
  height: number;
  anims: { idle: string; move: string; attack: string; death: string };
  /** モデルの色に陣営色をどれだけ混ぜるか（0..1） */
  teamTint: number;
  /** 元の色に掛ける色（岩の巨兵を石の色にする等） */
  baseTint?: string;
  /** 撮影（カード絵）用のカメラ調整 */
  portrait?: { zoom?: number; yaw?: number };
}

export const UNIT_VISUALS: Record<string, UnitVisual> = {
  iron_knight: { model: 'knight', height: 1.7, anims: { idle: 'Idle', move: 'Walk', attack: 'SwordSlash', death: 'Death' }, teamTint: 0.35 },
  archer_duo: { model: 'archer', height: 1.45, anims: { idle: 'Idle', move: 'Walk', attack: 'Shoot_OneHanded', death: 'Death' }, teamTint: 0.3 },
  rock_giant: { model: 'giant', height: 2.9, anims: { idle: 'Idle', move: 'Walk', attack: 'Punch', death: 'Death' }, teamTint: 0.25, baseTint: '#a39a8e' },
  bone_legion: { model: 'skeleton', height: 1.0, anims: { idle: 'Idle', move: 'Run', attack: 'Weapon', death: 'Death' }, teamTint: 0.3 },
  wyvern: { model: 'wyvern', height: 1.9, anims: { idle: 'Flying_Idle', move: 'Fast_Flying', attack: 'Headbutt', death: 'Death' }, teamTint: 0.3 },
};

/** レアリティ → カード枠 */
export const FRAME_BY_RARITY: Record<string, string> = {
  common: 'cards/frame_common.png',
  rare: 'cards/frame_rare.png',
  epic: 'cards/frame_epic.png',
  legendary: 'cards/frame_legendary.png',
};

/** カードの絵（ユニット・建物は撮影ツールで作った画像、呪文は Card Kit のレンダー） */
export const cardArt = (cardId: string, type: string): string =>
  type === 'spell' ? `cards/spell_${cardId}.webp` : `cards/unit_${cardId}.webp`;

export const MODEL_FILES = [
  'knight', 'archer', 'giant', 'skeleton', 'wyvern',
  'wall', 'pillar', 'tower_roof_blue', 'tower_roof_red', 'crate', 'chimney', 'fence', 'floor_wood', 'border', 'vine',
];

export const FX_TEXTURES = ['star', 'spark', 'smoke', 'fire', 'flame', 'circle', 'dirt', 'magic', 'scorch', 'light', 'lightning', 'slash', 'trace'];

export const SOUNDS = [
  'deploy', 'hit_1', 'hit_2', 'hit_3', 'arrow', 'tower_shot', 'fireball', 'lightning', 'tower_break', 'tower_break2',
  'death', 'crown', 'select', 'place', 'invalid', 'click', 'announce', 'win', 'lose', 'card',
];
