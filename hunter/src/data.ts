// ゲームデータ定義（世界観・名称はすべてオリジナル）
import type { ModelKey } from './assets';

// ───────── 素材 ─────────
export type MatId = 'fang' | 'shell' | 'soot' | 'stinger' | 'silk' | 'wingskin' | 'bulb' | 'bonechip' | 'kingiron';
export const MATERIALS: Record<MatId, { name: string; desc: string }> = {
  fang: { name: '錆牙', desc: '錆牙狼の牙。錆びてなお鋭い。' },
  shell: { name: '坑殻片', desc: '坑殻蟹が背負うトロッコの鉄板。' },
  soot: { name: '煤毛', desc: '煤鼠の毛。燃え残りの魔素を含む。' },
  stinger: { name: '毒針', desc: '霧刺蜂の毒針。' },
  silk: { name: '粘糸腺', desc: '沼織蜘蛛の糸を作る器官。' },
  wingskin: { name: '吸血膜', desc: '紅翼蝙蝠の翼膜。' },
  bulb: { name: '爆嚢', desc: '爆嚢花の種袋。衝撃で弾ける。' },
  bonechip: { name: '骸片', desc: '動く骸の欠片。工房の炉でよく燃える。' },
  kingiron: { name: '王骸鉄', desc: '骸鍛王の鎧から剥がれた黒鉄。' },
};

// ───────── 魔核（素材喰いで弾に変わる） ─────────
export type CoreId = 'fang' | 'shell' | 'swarm' | 'venom' | 'silk' | 'blood' | 'blast' | 'curse';
export interface CoreDef {
  id: CoreId;
  name: string; // 魔核の名前
  ammo: string; // 弾の名前
  color: number;
  desc: string;
}
export const CORES: Record<CoreId, CoreDef> = {
  fang: { id: 'fang', name: '牙核', ammo: '貫牙弾', color: 0xd8d0b0, desc: '敵と装甲を貫通（最大3体）。装甲の軽減を無視。' },
  shell: { name: '殻核', id: 'shell', ammo: '跳殻弾', color: 0x7fb4ff, desc: '地形で跳ね返り、命中後は近くの敵へ跳弾する（3回）。' },
  swarm: { id: 'swarm', name: '群核', ammo: '群散弾', color: 0xc8a070, desc: '1発が3つに分かれて飛ぶ。群れに強い。' },
  venom: { id: 'venom', name: '毒核', ammo: '毒針弾', color: 0x9cff5a, desc: '命中した敵を毒状態に（重ねがけ可）。硬い敵に有効。' },
  silk: { id: 'silk', name: '糸核', ammo: '粘糸弾', color: 0xf0f0ff, desc: '命中した敵の動きと攻撃を遅くする。' },
  blood: { id: 'blood', name: '血核', ammo: '吸血弾', color: 0xff3048, desc: '与えたダメージの一部で自分を回復。' },
  blast: { id: 'blast', name: '爆核', ammo: '爆炎弾', color: 0xff8a20, desc: '着弾で爆発。範囲ダメージ・部位破壊力が高い。' },
  curse: { id: 'curse', name: '呪核', ammo: '追尾呪弾', color: 0xb070ff, desc: '近くの敵の弱点へ曲がって飛ぶ。' },
};

// ───────── 武器 ─────────
export type WeaponId = 'pistol' | 'bow' | 'shotgun';
export interface WeaponDef {
  id: WeaponId;
  name: string;
  kind: string;
  model: ModelKey;
  desc: string;
  damage: number;
  pellets: number;
  spreadHip: number; // 度
  spreadAds: number;
  fireInterval: number;
  mag: number;
  reloadTime: number;
  speed: number; // 弾速 m/s
  gravity: number;
  weakMul: number;
  partMul: number;
  coreRounds: number; // 魔核1つで装填される特殊弾数
  view: { x: number; y: number; z: number; fov: number };
  anim: Record<string, string>;
  unlock?: Partial<Record<MatId, number>>;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol', name: '喰銃ファング', kind: '拳銃型喰銃', model: 'fp_pistol',
    desc: '扱いやすい単発式。精度が高く、弱点を狙い撃つのが得意。',
    damage: 16, pellets: 1, spreadHip: 1.0, spreadAds: 0.15, fireInterval: 0.2, mag: 12, reloadTime: 1.7,
    speed: 220, gravity: 0, weakMul: 2.2, partMul: 1.0, coreRounds: 12,
    view: { x: 0.06, y: 0.6, z: -0.26, fov: 55 },
    anim: { idle: 'Pistol_IDLE', idleEmpty: 'Pistol_IDLE_EMPTY', walk: 'Pistol_WALK', walkEmpty: 'Pistol_WALK_EMPTY', run: 'Pistol_RUN', runEmpty: 'Pistol_RUN_EMPTY', fire: 'Pistol_FIRE_ADS_SHOOT', fireEmpty: 'Pistol_FIRE_EMPTY', reload: 'Pistol_RELOAD', jump: 'Pistol_JUMP_START' },
  },
  bow: {
    id: 'bow', name: '喰弓ウィスパー', kind: '弓型喰銃', model: 'fp_bow',
    desc: '引き絞るほど威力と弾速が上がる。弱点への一撃が最も重い。',
    damage: 62, pellets: 1, spreadHip: 0.4, spreadAds: 0.0, fireInterval: 0.25, mag: 1, reloadTime: 0.6,
    speed: 95, gravity: 9.8, weakMul: 2.6, partMul: 1.3, coreRounds: 6,
    view: { x: 0.02, y: 0.62, z: -0.25, fov: 55 },
    anim: { idle: 'Bow_IDLE', idleEmpty: 'Bow_IDLE(no arrow)', walk: 'Bow_WALK', walkEmpty: 'Bow_WALK(no arrow)', run: 'Bow_RUN', runEmpty: 'Bow_RUN(no arrow)', aim: 'Bow_AIM', aimIdle: 'Bow_AIM_IDLE', fire: 'Bow_FIRE', reload: 'Bow_RELOAD', jump: 'Bow_JUMP_START' },
  },
  shotgun: {
    id: 'shotgun', name: '喰砲ブロウバック', kind: '散弾型喰銃', model: 'fp_shotgun',
    desc: '近距離で圧倒的な制圧力。部位破壊が得意。',
    damage: 10, pellets: 8, spreadHip: 5.5, spreadAds: 3.5, fireInterval: 0.85, mag: 5, reloadTime: 1.9,
    speed: 170, gravity: 0, weakMul: 1.6, partMul: 1.5, coreRounds: 4,
    view: { x: -0.02, y: 0.6, z: -0.25, fov: 55 },
    anim: { idle: 'Fusil_IDLE', idleEmpty: 'Fusil_IDLE', walk: 'Fusil_WALK', walkEmpty: 'Fusil_WALK', run: 'Fusil_RUN', runEmpty: 'Fusil_RUN', fire: 'Fusil_FIRE', reload: 'Fusil_RELOAD', jump: 'Fusil_JUMP_START' },
    unlock: { shell: 3, fang: 2 },
  },
};

// ───────── 改造（控えめな成長） ─────────
export type ModId = 'power' | 'feed' | 'gut';
export const MODS: Record<ModId, { name: string; desc: (lv: number) => string; costs: Partial<Record<MatId, number>>[] }> = {
  power: {
    name: '銃身研ぎ',
    desc: (lv) => `基礎ダメージ +${lv * 10}%`,
    costs: [{ fang: 2, soot: 2 }, { shell: 3, stinger: 2 }, { kingiron: 1, bonechip: 3 }],
  },
  feed: {
    name: '給弾機構',
    desc: (lv) => `装填速度 +${lv * 12}% / 装弾数 +${lv * 15}%`,
    costs: [{ soot: 3 }, { silk: 2, wingskin: 2 }, { kingiron: 1, bulb: 2 }],
  },
  gut: {
    name: '喰炉拡張',
    desc: (lv) => `魔核1つの特殊弾 +${lv * 25}% / 喰わせ速度 +${lv * 15}%`,
    costs: [{ bonechip: 2, bulb: 1 }, { shell: 2, silk: 2 }, { kingiron: 2 }],
  },
};

/** おまけ程度のランダム強化（炉の気まぐれ） */
export interface Quirk { id: string; name: string; desc: string }
export const QUIRKS: Quirk[] = [
  { id: 'crit', name: '鋭き照星', desc: '弱点ダメージ +6%' },
  { id: 'swift', name: '軽い引き金', desc: '連射間隔 -5%' },
  { id: 'deep', name: '深い喰炉', desc: '魔核の特殊弾 +1' },
  { id: 'steady', name: '据わった銃床', desc: '拡散 -10%' },
  { id: 'breaker', name: '割り裂き', desc: '部位へのダメージ +8%' },
  { id: 'quick', name: '手癖の装填', desc: '装填速度 +6%' },
];
export const QUIRK_COST: Partial<Record<MatId, number>> = { bonechip: 1 };

// ───────── モンスター ─────────
export type MonsterId = 'wolf' | 'crab' | 'rat' | 'wasp' | 'spider' | 'bat' | 'plant' | 'skeleton';
export interface HitboxDef {
  bone: string;
  r: number; // メートル（最終スケール後）
  kind: 'body' | 'weak' | 'part';
  part?: string;
  off?: [number, number, number]; // モンスター座標系での追加オフセット(m)
}
export interface PartDef {
  id: string;
  name: string;
  hp: number;
  meshes: string[]; // 破壊時に消すメッシュ
  armor?: number; // 生存中の本体被ダメ軽減
}
export interface MonsterDef {
  id: MonsterId;
  name: string;
  title: string;
  model: ModelKey;
  scale: number;
  hp: number;
  speed: number;
  flying?: number; // 飛行高度
  radius: number;
  aggro: number;
  attackRange: number;
  damage: number;
  core: CoreId;
  drops: Partial<Record<MatId, [number, number]>>;
  anims: { idle: string; move: string; attack: string; hit?: string; death: string; [k: string]: string | undefined };
  attackHit: number; // 攻撃アニメ中のヒット位置(0-1)
  attackCd: number;
  hitboxes: HitboxDef[];
  parts?: PartDef[];
  sfx: { pain: string; death: string; attack?: string };
}

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  wolf: {
    id: 'wolf', name: '錆牙狼', title: 'ラストファング', model: 'wolf', scale: 1.35, hp: 110, speed: 7.2, radius: 0.8,
    aggro: 26, attackRange: 2.6, damage: 13, core: 'fang', drops: { fang: [1, 2] },
    anims: { idle: 'idle', move: 'run', attack: 'ATK2', hit: 'hit', death: 'death' }, attackHit: 0.42, attackCd: 1.2,
    hitboxes: [
      { bone: 'tete', r: 0.32, kind: 'weak' },
      { bone: 'thorax', r: 0.45, kind: 'body' },
      { bone: 'spine2', r: 0.42, kind: 'body' },
      { bone: 'bassin', r: 0.4, kind: 'body' },
    ],
    sfx: { pain: 'mon_pain2', death: 'mon_death2', attack: 'mon_grunt' },
  },
  crab: {
    id: 'crab', name: '坑殻蟹', title: 'トロッカー', model: 'crab', scale: 1.15, hp: 170, speed: 3.6, radius: 1.3,
    aggro: 22, attackRange: 2.8, damage: 17, core: 'shell', drops: { shell: [1, 2] },
    anims: { idle: 'idle', move: 'run_cache', attack: 'uppercut', hit: 'hit', death: 'mort', hide: 'cacher', hideIdle: 'idle_cache', burrow: 'rentrer_sol', emerge: 'sortie_attaque' },
    attackHit: 0.45, attackCd: 1.6,
    hitboxes: [
      { bone: 'tete', r: 0.42, kind: 'weak' },
      { bone: 'corps', r: 0.75, kind: 'body' },
      { bone: 'chariot', r: 0.95, kind: 'part', part: 'cart', off: [0, 0.4, 0] },
    ],
    parts: [{ id: 'cart', name: '背負いトロッコ', hp: 90, meshes: ['cadre', 'chariot_02'], armor: 0.5 }],
    sfx: { pain: 'mon_pain1', death: 'mon_death1', attack: 'mon_grunt' },
  },
  rat: {
    id: 'rat', name: '煤鼠', title: 'スートラット', model: 'rat', scale: 0.62, hp: 38, speed: 6.4, radius: 0.5,
    aggro: 22, attackRange: 1.7, damage: 6, core: 'swarm', drops: { soot: [1, 1] },
    anims: { idle: 'idle', move: 'run', attack: 'attack', death: 'death' }, attackHit: 0.35, attackCd: 0.9,
    hitboxes: [
      { bone: 'cou', r: 0.26, kind: 'weak', off: [0, 0, 0] },
      { bone: 'spine3', r: 0.32, kind: 'body' },
      { bone: 'bassin', r: 0.3, kind: 'body' },
    ],
    sfx: { pain: 'rat_attack', death: 'rat_death', attack: 'rat_attack' },
  },
  wasp: {
    id: 'wasp', name: '霧刺蜂', title: 'ヴェスパイン', model: 'wasp', scale: 0.17, hp: 55, speed: 6, flying: 3.2, radius: 0.6,
    aggro: 28, attackRange: 2.2, damage: 9, core: 'venom', drops: { stinger: [1, 1] },
    anims: { idle: 'FlyingWasp', move: 'FlyingWasp', attack: 'AtackWasp', hit: 'GetDamageWasp', death: 'DeathWasp' },
    attackHit: 0.5, attackCd: 1.4,
    hitboxes: [
      { bone: 'Head', r: 0.22, kind: 'weak' },
      { bone: 'Chest', r: 0.3, kind: 'body' },
      { bone: 'Back', r: 0.32, kind: 'body' },
      { bone: 'StingBack', r: 0.22, kind: 'part', part: 'sting' },
    ],
    parts: [{ id: 'sting', name: '毒針', hp: 22, meshes: [] }],
    sfx: { pain: 'mon_pain2', death: 'mon_death3' },
  },
  spider: {
    id: 'spider', name: '沼織蜘蛛', title: 'マイアウィーバー', model: 'spider', scale: 0.055, hp: 80, speed: 5.2, radius: 1.1,
    aggro: 24, attackRange: 2.4, damage: 11, core: 'silk', drops: { silk: [1, 1] },
    anims: { idle: 'IdleSpider', move: 'WalkSpider', attack: 'DamageSpider', hit: 'GetDamageSpider', death: 'DeathSpider' },
    attackHit: 0.5, attackCd: 1.3,
    hitboxes: [
      { bone: 'Head', r: 0.35, kind: 'weak' },
      { bone: 'Chest', r: 0.6, kind: 'body' },
      { bone: 'Back', r: 0.7, kind: 'body' },
    ],
    sfx: { pain: 'mon_pain1', death: 'mon_death3' },
  },
  bat: {
    id: 'bat', name: '紅翼蝙蝠', title: 'ブラッドウィング', model: 'bat', scale: 0.7, hp: 34, speed: 7.5, flying: 3.6, radius: 0.6,
    aggro: 26, attackRange: 1.9, damage: 7, core: 'blood', drops: { wingskin: [1, 1] },
    anims: { idle: 'FlyingBat', move: 'FlyingBat', attack: 'AtackBat', hit: 'GetDamageBat', death: 'DeathBat' },
    attackHit: 0.5, attackCd: 1.1,
    hitboxes: [
      { bone: 'Head', r: 0.22, kind: 'weak' },
      { bone: 'Chest', r: 0.32, kind: 'body' },
      { bone: 'MiddleWingL', r: 0.25, kind: 'body' },
      { bone: 'MiddleWingR', r: 0.25, kind: 'body' },
    ],
    sfx: { pain: 'rat_attack', death: 'mon_death3' },
  },
  plant: {
    id: 'plant', name: '爆嚢花', title: 'ボムブルーム', model: 'plant', scale: 0.26, hp: 130, speed: 0, radius: 1.4,
    aggro: 30, attackRange: 28, damage: 14, core: 'blast', drops: { bulb: [1, 2] },
    anims: { idle: 'IdleEaterPlant', move: 'IdleEaterPlant', attack: 'AtackEaterPlant', hit: 'GetDamageEaterPlant', death: 'DeathEaterPlant' },
    attackHit: 0.5, attackCd: 2.8,
    hitboxes: [
      { bone: 'Mouth', r: 0.45, kind: 'weak' },
      { bone: 'Chest', r: 0.7, kind: 'body' },
      { bone: 'Root', r: 0.75, kind: 'body', off: [0, 0.9, 0] },
    ],
    sfx: { pain: 'mon_pain1', death: 'mon_death1' },
  },
  skeleton: {
    id: 'skeleton', name: '骸弩兵', title: 'ボーンクロウ', model: 'skeleton', scale: 1.05, hp: 85, speed: 3.4, radius: 0.6,
    aggro: 32, attackRange: 24, damage: 11, core: 'curse', drops: { bonechip: [1, 2] },
    anims: { idle: 'idle', move: 'walk', attack: 'tir', hit: 'hit', death: 'death', spawn: 'spawn', run: 'run' },
    attackHit: 0.42, attackCd: 2.4,
    hitboxes: [
      { bone: 'tete', r: 0.24, kind: 'weak' },
      { bone: 'plexus', r: 0.3, kind: 'body' },
      { bone: 'bassin', r: 0.28, kind: 'body' },
      { bone: 'arme', r: 0.3, kind: 'part', part: 'bow' },
    ],
    parts: [{ id: 'bow', name: '連弩', hp: 30, meshes: ['manche_bois', 'metal', 'os001'] }],
    sfx: { pain: 'mon_pain2', death: 'mon_death2' },
  },
};

// ───────── ボス ─────────
export const BOSS = {
  name: '骸鍛王グラウムドル',
  title: '霧錆の沼に沈んだ炉の主',
  model: 'boss' as ModelKey,
  scale: 1.2,
  hp: 2600,
  speed: 2.6,
  radius: 2.6,
  parts: [
    { id: 'hammer', name: '鎖戦槌の槌頭', hp: 380, meshes: ['marteau'] },
    { id: 'armor', name: '胸甲', hp: 480, meshes: ['armureclaire'], armor: 0.45 },
  ] as PartDef[],
  hitboxes: [
    { bone: 'tete', r: 0.55, kind: 'weak' },
    { bone: 'Spine_03', r: 1.25, kind: 'part', part: 'armor' },
    { bone: 'Spine_01', r: 1.2, kind: 'part', part: 'armor' },
    { bone: 'epaulette_L', r: 0.6, kind: 'part', part: 'armor' },
    { bone: 'epaulette_R', r: 0.6, kind: 'part', part: 'armor' },
    { bone: 'Pelvis', r: 1.1, kind: 'body' },
    { bone: 'masse', r: 0.85, kind: 'part', part: 'hammer' },
    { bone: 'marteau4', r: 0.4, kind: 'part', part: 'hammer' },
    { bone: 'Thigh_L', r: 0.55, kind: 'body' },
    { bone: 'Thigh_R', r: 0.55, kind: 'body' },
  ] as HitboxDef[],
  // 部位が壊れて露出した骨は弱点になる
  exposed: [{ bone: 'Spine_03', r: 1.0, kind: 'weak' }] as HitboxDef[],
  drops: { kingiron: [2, 3], bonechip: [2, 4] } as Partial<Record<MatId, [number, number]>>,
};

export const AREA = {
  name: '霧錆の沼沢 ラスミア',
  desc: '古い炉の街が沈んだ沼。霧には錆と魔素が混じり、魔核を宿す獣が棲む。最奥の炉跡には「骸鍛王」が眠るという。',
};

export const LORE = {
  world: '魔導と機巧が溶け合う大陸ヴェルドラン。獣の体内で結晶する「魔核」は、喰銃（グラトニア）の喰炉で砕けば弾に宿る。',
  guild: 'あなたは狩猟団〈喰核団〉の狩人。工房船「アンヴィル号」を拠点に、魔核を宿す獣を狩る。',
};
