// シミュレーションの状態の型定義。描画(Phaser)には一切依存しない。

export type ResKind = 'wood' | 'meat' | 'gold';
export type BuildingKind = 'house' | 'tower' | 'barracks' | 'archery' | 'monastery' | 'castle';
export type Role = 'pawn' | 'child' | 'warrior' | 'archer' | 'monk';
export type UpgradeKey = 'work' | 'walk' | 'nature' | 'housing' | 'family' | 'strength';
export type Trait = 'hard' | 'lazy' | 'cheer' | 'shy' | 'pious' | 'brave' | 'glutton' | 'dreamer';

export interface Pt {
  x: number;
  y: number;
}

export type TaskType =
  | 'chop'
  | 'harvest'
  | 'mine'
  | 'build'
  | 'repair'
  | 'deliver'
  | 'eat'
  | 'sleep'
  | 'hide'
  | 'wander'
  | 'chat'
  | 'pray'
  | 'festival'
  | 'guard'
  | 'fight'
  | 'heal'
  | 'play';

export interface Task {
  type: TaskType;
  targetId?: number;
  phase: 'go' | 'act' | 'done';
  timer: number;
  dest?: Pt; // 目的のタイル
  hits?: number;
}

export interface Villager {
  id: number;
  name: string;
  female: boolean;
  age: number; // 年(ゲーム内)
  lifespan: number;
  role: Role;
  skill: ResKind | 'build';
  trait: Trait;
  avatar: number; // 1..25
  x: number;
  y: number;
  path: Pt[]; // タイル座標の列
  task: Task | null;
  carrying: ResKind | null;
  energy: number; // 0..1
  hunger: number; // 0..1(1で空腹)
  hp: number;
  maxHp: number;
  knockedOut: number; // 気絶の残り秒
  hidden: boolean; // 建物の中にいる
  homeId: number | null;
  facingLeft: boolean;
  anim: string;
  bubble: { text: string; until: number } | null;
  nextMurmur: number;
  attackCd: number;
  parents: string[];
  born: number; // 生まれた時刻(シム秒)
  deeds: number; // 成し遂げた仕事の数
}

export interface Tree {
  id: number;
  tx: number;
  ty: number;
  variant: number; // 1..4
  growth: number; // 0..1(1で成木)
  hits: number;
  reservedBy: number | null;
  shake: number;
}

export interface Sheep {
  id: number;
  x: number;
  y: number;
  path: Pt[];
  timer: number;
  anim: 'idle' | 'move' | 'grass';
  facingLeft: boolean;
  reservedBy: number | null;
}

export interface GoldStone {
  id: number;
  tx: number;
  ty: number;
  variant: number; // 1..6
  amount: number;
  reservedBy: number | null;
  shake: number;
}

export interface Building {
  id: number;
  kind: BuildingKind;
  variant: number;
  tx: number; // 足元の左端タイル
  ty: number; // 足元の最下段タイル
  w: number;
  h: number;
  progress: number; // 0..1
  done: boolean;
  hp: number;
  maxHp: number;
  occupants: number[];
  attackCd: number;
}

export interface Raider {
  id: number;
  x: number;
  y: number;
  path: Pt[];
  hp: number;
  maxHp: number;
  dmg: number;
  targetKind: 'building' | 'villager' | null;
  targetId: number | null;
  attackCd: number;
  anim: string;
  facingLeft: boolean;
  repath: number;
  fleeing: boolean;
}

export interface Arrow {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  t: number;
  dur: number;
  targetId: number;
  dmg: number;
  hostile: boolean; // trueなら村人側に当たる(未使用)
}

export interface Deco {
  kind: 'bush' | 'rock' | 'waterRock' | 'duck';
  x: number;
  y: number;
  variant: number;
}

export interface ChronicleEntry {
  t: number; // シム秒
  label: string; // 「3年目 春」
  text: string;
  kind: 'birth' | 'death' | 'build' | 'raid' | 'stage' | 'council' | 'festival' | 'misc' | 'ai';
}

export interface CouncilLine {
  speaker: string;
  text: string;
}

export interface Policy {
  weights: Record<ResKind | 'build', number>;
  nextBuild: BuildingKind | null;
  festival: boolean;
  lines: CouncilLine[];
  source: 'rule' | 'ai';
}

export interface GameState {
  version: number;
  seed: number;
  islandName: string;
  islandNo: number; // 何島目か
  memories: number; // 旅立ちの回数(ポイント倍率)
  time: number; // シム秒
  dayTime: number; // 0..DAY_LEN
  seasonIndex: number; // 通算の季節番号
  res: Record<ResKind, number>;
  points: number;
  totalPoints: number;
  upgrades: Record<UpgradeKey, number>;
  stage: number; // 0..3
  map: { w: number; h: number; land: string }; // '1' 陸 / '0' 海
  villagers: Villager[];
  trees: Tree[];
  sheep: Sheep[];
  golds: GoldStone[];
  buildings: Building[];
  raiders: Raider[];
  arrows: Arrow[];
  decos: Deco[];
  policy: Policy;
  chronicle: ChronicleEntry[];
  nextId: number;
  nextRaidSeason: number;
  raidAt: number | null; // 襲撃が始まる時刻
  raidEndAt: number | null;
  festivalUntil: number;
  departed: boolean; // 城完成後、旅立ち可能
  savedAt: number; // 実時間(ms)
  stats: { births: number; deaths: number; raidsRepelled: number; built: number };
}

export type SimEvent =
  | { type: 'chop'; x: number; y: number; treeId: number }
  | { type: 'treeFall'; treeId: number }
  | { type: 'mine'; x: number; y: number; stoneId: number }
  | { type: 'hammer'; x: number; y: number }
  | { type: 'deliver'; x: number; y: number; kind: ResKind; amount: number }
  | { type: 'points'; x: number; y: number; amount: number }
  | { type: 'poof'; x: number; y: number; big?: boolean }
  | { type: 'built'; id: number }
  | { type: 'siteStart'; id: number }
  | { type: 'splash'; x: number; y: number }
  | { type: 'explode'; x: number; y: number }
  | { type: 'hit'; x: number; y: number }
  | { type: 'heal'; x: number; y: number }
  | { type: 'birth'; id: number }
  | { type: 'death'; id: number; x: number; y: number }
  | { type: 'raidStart' }
  | { type: 'raidEnd' }
  | { type: 'stage'; stage: number }
  | { type: 'season'; seasonIndex: number }
  | { type: 'council' }
  | { type: 'sfx'; name: string; x?: number; y?: number };
