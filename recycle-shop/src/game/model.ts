import { CATEGORIES, ITEMS, itemDef, type CategoryId, type ItemDef } from '../data/items';
import { NEWS, QUIET_NEWS } from '../data/news';
import { UPGRADES, upgradeDef } from '../data/upgrades';
import { events, toast } from '../core/events';
import { Rng, clamp, uid, yen } from '../core/util';
import {
  CLOSE_MINUTE, OPEN_MINUTE, SAVE_VERSION, emptyLedger,
  type FixtureState, type GameState, type ItemState, type MarketState,
} from './state';
import { generateItem, trueValue } from './valuation';
import type { RequestState } from './requests';

const SAVE_KEY = 'recycle-shop-sim/save';

export interface LotDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  level: number;
  count: number;
  cats: CategoryId[];
  careful: number;
  fakeRate: number;
}

/** 業者からのまとめ仕入れ (1 日 1 回ずつ) */
export const LOTS: LotDef[] = [
  { id: 'junk', name: 'ジャンク箱', desc: '家電・おもちゃ中心の 6 点。壊れ物・汚れ物が多いが、直せば化ける。', price: 5000, level: 1, count: 6, cats: ['appliance', 'hobby', 'kitchen'], careful: 0.15, fakeRate: 0 },
  { id: 'household', name: '引っ越し整理品', desc: '家具・日用品の 5 点。状態はまずまず。', price: 9000, level: 1, count: 5, cats: ['furniture', 'kitchen'], careful: 0.55, fakeRate: 0 },
  { id: 'estate', name: '遺品整理ロット', desc: '骨董・美術品を含む 4 点。掘り出し物があるかも。', price: 26000, level: 2, count: 4, cats: ['antique', 'furniture'], careful: 0.5, fakeRate: 0.2 },
  { id: 'brand', name: 'ブランド品オークション', desc: 'ブランド品 3 点。偽物が混じっているので鑑定は必須。', price: 70000, level: 3, count: 3, cats: ['brand'], careful: 0.7, fakeRate: 0.35 },
];

export interface Objective {
  id: string;
  text: string;
  reward: number;
  check: (m: GameModel) => boolean;
}

export const OBJECTIVES: Objective[] = [
  { id: 'stock_out', text: '在庫置き場から商品を取り出して棚に並べる', reward: 0, check: (m) => m.state.items.some((i) => i.loc.type === 'fixture') },
  { id: 'price', text: '並べた商品に値札をつける (見ながら F キー)', reward: 1000, check: (m) => m.state.items.some((i) => i.loc.type === 'fixture' && i.price) },
  { id: 'open', text: '入口の看板を「営業中」にして開店する', reward: 0, check: (m) => m.state.phase === 'open' || m.state.day > 1 },
  { id: 'sell', text: '商品を 1 つ販売する', reward: 2000, check: (m) => m.state.stats.itemsSold >= 1 },
  { id: 'buy', text: '持ち込み品を買い取る', reward: 2000, check: (m) => m.state.stats.itemsBought >= 1 },
  { id: 'clean', text: '作業台で商品を清掃する', reward: 3000, check: (m) => m.state.stats.cleaned >= 1 },
  { id: 'sales30k', text: '累計売上 ¥30,000 を達成', reward: 5000, check: (m) => m.state.stats.totalSales >= 30000 },
  { id: 'fixture', text: 'PC から什器を購入して配置する', reward: 5000, check: (m) => m.state.fixtures.length > 8 },
  { id: 'repair', text: '壊れた家電を修理する', reward: 5000, check: (m) => m.state.stats.repaired >= 1 },
  { id: 'lv3', text: '店舗レベル 3 に到達', reward: 10000, check: (m) => m.state.level >= 3 },
  { id: 'fake', text: '偽物を見破って買取を断る/安く買う', reward: 15000, check: (m) => m.state.stats.fakesCaught >= 1 },
  { id: 'sales300k', text: '累計売上 ¥300,000 を達成', reward: 20000, check: (m) => m.state.stats.totalSales >= 300000 },
  { id: 'showcase', text: 'ガラスショーケースを設置する', reward: 10000, check: (m) => m.state.fixtures.some((f) => f.defId === 'showcase') },
  { id: 'rep80', text: '評判 80 以上を達成', reward: 30000, check: (m) => m.state.reputation >= 80 },
  { id: 'lv5', text: '店舗レベル 5 に到達', reward: 30000, check: (m) => m.state.level >= 5 },
  { id: 'expand', text: '店舗を拡張する', reward: 50000, check: (m) => m.has('expand') },
  { id: 'profit1m', text: '累計利益 ¥1,000,000 を達成', reward: 100000, check: (m) => m.state.stats.profit >= 1_000_000 },
];

export class GameModel {
  rng: Rng;

  constructor(public state: GameState) {
    this.rng = new Rng(state.seed);
  }

  // ───── 生成 / 保存 ─────
  static create(shopName: string): GameModel {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const cats = Object.keys(CATEGORIES) as CategoryId[];
    const market: MarketState = {
      trend: Object.fromEntries(cats.map((c) => [c, 1])) as Record<CategoryId, number>,
      history: Object.fromEntries(cats.map((c) => [c, [1]])) as Record<CategoryId, number[]>,
      news: [],
    };
    const state: GameState = {
      version: SAVE_VERSION, shopName, day: 1, minute: OPEN_MINUTE - 60, phase: 'prep',
      money: 50000, reputation: 40, xp: 0, level: 1, items: [], fixtures: [], upgrades: [], market,
      stats: { totalSales: 0, totalPurchases: 0, itemsSold: 0, itemsBought: 0, fakesCaught: 0, fakesBought: 0, customersServed: 0, bestSale: 0, profit: 0, cleaned: 0, repaired: 0 },
      today: emptyLedger(40), objectivesDone: [], pendingComplaints: [], seed,
    };
    const m = new GameModel(state);
    // 初期在庫: 開店準備用に安価な品をいくつか
    const starters = ['pot_a', 'pan_a', 'jar_b', 'mug', 'pillow_a', 'cactus_s', 'book', 'lamp_table', 'frame_stand_a', 'stool', 'chair_a_wood', 'trophy'];
    for (const id of starters) {
      const it = generateItem(itemDef(id), m.rng, { careful: 0.8, fakeRate: 0, day: 1 }, uid('it'));
      it.dirt = Math.min(it.dirt, 0.1);
      it.tested = true;
      it.working = true;
      it.cost = Math.round(itemDef(id).base * 0.3);
      for (const d of it.defects) d.found = true;
      state.items.push(it);
    }
    return m;
  }

  static hasSave(): boolean {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  static load(): GameModel | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as GameState;
      if (s.version !== SAVE_VERSION) return null;
      // 手に持っていた・客が持っていた・カウンター上の品は在庫へ戻す
      for (const it of s.items) {
        if (it.loc.type === 'held' || it.loc.type === 'customer' || it.loc.type === 'counter') it.loc = { type: 'stock' };
      }
      s.items = s.items.filter((i) => i.loc.type !== 'gone');
      return new GameModel(s);
    } catch (e) {
      console.warn('load failed', e);
      return null;
    }
  }

  save() {
    try {
      this.state.seed = this.rng.seed;
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
      return true;
    } catch (e) {
      console.warn('save failed', e);
      return false;
    }
  }

  static deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ } }

  // ───── お金・評判・経験値 ─────
  addMoney(delta: number, reason: string) {
    this.state.money = Math.round(this.state.money + delta);
    events.emit('money:changed', { money: this.state.money, delta, reason });
  }

  canAfford(n: number) { return this.state.money >= n; }

  addRep(delta: number) {
    if (delta > 0 && this.state.fixtures.some((f) => f.defId === 'drink_cooler')) delta *= 1.05;
    const before = this.state.reputation;
    this.state.reputation = clamp(before + delta, 0, 100);
    events.emit('reputation:changed', { value: this.state.reputation, delta: this.state.reputation - before });
  }

  xpForLevel(level: number) { return Math.round(400 * Math.pow(level, 1.55)); }

  addXp(n: number) {
    n = Math.round(n);
    this.state.xp += n;
    this.state.today.xp += n;
    let leveled = false;
    while (this.state.xp >= this.xpForLevel(this.state.level)) {
      this.state.xp -= this.xpForLevel(this.state.level);
      this.state.level++;
      leveled = true;
    }
    events.emit('xp:gained', { amount: n, level: this.state.level, leveledUp: leveled });
  }

  // ───── 商品 ─────
  item(uidStr: string) { return this.state.items.find((i) => i.uid === uidStr); }
  stockItems() { return this.state.items.filter((i) => i.loc.type === 'stock'); }
  displayed() { return this.state.items.filter((i) => i.loc.type === 'fixture'); }

  addItem(it: ItemState) { this.state.items.push(it); }
  removeItem(uidStr: string) { this.state.items = this.state.items.filter((i) => i.uid !== uidStr); }

  trend(cat: CategoryId) { return this.state.market.trend[cat]; }
  value(it: ItemState) { return trueValue(it, this.trend(itemDef(it.defId).category)); }

  /** 客が持ち込む品を生成 */
  rollSellItem(opt: { careful: number; fakeRate: number; fav: CategoryId[]; flyer: boolean }): ItemState {
    const pool = ITEMS.filter((d) => d.level <= this.state.level + 1);
    const def = this.rng.weighted<ItemDef>(pool, (d) => d.weight * (opt.fav.includes(d.category) ? 2.2 : 1) * (opt.flyer && d.base > 15000 ? 1.6 : 1));
    return generateItem(def, this.rng, { careful: clamp(opt.careful + (opt.flyer ? 0.08 : 0) + this.rng.range(-0.15, 0.15), 0, 1), fakeRate: opt.fakeRate, day: this.state.day }, uid('it'));
  }

  requests(): RequestState[] { return (this.state.requests ??= []); }

  // ───── まとめ仕入れ ─────
  lotsBoughtToday(): string[] { return this.state.lotsToday ?? []; }

  buyLot(lot: LotDef): ItemState[] | null {
    if (this.state.level < lot.level || !this.canAfford(lot.price) || this.lotsBoughtToday().includes(lot.id)) return null;
    this.addMoney(-lot.price, `まとめ仕入れ: ${lot.name}`);
    this.state.today.purchases += lot.price;
    this.state.stats.totalPurchases += lot.price;
    this.state.stats.profit -= lot.price;
    this.state.lotsToday = [...this.lotsBoughtToday(), lot.id];
    const out: ItemState[] = [];
    const pool = ITEMS.filter((d) => lot.cats.includes(d.category) && d.level <= this.state.level + 1);
    for (let i = 0; i < lot.count; i++) {
      const def = this.rng.weighted<ItemDef>(pool, (d) => d.weight);
      const it = generateItem(def, this.rng, { careful: clamp(lot.careful + this.rng.range(-0.2, 0.2), 0, 1), fakeRate: lot.fakeRate, day: this.state.day }, uid('it'));
      it.cost = Math.round(lot.price / lot.count);
      this.addItem(it);
      out.push(it);
    }
    this.state.stats.itemsBought += out.length;
    this.state.today.bought += out.length;
    return out;
  }

  // ───── アップグレード ─────
  has(id: string) { return this.state.upgrades.includes(id); }

  buyUpgrade(id: string): boolean {
    const u = upgradeDef(id);
    if (!u || this.has(id) || this.state.level < u.level || !this.canAfford(u.price)) return false;
    this.addMoney(-u.price, `設備投資: ${u.name}`);
    this.state.today.expenses += u.price;
    this.state.upgrades.push(id);
    events.emit('upgrade:bought', { id });
    return true;
  }

  addFixture(f: Omit<FixtureState, 'uid'>): FixtureState {
    const fs: FixtureState = { ...f, uid: uid('fx') };
    this.state.fixtures.push(fs);
    return fs;
  }

  // ───── 時間 ─────
  closeMinute() { return this.has('hours') ? 21 * 60 : CLOSE_MINUTE; }

  dailyCosts(): { label: string; amount: number }[] {
    const costs = [{ label: '家賃', amount: 5000 }, { label: '光熱費', amount: 1200 + this.state.fixtures.length * 60 }];
    for (const u of UPGRADES) if (u.upkeep && this.has(u.id)) costs.push({ label: u.name, amount: u.upkeep });
    return costs;
  }

  openShop() {
    if (this.state.phase !== 'prep') return;
    this.state.phase = 'open';
    this.state.minute = Math.max(this.state.minute, OPEN_MINUTE);
    events.emit('day:opened', { day: this.state.day });
  }

  /** 営業終了。日次の精算を行う */
  settleDay() {
    const s = this.state;
    for (const c of this.dailyCosts()) {
      this.addMoney(-c.amount, c.label);
      s.today.expenses += c.amount;
    }
    s.phase = 'summary';
    events.emit('day:ended', { day: s.day });
  }

  /** 翌日の開始処理。相場更新・クレーム処理 */
  startNextDay(): string[] {
    const s = this.state;
    s.day++;
    s.minute = OPEN_MINUTE - 60;
    s.phase = 'prep';
    s.today = emptyLedger(s.reputation);
    s.lotsToday = [];
    const notes = this.advanceMarket();
    // 探し物依頼の期限切れ
    for (const r of this.requests()) {
      if (r.status === 'open' && s.day > r.deadline) {
        r.status = 'expired';
        this.addRep(-1);
        notes.push(`「${itemDef(r.defId).name}」の依頼 (${r.customerName}) は期限切れになりました。評判 -1`);
      }
      if (r.status === 'coming') r.status = 'open';
      r.visitMinute = undefined;
    }
    s.requests = this.requests().filter((r) => r.status === 'open' || r.status === 'coming');
    // 偽物を売ったクレーム
    const keep: typeof s.pendingComplaints = [];
    for (const c of s.pendingComplaints) {
      if (this.rng.chance(0.55)) {
        this.addMoney(-c.price, 'クレーム返金');
        this.addRep(-7);
        notes.push(`⚠ 「${c.itemName}」が偽物だとクレームが入り ${yen(c.price)} を返金しました。評判 -7`);
        s.stats.profit -= c.price;
      } else if (s.day - c.day < 3) keep.push(c);
    }
    s.pendingComplaints = keep;
    events.emit('day:started', { day: s.day });
    return notes;
  }

  advanceMarket(): string[] {
    const mk = this.state.market;
    const notes: string[] = [];
    mk.news = mk.news.map((n) => ({ ...n, daysLeft: n.daysLeft - 1 })).filter((n) => n.daysLeft > 0);
    if (this.rng.chance(0.7)) {
      const nd = this.rng.pick(NEWS);
      if (!mk.news.some((n) => n.cat === nd.cat)) {
        mk.news.push({ text: nd.text, cat: nd.cat, effect: nd.effect, daysLeft: nd.days });
      }
    } else {
      mk.news.push({ text: this.rng.pick(QUIET_NEWS), cat: null, effect: 0, daysLeft: 1 });
    }
    for (const cat of Object.keys(CATEGORIES) as CategoryId[]) {
      const vol = CATEGORIES[cat].volatility;
      const history = mk.history[cat];
      const newsFx = mk.news.filter((n) => n.cat === cat).reduce((s, n) => s + n.effect, 0);
      const prev = mk.trend[cat];
      // 平均回帰 + ランダムウォーク + ニュース
      const target = 1 + newsFx;
      const next = clamp(prev + (target - prev) * 0.45 + this.rng.gauss(0, vol), 0.55, 1.8);
      mk.trend[cat] = Math.round(next * 1000) / 1000;
      history.push(mk.trend[cat]);
      if (history.length > 30) history.shift();
    }
    return notes;
  }

  // ───── 目標 ─────
  currentObjectives(n = 3): Objective[] {
    return OBJECTIVES.filter((o) => !this.state.objectivesDone.includes(o.id)).slice(0, n);
  }

  checkObjectives() {
    for (const o of this.currentObjectives(3)) {
      if (o.check(this)) {
        this.state.objectivesDone.push(o.id);
        if (o.reward) this.addMoney(o.reward, `目標達成: ${o.text}`);
        toast(`目標達成！ ${o.text}${o.reward ? ` (報酬 ${yen(o.reward)})` : ''}`, 'good', 'trophy-cup');
        events.emit('objective:done', { id: o.id });
      }
    }
  }
}
