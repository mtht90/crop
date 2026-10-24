import { RETIRED } from '../data/characters';
import type { ItemId } from '../data/play';

const KEY = 'punitto-battle-save-v2';

export interface OwnedChar {
  /** Level from playing (cap by rarity) and EXP toward the next one. */
  lv: number;
  exp: number;
  /** Skill level 1–6 (raised with skill tickets). */
  skill: number;
  /** Limit break (+1 per duplicate, up to 99). */
  plus: number;
  /** Total copies obtained (including the first). */
  count: number;
}

/** Per-round counters that missions read (summed; maxChain/maxCombo are maxed). */
export interface Stats {
  plays: number;
  defeats: number;
  pops: number;
  fevers: number;
  skills: number;
  bombs: number;
  chains7: number;
  broken: number;
  maxChain: number;
  maxCombo: number;
}

export interface SaveData {
  coins: number;
  /** Single-pull gacha tickets (one is handed out on first launch). */
  tickets: number;
  /** Skill-up tickets (one kind for every character; rare). */
  skillTickets: number;
  owned: Record<string, OwnedChar>;
  selected: string;
  bossLv: number;
  /** Boss level picked on the home screen (past bosses can be fought again); 0 = the current one. */
  fightLv: number;
  best: number;
  plays: number;
  defeats: number;
  totalPulls: number;
  /** Pulls since the last SSR (used for the pity counter). */
  pity: number;
  tutorialDone: boolean;
  /** One-time message for the home screen (e.g. refunds for retired characters). */
  notice?: string;
  /** Economy version: v2 pays ~1,000–6,000 coins a round (old balances are scaled up). */
  econ: number;
  /** 1: the skill became manual by default (old saves get switched once). */
  skillV: number;
  /** Time attack (fixed seconds, best score): this week's best, the all-time best, runs this week. */
  ta: { week: string; best: number; allBest: number; runs: number };
  /** Lives: one per round, up to 5, one back every 10 minutes. `lifeAt` = when the next one started refilling. */
  lives: number;
  lifeAt: number;
  /** Items paid for on the home screen, used by the next round. */
  pendingItems: ItemId[];
  /** Online ranking: anonymous player id, nickname, local weekly best, weeks already rewarded. */
  rank: { id: string; name: string; best: Record<string, number>; claimed: string[]; sent: Record<string, number> };
  /** Secret for collecting shop purchases on this device (only its hash is sent until claiming). */
  payKey: string;
  /** Versus record. */
  vs: { win: number; lose: number; draw: number };
  /** Bingo cards: current card, square progress, lines paid out, stamps shown (see data/bingo.ts). */
  bingo: { card: number; prog: number[]; lines: number[]; seen: boolean[] };
  /** Login bonus: last day claimed and the streak (1–7). */
  login: { day: string; streak: number };
  /** Lifetime counters for achievements. */
  stats: Partial<Stats>;
  daily: { date: string; ids: string[]; stats: Partial<Stats>; claimed: string[]; bonus: boolean };
  /** Achievement ids already collected. */
  claimed: string[];
  /** Puzzle wallpaper and board frame: equipped and unlocked. */
  look: { wallpaper: string; frame: string; line: string; wallpapers: string[]; frames: string[]; lines: string[] };
  settings: { bgm: number; sfx: number; haptics: boolean; colorAssist: boolean; battleBgm: string; autoSkill: boolean };
}

function defaults(): SaveData {
  return {
    coins: 0,
    tickets: 1,
    skillTickets: 0,
    owned: { kh_a: { lv: 1, exp: 0, skill: 1, plus: 0, count: 1 } },
    selected: 'kh_a',
    bossLv: 1,
    fightLv: 0,
    best: 0,
    plays: 0,
    defeats: 0,
    totalPulls: 0,
    pity: 0,
    tutorialDone: false,
    econ: 2,
    skillV: 0,
    ta: { week: '', best: 0, allBest: 0, runs: 0 },
    lives: 5,
    lifeAt: 0,
    pendingItems: [],
    rank: { id: '', name: '', best: {}, claimed: [], sent: {} },
    payKey: '',
    vs: { win: 0, lose: 0, draw: 0 },
    bingo: { card: 0, prog: Array(9).fill(0), lines: [], seen: Array(9).fill(false) },
    login: { day: '', streak: 0 },
    stats: {},
    daily: { date: '', ids: [], stats: {}, claimed: [], bonus: false },
    claimed: [],
    look: { wallpaper: 'felt', frame: 'wood', line: 'basic', wallpapers: ['felt'], frames: ['wood'], lines: ['basic'] },
    settings: { bgm: 0.7, sfx: 0.9, haptics: true, colorAssist: false, battleBgm: 'auto', autoSkill: false },
  };
}

function load(): SaveData {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return migrate({ ...d, ...parsed, settings: { ...d.settings, ...(parsed.settings ?? {}) }, look: { ...d.look, ...(parsed.look ?? {}) }, owned: { ...d.owned, ...(parsed.owned ?? {}) }, rank: { ...d.rank, ...(parsed.rank ?? {}) } }, parsed.econ ?? 1);
  } catch {
    return d;
  }
}

/** Retired characters turn into coins. */
function migrate(d: SaveData, econ = 2): SaveData {
  const lines: string[] = [];
  for (const [id, r] of Object.entries(RETIRED)) {
    const o = d.owned[id];
    if (!o) continue;
    const coins = r.refund * o.count;
    d.coins += coins;
    delete d.owned[id];
    lines.push(`${r.name} → ${coins}コイン`);
  }
  if (!d.owned[d.selected]) d.selected = 'kh_a';
  // the special move is fired by hand now (it can still be set to automatic)
  if (!(d.skillV >= 1)) {
    d.settings.autoSkill = false;
    d.skillV = 1;
  }
  // economy v2: gacha went from 300 to 10,000 coins, so old balances scale with it
  if (econ < 2) {
    d.coins = Math.round(d.coins * (10000 / 300));
    d.econ = 2;
  }
  // v1 characters leveled up from duplicates (Lv1–10); now levels come from play and duplicates are limit breaks
  for (const o of Object.values(d.owned) as Partial<OwnedChar>[]) {
    if (o.skill !== undefined) continue;
    const count = o.count ?? 1;
    o.lv = 1 + ((o.lv ?? 1) - 1) * 4;
    o.exp = 0;
    o.skill = 1;
    o.plus = Math.min(99, count - 1);
    o.count = count;
  }
  if (lines.length) {
    d.notice = `キャラ整理のおわび\n${lines.join('\n')}`;
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }
  return d;
}

const CODE_PREFIX = 'PUNI1:';

/** The save as a copyable code (base64 of the JSON). */
export function exportSave(): string {
  const json = JSON.stringify(Save.data);
  return CODE_PREFIX + btoa(unescape(encodeURIComponent(json)));
}

/** Restores a code from exportSave; false if it isn't valid. */
export function importSave(code: string): boolean {
  if (!code.startsWith(CODE_PREFIX)) return false;
  try {
    const json = decodeURIComponent(escape(atob(code.slice(CODE_PREFIX.length).replace(/\s/g, ''))));
    const parsed = JSON.parse(json) as Partial<SaveData>;
    if (!parsed || typeof parsed !== 'object' || !parsed.owned) return false;
    localStorage.setItem(KEY, json);
    return true;
  } catch {
    return false;
  }
}

export const Save = {
  data: load(),
  write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable (private mode etc.) – progress lives for this session only */
    }
  },
  /** The level the next battle is against. */
  fightLv(): number {
    const d = this.data;
    return d.fightLv >= 1 && d.fightLv <= d.bossLv ? d.fightLv : d.bossLv;
  },
  reset(): void {
    this.data = defaults();
    this.write();
  },
};
