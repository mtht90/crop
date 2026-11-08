// ============================================================================
// ランクマッチ: when nobody is found within 30 seconds, a bot takes the other
// seat. It looks like any player (a name, a portrait, a rank close to yours)
// and plays with the CPU's thinking, a beat slower than a machine would.
// ============================================================================
import { randomInt, randomUUID } from 'node:crypto';
import { aiAnswer } from '../src/engine/ai';
import { ALL_DECKS, cpuPrintTier, DECK_STRENGTH, expand, upgradeDeck } from '../src/engine/decks';
import type { Answer } from '../src/engine/types';
import type { Game } from '../src/engine/game';
import { PORTRAITS } from '../src/online/protocol';
import { newRank, tierOf } from '../src/online/rank';
import type { PlayerRecord } from './players';

/** how long a ranked player waits before a bot steps in */
export const BOT_AFTER_MS = 30_000;

const FIRST = ['レン', 'ソラ', 'ユウキ', 'カイ', 'ミオ', 'ハル', 'リク', 'アオイ', 'ナギ', 'トワ', 'ルカ', 'ヒナタ', 'シン', 'コハク', 'ツバサ', 'イオリ', 'セナ', 'マコト'];
const LATIN = ['Ash', 'Rook', 'Nyx', 'Kite', 'Vale', 'Echo', 'Fang', 'Orin', 'Sable', 'Wren', 'Juno', 'Rhea'];

function botName() {
  const r = Math.random();
  if (r < 0.45) return FIRST[randomInt(FIRST.length)];
  if (r < 0.7) return `${FIRST[randomInt(FIRST.length)]}${randomInt(1, 100)}`;
  if (r < 0.9) return LATIN[randomInt(LATIN.length)];
  return `${LATIN[randomInt(LATIN.length)]}_${randomInt(10, 1000)}`;
}

export interface Bot {
  record: PlayerRecord;
  /** CPU level the bot thinks at */
  level: number;
  deck: string[];
  /** actions taken in the current turn (the AI needs it) */
  actions: number;
  turn: number;
}

/** a bot for someone of `rating`: a rank close to theirs, a CPU level to match */
export function makeBot(rating: number): Bot {
  const r = Math.round(rating + randomInt(-40, 41));
  const tier = tierOf(r);
  const level = [4, 5, 6, 7, 8, 8][tier];
  // the stronger the tier, the stronger the deck pool
  const pool = tier >= 2 ? ALL_DECKS.filter((d) => DECK_STRENGTH.includes(d.id)) : ALL_DECKS;
  const d = pool[randomInt(pool.length)];
  const record: PlayerRecord = {
    id: `bot-${randomUUID()}`,
    secrets: [],
    name: botName(),
    portrait: PORTRAITS[randomInt(PORTRAITS.length)],
    ranked: { ...newRank(), rating: r, placed: true, games: randomInt(8, 60) },
    games: 0,
    wins: 0,
    losses: 0,
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };
  return { record, level, deck: upgradeDeck(expand(d.cards), cpuPrintTier(level)), actions: 0, turn: -1 };
}

/** the bot's answer to what the game is waiting for */
export function botAnswer(bot: Bot, g: Game): Answer {
  if (g.s.turn !== bot.turn) {
    bot.turn = g.s.turn;
    bot.actions = 0;
  }
  const ans = aiAnswer(g, bot.level, bot.actions);
  if (ans.type === 'action') bot.actions++;
  return ans;
}

/** how long the bot "thinks" before answering (ms) */
export function botDelay(kind: string) {
  return kind === 'action' ? 900 + randomInt(0, 2200) : kind === 'setup' ? 1500 + randomInt(0, 2500) : 700 + randomInt(0, 1300);
}
