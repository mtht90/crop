import { RETIRED } from '../data/characters';

const KEY = 'punitto-battle-save-v2';

export interface OwnedChar {
  lv: number;
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
  /** Lifetime counters for achievements. */
  stats: Partial<Stats>;
  daily: { date: string; ids: string[]; stats: Partial<Stats>; claimed: string[]; bonus: boolean };
  /** Achievement ids already collected. */
  claimed: string[];
  /** Puzzle wallpaper and board frame: equipped and unlocked. */
  look: { wallpaper: string; frame: string; wallpapers: string[]; frames: string[] };
  settings: { bgm: number; sfx: number; haptics: boolean; colorAssist: boolean; battleBgm: string; autoSkill: boolean };
}

function defaults(): SaveData {
  return {
    coins: 0,
    tickets: 1,
    owned: { kh_a: { lv: 1, count: 1 } },
    selected: 'kh_a',
    bossLv: 1,
    fightLv: 0,
    best: 0,
    plays: 0,
    defeats: 0,
    totalPulls: 0,
    pity: 0,
    tutorialDone: false,
    stats: {},
    daily: { date: '', ids: [], stats: {}, claimed: [], bonus: false },
    claimed: [],
    look: { wallpaper: 'felt', frame: 'wood', wallpapers: ['felt'], frames: ['wood'] },
    settings: { bgm: 0.7, sfx: 0.9, haptics: true, colorAssist: false, battleBgm: 'auto', autoSkill: true },
  };
}

function load(): SaveData {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return migrate({ ...d, ...parsed, settings: { ...d.settings, ...(parsed.settings ?? {}) }, look: { ...d.look, ...(parsed.look ?? {}) }, owned: { ...d.owned, ...(parsed.owned ?? {}) } });
  } catch {
    return d;
  }
}

/** Retired characters turn into coins. */
function migrate(d: SaveData): SaveData {
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
