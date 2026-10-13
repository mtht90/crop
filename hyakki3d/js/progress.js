// 周回をまたぐ記録（解放済みの陰陽師・通算の宝箱数・最高記録）。この端末のブラウザにだけ保存する。
// 保存できない環境（プライベートモード等）でも遊べるよう、失敗は無視してメモリ上で続ける。
import { CHARACTERS } from './config.js';

const KEY = 'hyakki3d-progress-v1';
const DEF = { unlocked: ['seimei'], chests: 0, wins: 0, bestTime: 0, bestKills: 0, selected: 'seimei' };
let P = { ...DEF };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) P = { ...DEF, ...JSON.parse(raw) };
} catch (e) { /* 保存領域が使えない */ }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* 無視 */ }
}

export const Progress = {
  get: () => P,
  isUnlocked: (id) => P.unlocked.includes(id),
  select(id) { if (P.unlocked.includes(id)) { P.selected = id; save(); } },
  selected() { return CHARACTERS.find((c) => c.id === P.selected && P.unlocked.includes(c.id)) || CHARACTERS[0]; },
  addChest() { P.chests++; save(); },
  // ラン中・終了時に呼ぶ。新しく解放した陰陽師の配列を返す
  check(run) {
    if (run) {
      P.bestTime = Math.max(P.bestTime, Math.floor(run.time));
      P.bestKills = Math.max(P.bestKills, run.kills);
      if (run.win) P.wins++;
    }
    const fresh = [];
    for (const c of CHARACTERS) {
      if (!c.unlock || P.unlocked.includes(c.id)) continue;
      const u = c.unlock;
      const ok = (u.type === 'time' && run && run.time >= u.v)
        || (u.type === 'kills' && run && run.kills >= u.v)
        || (u.type === 'chests' && P.chests >= u.v)
        || (u.type === 'win' && P.wins > 0);
      if (ok) { P.unlocked.push(c.id); fresh.push(c); }
    }
    save();
    return fresh;
  },
};
