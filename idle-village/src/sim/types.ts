// シミュレーションの状態の型定義。描画(Phaser)には一切依存しない。
// 決めてあるのは「本能」(食べる・眠る・逃げる・人恋しさ)と体でできる動作だけ。
// 何をするか・何を建てて何と呼ぶか・誰とどんな関係になるかは、AIが考える。

export type ResKind = 'wood' | 'meat' | 'gold';
/** 建物の見た目(素材) */
export type BuildingKind = 'house' | 'tower' | 'barracks' | 'archery' | 'monastery' | 'castle';
/** 建物の働き(エンジンが理解できるもの) */
export type BuildingRole = 'home' | 'storage' | 'watch' | 'gathering' | 'worship' | 'training' | 'workshop';
/** 姿(素材)。子どもは年齢で自動 */
export type Role = 'pawn' | 'child' | 'warrior' | 'archer' | 'monk';
export type UpgradeKey = 'work' | 'walk' | 'nature' | 'housing' | 'family' | 'strength';

/** 体でできる動作 */
export type Action = 'chop' | 'hunt' | 'mine' | 'build' | 'repair' | 'talk' | 'rest' | 'wander' | 'explore' | 'guard' | 'gather' | 'pray' | 'play';

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
  | 'play'
  | 'activity'
  | 'harm';

export interface Task {
  type: TaskType;
  targetId?: number;
  phase: 'go' | 'act' | 'done';
  timer: number;
  hits?: number;
  motion?: Motion;
}

/** 体の動き(アニメーション)。何をしているかは doing に自由に書かれる */
export type Motion = 'axe' | 'hammer' | 'pick' | 'knife' | 'carry' | 'walk' | 'idle' | 'dance' | 'pray' | 'play' | 'guard' | 'rest';

/** 発明・工夫が村に与える効き目(エンジンが理解できるもの) */
export type EffectKey = 'work' | 'walk' | 'food' | 'wood' | 'gold' | 'growth' | 'birth' | 'defense' | 'joy';

export interface Invention {
  id: number;
  name: string;
  desc: string;
  inventor: string;
  effect: EffectKey | null;
  amount: number; // 0.03〜0.1
  t: number;
  label: string;
}

/** 人に害をなす行い。勧めるものではないが、起こりうる */
export interface Harm {
  type: 'steal' | 'attack' | 'kill';
  target?: string; // 相手の名前。盗みで省略なら村の蓄えから
  what?: ResKind;
  amount?: number;
}

/** AIが決めた「やりたいこと」 */
export interface Intention {
  action: Action;
  doing?: string; // 自由に書かれた行動
  where?: string; // 行き先(森・海辺・家・広場・建物名・人の名前など)
  motion?: Motion;
  with?: string[]; // 一緒にする人
  yields?: Partial<Record<ResKind, number>>; // 1回ごとの成果(増減)
  harm?: Harm; // 盗む・襲う・命を奪う(するときだけ)
  target?: string; // 相手の名前・建物の名前など
  thought: string; // 心の声
  until: number; // シム秒。これを過ぎたら次を考える
  source: 'ai' | 'habit';
}

/** 記憶。見たこと・聞いたこと・話したこと・自分で考えたこと */
export interface MemoryItem {
  t: number; // シム秒
  label: string; // 「2年目 春」
  text: string;
  imp: number; // 大事さ 1..10
  kind: 'see' | 'hear' | 'talk' | 'self' | 'reflect';
}

/** 気分。v は -5(どん底)..5(最高) */
export interface Mood {
  label: string;
  v: number;
}

/** 性格の5つの軸(1..5):好奇心・几帳面さ・社交性・やさしさ・心配性 */
export type Big5 = Record<'O' | 'C' | 'E' | 'A' | 'N', number>;

export interface Relation {
  score: number; // -100..100
  label?: string; // 「親友」「恋人」「ライバル」など、AIが自由に名付ける
}

export interface Villager {
  id: number;
  name: string;
  female: boolean;
  age: number; // 年(ゲーム内)
  lifespan: number;
  role: Role;
  personality: string; // AIが書いた性格(自由文)
  speech: string; // 口調の特徴(AIが書く)
  mutters: string[]; // これから口にするつぶやき(AIが書く)
  skill: ResKind | 'build'; // AIがいないときの習慣
  avatar: number;
  x: number;
  y: number;
  path: Pt[];
  task: Task | null;
  intention: Intention | null;
  thinking: boolean; // AIの返事待ち
  memories: MemoryItem[]; // 新しい順
  beliefs: string[]; // 振り返りから生まれた、自分や他人についての考え
  routine: string; // いつもの一日の流れ
  goal: string; // 人生の目標・いまの望み
  mood: Mood;
  big5: Big5 | null;
  sinceReflect: number; // 前回の振り返りから積み重なった大事さ
  relations: Record<string, Relation>; // キーは相手のid
  partnerId: number | null;
  carrying: ResKind | null;
  stash: Record<ResKind, number>; // 自分だけの持ち物
  fleeUntil: number; // 襲われて逃げている(シム秒)
  energy: number; // 0..1
  hunger: number; // 0..1(1で空腹)
  loneliness: number; // 0..1(1で人恋しい)
  hp: number;
  maxHp: number;
  knockedOut: number;
  hidden: boolean;
  homeId: number | null;
  facingLeft: boolean;
  anim: string;
  bubble: { text: string; until: number; talk?: boolean } | null;
  nextMurmur: number;
  attackCd: number;
  parents: string[];
  born: number;
  deeds: number;
  named: boolean; // AIが名前と性格をつけたか
}

export interface Tree {
  id: number;
  tx: number;
  ty: number;
  variant: number;
  growth: number;
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
  variant: number;
  amount: number;
  reservedBy: number | null;
  shake: number;
}

export interface Building {
  id: number;
  kind: BuildingKind; // 見た目
  variant: number;
  name: string; // AIがつけた名前
  role: BuildingRole;
  purpose: string; // AIが書いた目的
  proposer: string;
  tx: number;
  ty: number;
  w: number;
  h: number;
  progress: number;
  done: boolean;
  hp: number;
  maxHp: number;
  occupants: number[];
  attackCd: number;
}

/** まだ建て始めていない計画 */
export interface Project {
  id: number;
  name: string;
  kind: BuildingKind;
  role: BuildingRole;
  purpose: string;
  proposer: string;
  proposedAt: number;
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
  hostile: boolean;
}

export interface Deco {
  kind: 'bush' | 'rock' | 'waterRock' | 'duck';
  x: number;
  y: number;
  variant: number;
}

export interface ChronicleEntry {
  t: number;
  label: string;
  text: string;
  kind: 'birth' | 'death' | 'build' | 'raid' | 'stage' | 'council' | 'festival' | 'misc' | 'ai' | 'talk';
}

export interface ConvLine {
  speaker: string;
  text: string;
}

/** AIが書いた会話。村人が出会うと吹き出しで再生される */
export interface Conversation {
  id: number;
  a: number;
  b: number;
  topic: string;
  lines: ConvLine[];
  t: number;
  label: string;
  played: number; // 再生した行数
  started: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  islandName: string;
  islandNo: number;
  memories: number; // 旅立ちの回数
  time: number;
  dayTime: number;
  seasonIndex: number;
  res: Record<ResKind, number>;
  points: number;
  totalPoints: number;
  upgrades: Record<UpgradeKey, number>;
  era: string; // AIがつけた時代の名前
  customs: string[]; // AIが生んだ村の決まり・習わし
  inventions: Invention[]; // AIが考え出した道具・料理・歌・仕組み
  map: { w: number; h: number; land: string };
  villagers: Villager[];
  trees: Tree[];
  sheep: Sheep[];
  golds: GoldStone[];
  buildings: Building[];
  projects: Project[];
  raiders: Raider[];
  arrows: Arrow[];
  decos: Deco[];
  conversations: Conversation[]; // 新しいものが後ろ
  pendingTalks: { a: number; b: number; topic: string }[];
  chronicle: ChronicleEntry[];
  nextId: number;
  nextRaidAt: number;
  raidEndAt: number | null;
  festivalUntil: number;
  departed: boolean;
  savedAt: number;
  stats: { births: number; deaths: number; raidsRepelled: number; built: number; talks: number; thefts: number; assaults: number; killings: number };
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
  | { type: 'hit'; x: number; y: number }
  | { type: 'heal'; x: number; y: number }
  | { type: 'birth'; id: number }
  | { type: 'death'; id: number; x: number; y: number }
  | { type: 'raidStart' }
  | { type: 'raidEnd' }
  | { type: 'season'; seasonIndex: number }
  | { type: 'talkLine'; convId: number }
  | { type: 'talkEnd'; convId: number }
  | { type: 'culture' }
  | { type: 'intent'; id: number }
  | { type: 'sfx'; name: string; x?: number; y?: number };
