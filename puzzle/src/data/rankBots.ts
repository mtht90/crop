import { CHARACTERS, isReleased } from './characters';
import type { RankRow } from '../core/Ranking';

/**
 * Filler players for the weekly ranking while the game is young: until 100 real players
 * have ever played, the board is topped up with generated ones so it never looks empty.
 * They are deterministic per week (everyone sees the same names and scores) and their
 * scores grow through the week like real players coming back to play.
 */
export const BOT_UNTIL = 100;

const A = ['ぷに', 'もち', 'ねこ', 'しろ', 'くろ', 'そら', 'はる', 'なつ', 'ゆき', 'みかん', 'いちご', 'こむぎ', 'まめ', 'ぽん', 'たま', 'りん', 'ころ', 'ぴよ', 'うに', 'さくら', 'あお', 'ひな', 'ちょこ', 'ぷりん', 'わたあめ', 'ほね', 'くま', 'うさ', 'こはる', 'ゆず'];
const B = ['', '', '', 'ちゃん', 'くん', 'まる', 'たろう', 'すけ', 'りん', 'っち', 'ぴー', 'さん', 'みん', 'こ', 'ぞう'];
const ROMA = ['yuki', 'haru', 'sora', 'kenta', 'mio', 'rin', 'taku', 'nana', 'shun', 'aoi', 'riku', 'mei', 'kai', 'yuna', 'ren'];
const TAILS = ['', '', '_', '0', '2525', '7', '22', '_x', '33', '1999', 'z', 'jp'];
const MISC = ['ホネハンター', 'ぷに職人', 'なぞり名人', 'つなぎ屋', 'ボム好き', 'まったり勢', 'ガチ勢見習い', '討伐たい', 'ねむいひと', 'コイン貯金中', '初心者です', 'ぷにぷに隊'];

/** Small seeded RNG (mulberry32). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function botName(r: () => number): string {
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const k = r();
  if (k < 0.55) return pick(A) + pick(B);
  if (k < 0.85) return pick(ROMA) + pick(TAILS);
  return pick(MISC);
}

/** Character a bot shows, weighted toward common ones. */
function botChar(r: () => number): string {
  const x = r();
  const tier = x < 0.45 ? 'N' : x < 0.75 ? 'R' : x < 0.95 ? 'SR' : 'SSR';
  const pool = CHARACTERS.filter((c) => c.rarity === tier && !c.limitedUntil && isReleased(c));
  return pool[Math.floor(r() * pool.length)].id;
}

/**
 * The bots for a week at time `now`. `realPlayers` = players who have ever played; the bot
 * count shrinks as real players arrive. `weekStart` is Monday 00:00 JST in ms.
 */
export function botsFor(week: string, weekStart: number, realPlayers: number, now = Date.now()): RankRow[] {
  const n = Math.max(0, BOT_UNTIL - realPlayers);
  if (!n) return [];
  const r = rng(hash(`bots:${week}`));
  const progress = Math.min(1, Math.max(0, (now - weekStart) / (7 * 86400_000)));
  const out: RankRow[] = [];
  for (let i = 0; i < n; i++) {
    const name = botName(r);
    const char = botChar(r);
    // final weekly best: mostly casual, a few strong ones (log-normal, median ~500k)
    const skill = Math.exp(Math.log(500_000) + (r() + r() + r() - 1.5) * 1.3);
    const final = Math.round(Math.min(6_000_000, Math.max(60_000, skill)) / 10) * 10;
    // when they first play this week, and how fast they improve
    const join = r() * r() * 0.85;
    const pace = 0.35 + r() * 0.65;
    if (progress < join) continue;
    const t = Math.min(1, (progress - join) / Math.max(0.05, 1 - join));
    // steps up as they keep playing: early sessions land 55–80% of their best
    const k = 0.55 + 0.45 * Math.pow(t, pace);
    const score = Math.round((final * k) / 10) * 10;
    out.push({ player_id: `bot-${week}-${i}`, name, score, char_id: char });
  }
  return out;
}

/** Monday 00:00 JST of a week key, as epoch ms. */
export function weekStartMs(week: string): number {
  return Date.parse(`${week}T00:00:00+09:00`);
}
