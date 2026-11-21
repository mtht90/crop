// The live game: owns the save, autosaves, offline catch-up, and notifies the UI.
import { ALLY_BY_ID } from '../data/monsters';
import { EQUIP_BY_ID, SKILL_BY_ID } from '../data/items';
import { SAVE_VERSION, heroStats, newSave, OFFLINE_MAX_HOURS, type HeroStats, type Save } from './core';
import * as L from './logic';
import { setSound } from './audio';

const KEY = 'spirit-master-save-v1';

export type GameEvent =
  | { t: 'toast'; text: string; kind?: 'good' | 'info' | 'warn' | 'rare' }
  | { t: 'offline'; report: L.OfflineReport }
  | { t: 'stage'; g: number; newArea: boolean }
  | { t: 'orbs'; got: ReturnType<typeof L.openOrbs> };

class Game {
  save: Save = newSave();
  hero: HeroStats = heroStats(this.save);
  version = 0;
  private listeners = new Set<() => void>();
  private evListeners = new Set<(e: GameEvent) => void>();
  private saveTimer = 0;
  rnd = Math.random;

  load() {
    let s: Save | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) s = migrate(JSON.parse(raw));
    } catch {
      s = null;
    }
    this.save = s ?? newSave();
    L.rollDaily(this.save);
    setSound(this.save.settings.sound);
    this.recalc();
  }

  /** Offline progress since the last save. Returns the report if anything happened. */
  catchUp(now = Date.now()) {
    const s = this.save;
    const elapsed = Math.min(OFFLINE_MAX_HOURS * 3600, (now - s.lastSeen) / 1000);
    s.lastSeen = now;
    if (elapsed < 60) return null;
    const rep = L.simulateOffline(s, elapsed, this.rnd);
    s.stats.played += elapsed;
    this.recalc();
    this.persist();
    if (rep.kills > 0 || rep.bossWins > 0) this.emit({ t: 'offline', report: rep });
    return rep;
  }

  persist() {
    this.save.lastSeen = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.save));
    } catch {
      /* storage full / private mode: keep playing */
    }
  }

  startAutosave() {
    clearInterval(this.saveTimer);
    this.saveTimer = window.setInterval(() => this.persist(), 5000);
    window.addEventListener('pagehide', () => this.persist());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.persist();
      else this.catchUp();
    });
  }

  recalc() {
    this.hero = heroStats(this.save);
    this.changed();
  }
  changed() {
    this.version++;
    for (const f of this.listeners) f();
  }
  subscribe(f: () => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  onEvent(f: (e: GameEvent) => void) {
    this.evListeners.add(f);
    return () => this.evListeners.delete(f);
  }
  emit(e: GameEvent) {
    for (const f of this.evListeners) f(e);
  }
  toast(text: string, kind: 'good' | 'info' | 'warn' | 'rare' = 'info') {
    this.emit({ t: 'toast', text, kind });
  }

  // ---- actions used by UI ----
  act<T>(fn: (s: Save) => T): T {
    const r = fn(this.save);
    this.recalc();
    return r;
  }

  exportSave() {
    return btoa(unescape(encodeURIComponent(JSON.stringify(this.save))));
  }
  importSave(str: string) {
    const data = migrate(JSON.parse(decodeURIComponent(escape(atob(str.trim())))));
    if (!data) throw new Error('invalid');
    this.save = data;
    this.persist();
    this.recalc();
  }
  reset() {
    this.save = newSave();
    this.persist();
    this.recalc();
  }
}

function migrate(d: any): Save | null {
  if (!d || typeof d !== 'object' || typeof d.v !== 'number') return null;
  const base = newSave();
  const s: Save = { ...base, ...d };
  s.settings = { ...base.settings, ...(d.settings ?? {}) };
  s.train = { ...base.train, ...(d.train ?? {}) };
  s.gacha = { ...base.gacha, ...(d.gacha ?? {}) };
  s.missions = { ...base.missions, ...(d.missions ?? {}) };
  s.stats = { ...base.stats, ...(d.stats ?? {}) };
  s.equipped = { ...base.equipped, ...(d.equipped ?? {}) };
  // drop unknown ids (data changes between versions)
  for (const k of Object.keys(s.chars)) if (!ALLY_BY_ID[k]) delete s.chars[k];
  for (const k of Object.keys(s.equips)) if (!EQUIP_BY_ID[k]) delete s.equips[k];
  for (const k of Object.keys(s.skills)) if (!SKILL_BY_ID[k]) delete s.skills[k];
  for (const k of Object.keys(s.guardians)) if (!ALLY_BY_ID[k.replace(/\*$/, '')]) delete s.guardians[k];
  if (!s.chars[s.active]) s.active = base.active;
  if (!s.chars[base.active]) s.chars[base.active] = { stars: 0, copies: 0 };
  while (s.guardianSlots.length < 6) s.guardianSlots.push(null);
  while (s.skillSlots.length < 3) s.skillSlots.push(null);
  s.v = SAVE_VERSION;
  return s;
}

export const game = new Game();
