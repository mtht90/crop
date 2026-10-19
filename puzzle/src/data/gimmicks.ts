import { BOSSES } from './bosses';

/** Boss obstructions. Each boss has its own theme; higher levels pull more (and nastier) ones from it. */
export type GimmickId =
  // pieces get hit by a projectile and change
  | 'rock' | 'hardRock' | 'bigRock' | 'junk' | 'ice' | 'bubble' | 'skullBomb' | 'curse' | 'web' | 'slime' | 'chameleon'
  // the whole board, for a few seconds
  | 'dark' | 'mono' | 'ink' | 'invisible' | 'seal' | 'min4' | 'weak' | 'quake' | 'wind' | 'float' | 'tilt' | 'freeze' | 'shuffle'
  // straight at the player
  | 'timeSteal' | 'timeFast' | 'skillDrain' | 'feverDrain' | 'barrier' | 'skillSeal' | 'comboBreak';

export interface GimmickDef {
  id: GimmickId;
  name: string;
  desc: string;
  /** 1 = mild, 3 = nasty. Nastier ones only show up on higher levels. */
  tier: 1 | 2 | 3;
  /** Seconds, for timed board effects. */
  dur?: number;
}

const G: GimmickDef[] = [
  { id: 'rock', name: 'いしころ', desc: 'ぷにを石にする。となりを消すとこわれる', tier: 1 },
  { id: 'hardRock', name: 'かたいいわ', desc: '2回となりを消さないとこわれない石', tier: 2 },
  { id: 'bigRock', name: 'はかいし', desc: '大きなはかいしを落とす。3回でこわれる', tier: 2 },
  { id: 'junk', name: 'ホネまき', desc: '上からホネをばらまく。となりを消すとこわれる', tier: 1 },
  { id: 'ice', name: 'こおり', desc: 'ぷにをこおらせる。となりを消すととける', tier: 1 },
  { id: 'bubble', name: 'はてなボックス', desc: 'ぷにが箱に入って色がわからなくなる（つなげはする）', tier: 1 },
  { id: 'skullBomb', name: 'ドクロばくだん', desc: '10秒以内にとなりを消さないと時間−5秒', tier: 3 },
  { id: 'curse', name: 'のろい', desc: 'のろわれたぷにをまぜるとダメージ半分', tier: 2 },
  { id: 'web', name: 'くさり', desc: 'ぷにをくさりでしばる。動けず、つなげない', tier: 2 },
  { id: 'slime', name: 'くぎづけ', desc: 'ぷにがその場に固定されて落ちなくなる', tier: 1 },
  { id: 'chameleon', name: 'カメレオン', desc: '色がコロコロかわるぷにになる', tier: 2 },
  { id: 'dark', name: 'くらやみ', desc: '指のまわりしか見えなくなる', tier: 3, dur: 7 },
  { id: 'mono', name: 'モノクロのろい', desc: '盤面の色がうすくなる', tier: 2, dur: 8 },
  { id: 'ink', name: 'スミはき', desc: '盤面にスミをはきかける', tier: 1, dur: 8 },
  { id: 'invisible', name: 'とうめいマント', desc: 'いくつかのぷにが見えなくなる', tier: 2, dur: 8 },
  { id: 'seal', name: 'いろふういん', desc: '1色がつなげなくなる', tier: 2, dur: 7 },
  { id: 'min4', name: 'よくばりのろい', desc: '4つ以上つながないと消えない', tier: 3, dur: 8 },
  { id: 'weak', name: 'すべりやすい', desc: 'つながるはんいがせまくなる', tier: 2, dur: 8 },
  { id: 'quake', name: 'じしん', desc: '盤面がゆれる', tier: 1, dur: 5 },
  { id: 'wind', name: 'よこかぜ', desc: '横から強い風がふく', tier: 1, dur: 6 },
  { id: 'float', name: 'むじゅうりょく', desc: 'ぷにがふわふわうく', tier: 2, dur: 6 },
  { id: 'tilt', name: 'かたむき', desc: '盤面がかたむく', tier: 2, dur: 7 },
  { id: 'freeze', name: 'こおりのいき', desc: '盤面がとまって、ぷにが落ちてこない', tier: 3, dur: 4 },
  { id: 'shuffle', name: 'いろシャッフル', desc: 'ぷにの色をごちゃまぜにする', tier: 1 },
  { id: 'timeSteal', name: 'じかんどろぼう', desc: 'のこり時間を5秒うばう', tier: 2 },
  { id: 'timeFast', name: 'せかすとけい', desc: 'しばらく時計が2倍速になる', tier: 3, dur: 6 },
  { id: 'skillDrain', name: 'ゲージすいとり', desc: '必殺技ゲージを40%へらす', tier: 1 },
  { id: 'feverDrain', name: 'フィーバーけし', desc: 'フィーバーゲージを半分にする', tier: 2 },
  { id: 'barrier', name: 'ホネバリア', desc: 'しばらくダメージが半分になる', tier: 2, dur: 7 },
  { id: 'skillSeal', name: 'わざふうじ', desc: 'しばらく必殺技がつかえない', tier: 2, dur: 10 },
  { id: 'comboBreak', name: 'コンボぎり', desc: 'コンボを0にもどす', tier: 1 },
];

export const GIMMICKS = Object.fromEntries(G.map((g) => [g.id, g])) as Record<GimmickId, GimmickDef>;
export const GIMMICK_COUNT = G.length;

/** What each boss likes to throw at you. */
const THEMES: Record<string, GimmickId[]> = {
  skeleton_minion: ['rock', 'junk', 'slime', 'comboBreak', 'quake', 'hardRock', 'bigRock', 'timeSteal'],
  skeleton_rogue: ['bubble', 'ink', 'skillDrain', 'chameleon', 'web', 'invisible', 'timeFast', 'dark'],
  skeleton_mage: ['ice', 'mono', 'curse', 'weak', 'float', 'seal', 'barrier', 'skillSeal', 'freeze'],
  skeleton_warrior: ['shuffle', 'wind', 'quake', 'tilt', 'bigRock', 'feverDrain', 'min4', 'skullBomb'],
};

/** Small seeded RNG so a level always has the same lineup. */
function rng(seed: number): () => number {
  let s = seed * 2654435761 >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The obstructions a boss level uses (empty for Lv.1). */
export function gimmicksFor(lv: number): GimmickId[] {
  if (lv < 2) return [];
  const boss = BOSSES[(lv - 1) % BOSSES.length];
  const n = Math.min(4, 1 + Math.floor((lv - 2) / 3));
  const maxTier = Math.min(3, 1 + Math.floor((lv - 2) / 4));
  const r = rng(lv);
  const own = THEMES[boss.id].filter((id) => GIMMICKS[id].tier <= maxTier);
  const out: GimmickId[] = [];
  while (out.length < n && own.length) out.push(own.splice(Math.floor(r() * own.length), 1)[0]);
  // past Lv.13 bosses also borrow a trick from the others
  if (lv >= 14) {
    const all = G.map((g) => g.id).filter((id) => !out.includes(id));
    out.push(all[Math.floor(r() * all.length)]);
  }
  return out;
}
