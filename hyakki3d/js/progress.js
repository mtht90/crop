// 周回をまたぐ記録（解放済みの退魔師・図鑑・実績・最高記録）。この端末のブラウザにだけ保存する。
// 保存できない環境（プライベートモード等）でも遊べるよう、失敗は無視してメモリ上で続ける。
import { CHARACTERS, ACHIEVEMENTS, ENEMIES, EVOLUTIONS, MODES, POWERUPS, powerCost, GEAR, RARITY, CHAPTERS } from './config.js';

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
  gold: 0,                // 金貨
  power: {},              // 永続強化の段（id → 段）
  gear: [],               // 持っている装備 { uid, id, r }
  equip: {},              // スロット → uid
  gearSeq: 1,
  chapter: 1,             // 選んでいる章
  chapterMax: 1,          // 開いている最後の章
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

const yokaiIds = Object.keys(ENEMIES).filter((id) => !ENEMIES[id].boss && !ENEMIES[id].mid && !ENEMIES[id].static);
const GEAR_BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g]));

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

  // ---- 金貨と永続強化 ----
  gold: () => P.gold,
  addGold(v) { P.gold += Math.max(0, Math.round(v)); save(); },
  power: () => P.power,
  powerLv: (id) => P.power[id] || 0,
  buyPower(id) {
    const p = POWERUPS.find((x) => x.id === id), lv = P.power[id] || 0;
    if (!p || lv >= p.max) return false;
    const c = powerCost(p, lv);
    if (P.gold < c) return false;
    P.gold -= c; P.power[id] = lv + 1; save();
    return true;
  },
  // 返金して振り直す（全額戻す）
  refundPower() {
    let back = 0;
    for (const p of POWERUPS) for (let lv = 0; lv < (P.power[p.id] || 0); lv++) back += powerCost(p, lv);
    P.gold += back; P.power = {}; save();
    return back;
  },

  // ---- 装備 ----
  gear: () => P.gear,
  equipped: () => P.equip,
  gearDef: (id) => GEAR_BY_ID[id],
  addGear(id, r) {
    const g = { uid: P.gearSeq++, id, r };
    P.gear.push(g);
    if (!P.equip[GEAR_BY_ID[id].slot]) P.equip[GEAR_BY_ID[id].slot] = g.uid;   // 空きスロットには自動で装備
    save();
    return g;
  },
  equip(uid) {
    const g = P.gear.find((x) => x.uid === uid);
    if (!g) return;
    const slot = GEAR_BY_ID[g.id].slot;
    P.equip[slot] = P.equip[slot] === uid ? undefined : uid;
    save();
  },
  sellGear(uid) {
    const i = P.gear.findIndex((x) => x.uid === uid);
    if (i < 0) return 0;
    const g = P.gear[i], v = 20 * (g.r + 1) * (g.r + 1);
    P.gear.splice(i, 1);
    for (const k in P.equip) if (P.equip[k] === uid) delete P.equip[k];
    P.gold += v; save();
    return v;
  },
  // 同じ装備・同じレア度が3つあれば1段上の1つに合成する（装備中のものを優先して残す）
  mergeGear(uid) {
    const g = P.gear.find((x) => x.uid === uid);
    if (!g || g.r >= RARITY.length - 1) return null;
    const same = P.gear.filter((x) => x.id === g.id && x.r === g.r);
    if (same.length < 3) return null;
    same.sort((a, b) => (Object.values(P.equip).includes(b.uid) ? 1 : 0) - (Object.values(P.equip).includes(a.uid) ? 1 : 0));
    const keep = same[0];
    for (const x of same.slice(1, 3)) {
      P.gear.splice(P.gear.indexOf(x), 1);
      for (const k in P.equip) if (P.equip[k] === x.uid) delete P.equip[k];
    }
    keep.r++;
    save();
    return keep;
  },
  // 装備中の効果の合計
  gearStats() {
    const out = {};
    for (const uid of Object.values(P.equip)) {
      const g = P.gear.find((x) => x.uid === uid);
      if (!g) continue;
      const d = GEAR_BY_ID[g.id], m = RARITY[g.r].mul;
      for (const k in d.stats) out[k] = (out[k] || 0) + d.stats[k] * m;
    }
    return out;
  },

  // ---- 章 ----
  chapter() { return CHAPTERS.find((c) => c.id === P.chapter && c.id <= P.chapterMax) || CHAPTERS[0]; },
  chapterMax: () => P.chapterMax,
  setChapter(id) { if (id <= P.chapterMax) { P.chapter = id; save(); } },

  // ラン中・終了時に呼ぶ。新しく解放した退魔師と実績を返す
  // run: { mode, char, time, kills, win, mids, final }
  check(run) {
    if (run && run.final) {
      if (run.win && !P.clears[run.mode].includes(run.char)) P.clears[run.mode].push(run.char);
      if (run.win && run.mode === 'main' && run.chapter >= P.chapterMax && P.chapterMax < CHAPTERS.length) { P.chapterMax = run.chapter + 1; run.newChapter = P.chapterMax; }
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
