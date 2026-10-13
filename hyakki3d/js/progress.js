// 周回をまたぐ記録（解放済みの退魔師・図鑑・実績・最高記録）。この端末のブラウザにだけ保存する。
// 保存できない環境（プライベートモード等）でも遊べるよう、失敗は無視してメモリ上で続ける。
import { CHARACTERS, ACHIEVEMENTS, ENEMIES, EVOLUTIONS, MODES } from './config.js';

const KEY = 'hyakki3d-progress-v2';
const DEF = () => ({
  unlocked: ['seimei'], selected: 'seimei', mode: 'main',
  chests: 0, runs: 0, ults: 0,
  yokai: {},              // 妖怪ごとの通算撃破数
  evos: [],               // 登録した進化の術
  mids: {},               // 中ボスの通算撃破数
  clears: { main: [], short: [] },   // ボスを討った退魔師
  best: {},               // `${mode}:${char}` → { time, kills }
  ach: [],                // 達成した実績
});
let P = DEF();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const d = DEF(), o = JSON.parse(raw);
    P = { ...d, ...o, clears: { ...d.clears, ...(o.clears || {}) } };
  }
} catch (e) { /* 保存領域が使えない */ }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* 無視 */ }
}

const yokaiIds = Object.keys(ENEMIES).filter((id) => !ENEMIES[id].boss && !ENEMIES[id].mid);

function unlockOk(u, run) {
  switch (u.type) {
    case 'winShort': return P.clears.short.length > 0;
    case 'winMain': return P.clears.main.length > 0;
    case 'mids': return !!(run && run.mode === 'main' && run.mids && run.mids.length >= 2);
    case 'evos': return P.evos.length >= u.v;
    case 'clears': return P.clears.main.length >= u.v;
  }
  return false;
}

function achOk(id, run) {
  switch (id) {
    case 'first': return P.runs > 0;
    case 'k1000': return !!(run && run.kills >= 1000);
    case 'k3000': return !!(run && run.kills >= 3000);
    case 'orochi': return (P.mids.orochi || 0) > 0;
    case 'mukuro': return (P.mids.mukuro || 0) > 0;
    case 'short': return P.clears.short.length > 0;
    case 'main': return P.clears.main.length > 0;
    case 'evo1': return P.evos.length > 0;
    case 'evo9': return P.evos.length >= EVOLUTIONS.length;
    case 'yokai': return yokaiIds.every((k) => (P.yokai[k] || 0) > 0);
    case 'ult10': return P.ults >= 10;
    case 'allwin': return CHARACTERS.every((c) => P.clears.main.includes(c.id));
  }
  return false;
}

export const Progress = {
  get: () => P,
  isUnlocked: (id) => P.unlocked.includes(id),
  select(id) { if (P.unlocked.includes(id)) { P.selected = id; save(); } },
  selected() { return CHARACTERS.find((c) => c.id === P.selected && P.unlocked.includes(c.id)) || CHARACTERS[0]; },
  mode() { return MODES.find((m) => m.id === P.mode) || MODES[0]; },
  setMode(id) { P.mode = id; save(); },
  yokaiIds,

  // ラン中の記録（保存はまとめて check で行う）
  addChest() { P.chests++; },
  addKill(type) { P.yokai[type] = (P.yokai[type] || 0) + 1; },
  addEvo(id) { if (!P.evos.includes(id)) P.evos.push(id); },
  addMid(id) { P.mids[id] = (P.mids[id] || 0) + 1; },
  addUlt() { P.ults++; },
  startRun() { P.runs++; save(); },

  // ラン中・終了時に呼ぶ。新しく解放した退魔師と実績を返す
  // run: { mode, char, time, kills, win, mids, final }
  check(run) {
    if (run && run.final) {
      if (run.win && !P.clears[run.mode].includes(run.char)) P.clears[run.mode].push(run.char);
      const k = `${run.mode}:${run.char}`, b = P.best[k] || { time: 0, kills: 0, win: false };
      P.best[k] = { time: Math.max(b.time, Math.floor(run.time)), kills: Math.max(b.kills, run.kills), win: b.win || run.win };
    }
    const chars = [], achs = [];
    for (const c of CHARACTERS) {
      if (!c.unlock || P.unlocked.includes(c.id)) continue;
      if (unlockOk(c.unlock, run)) { P.unlocked.push(c.id); chars.push(c); }
    }
    for (const a of ACHIEVEMENTS) {
      if (P.ach.includes(a.id)) continue;
      if (achOk(a.id, run)) { P.ach.push(a.id); achs.push(a); }
    }
    save();
    return { chars, achs };
  },
};
