// 恒久データ(ブラウザの localStorage に保存)
import { ACHIEVEMENTS } from '../game/data.js';
const KEY = 'endless-wilds-save-v1';
const DEFAULT = () => ({
  gold: 0, shop: {}, unlocks: {}, achievements: {},
  totalKills: 0, totalRuns: 0, totalChests: 0, totalBosses: 0, totalSeals: 0, totalEvolves: 0, totalWins: 0,
  best: { time: 0, kills: 0, level: 0 },
  settings: { master: 0.8, sfx: 0.8, bgm: 0.6, quality: 'high', shake: true, numbers: true },
  lastHero: 'knight',
});
export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT();
    const d = JSON.parse(raw);
    const def = DEFAULT();
    return { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) }, best: { ...def.best, ...(d.best || {}) } };
  } catch (e) { return DEFAULT(); }
}
export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
}
export function resetSave() { try { localStorage.removeItem(KEY); } catch (e) {} return DEFAULT(); }
// 実績判定。新しく達成したものを返す
export function checkAchievements(save, run) {
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id]) continue;
    if (a.check(save, run)) {
      save.achievements[a.id] = Date.now();
      if (a.unlock) save.unlocks[a.unlock] = true;
      if (a.gold) save.gold += a.gold;
      got.push(a);
    }
  }
  return got;
}
