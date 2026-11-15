import { MATERIALS, WEAPONS, type MatId, type ModId, type WeaponId, QUIRKS, type Quirk } from './data';

export interface WeaponState {
  unlocked: boolean;
  mods: Record<ModId, number>;
  quirk?: string;
}
export interface SaveData {
  version: 1;
  mats: Record<MatId, number>;
  weapons: Record<WeaponId, WeaponState>;
  loadout: WeaponId[];
  hunts: number;
  bossKills: number;
  bestTime?: number;
  seenIntro: boolean;
  sensitivity: number;
  volume: number;
}

const KEY = 'core-eater-hunt-save-v1';

function fresh(): SaveData {
  const mats = Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, 0])) as Record<MatId, number>;
  const ws = (id: WeaponId): WeaponState => ({ unlocked: !WEAPONS[id].unlock, mods: { power: 0, feed: 0, gut: 0 } });
  return {
    version: 1,
    mats,
    weapons: { pistol: ws('pistol'), bow: ws('bow'), shotgun: ws('shotgun') },
    loadout: ['pistol', 'bow'],
    hunts: 0,
    bossKills: 0,
    seenIntro: false,
    sensitivity: 1,
    volume: 0.8,
  };
}

export let save: SaveData = load();

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as SaveData;
      const f = fresh();
      return { ...f, ...d, mats: { ...f.mats, ...d.mats }, weapons: { ...f.weapons, ...d.weapons } };
    }
  } catch {
    /* ストレージ不可でも遊べるようにする */
  }
  return fresh();
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* noop */
  }
}

export function resetSave() {
  save = fresh();
  persist();
}

export function canAfford(cost: Partial<Record<MatId, number>>) {
  return Object.entries(cost).every(([k, v]) => save.mats[k as MatId] >= (v ?? 0));
}
export function pay(cost: Partial<Record<MatId, number>>) {
  for (const [k, v] of Object.entries(cost)) save.mats[k as MatId] -= v ?? 0;
}
export function addMats(m: Partial<Record<MatId, number>>) {
  for (const [k, v] of Object.entries(m)) save.mats[k as MatId] += v ?? 0;
}
export function quirkOf(id: WeaponId): Quirk | undefined {
  const q = save.weapons[id].quirk;
  return QUIRKS.find((x) => x.id === q);
}
