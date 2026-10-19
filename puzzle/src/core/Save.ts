const KEY = 'punitto-battle-save-v1';

export interface OwnedChar {
  lv: number;
  /** Total copies obtained (including the first). */
  count: number;
}

export interface SaveData {
  coins: number;
  owned: Record<string, OwnedChar>;
  selected: string;
  bossLv: number;
  best: number;
  plays: number;
  defeats: number;
  totalPulls: number;
  /** Pulls since the last SSR (used for the pity counter). */
  pity: number;
  tutorialDone: boolean;
  settings: { bgm: number; sfx: number; haptics: boolean; colorAssist: boolean };
}

function defaults(): SaveData {
  return {
    coins: 1000,
    owned: { punimaru: { lv: 1, count: 1 } },
    selected: 'punimaru',
    bossLv: 1,
    best: 0,
    plays: 0,
    defeats: 0,
    totalPulls: 0,
    pity: 0,
    tutorialDone: false,
    settings: { bgm: 0.7, sfx: 0.9, haptics: true, colorAssist: false },
  };
}

function load(): SaveData {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...d, ...parsed, settings: { ...d.settings, ...(parsed.settings ?? {}) }, owned: { ...d.owned, ...(parsed.owned ?? {}) } };
  } catch {
    return d;
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
  reset(): void {
    this.data = defaults();
    this.write();
  },
};
