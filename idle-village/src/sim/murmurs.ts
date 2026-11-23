// AIが使えないとき・考え中のときの、ちょっとしたつぶやき
import type { Villager } from './types';
import { pick } from './util';

const BY_TASK: Record<string, string[]> = {
  chop: ['えいっ!', 'もうすぐ倒れるぞー', '木の香りがする'],
  harvest: ['よしよし…', '今夜はごちそうだ'],
  mine: ['カーン、カーン', 'キラッと光った!'],
  build: ['トンテンカン♪', 'もうひと踏ん張り'],
  repair: ['すぐ直すからな'],
  deliver: ['運んできたよー', 'ずっしり重い'],
  wander: ['いい天気', 'ふんふふ〜ん', '風が気持ちいい'],
  play: ['まてまて〜', 'あはは!'],
  guard: ['異常なし'],
};
const NIGHT = ['おやすみ…', 'ふわぁ…'];
const HUNGRY = ['おなかすいた…', 'ぐぅ〜'];
const RAID = ['盗賊だー!', '逃げろー!', '隠れなきゃ!'];

export function murmur(v: Villager, ctx: { night: boolean; raid: boolean }): string | null {
  if (ctx.raid) return pick(RAID);
  if (v.hunger > 0.85) return pick(HUNGRY);
  if (ctx.night) return pick(NIGHT);
  const arr = BY_TASK[v.task?.type ?? 'wander'];
  return arr ? pick(arr) : null;
}

export const CHAT_PAIRS: [string, string][] = [
  ['いい天気だね', 'ほんとだね'],
  ['最近どう?', 'ぼちぼちかな'],
  ['今夜は何を食べる?', 'もちろん肉!'],
  ['この島、好きだな', 'わたしも'],
  ['手伝おうか?', '助かるよ!'],
];
