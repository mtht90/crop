// ゲーム全体のまとめ役：状態・時間の進行・保存・3D表示との同期
import { HOUR_CURVES, TIME } from './config/economy';
import { BUILDING_VISUALS } from './config/buildings';
import type { SfxKey } from './config/audio';
import { audio } from './audio';
import { advance, clock, newGame, type TickSummary } from './sim/engine';
import { isStoreIndustry, layout, playerCanBuyLot } from './sim/model';
import { catchUp, clearLocal, loadLocal, saveLocal } from './sim/save';
import type { GameState } from './sim/types';
import type { Result } from './sim/actions';
import { CityView, type LotView } from './render/cityView';

export interface OfflineReport extends TickSummary {
  awayHours: number;
  cappedHours: number;
}

export class Game {
  s: GameState;
  readonly view: CityView;
  selectedLot: number | null = null;
  offline: OfflineReport | null = null;
  /** 画面の更新（UI 側が差し込む） */
  onUpdate: () => void = () => {};
  onToast: (msg: string, kind?: 'good' | 'bad' | 'info') => void = () => {};
  onLog: (from: number) => void = () => {};
  onShowCity: () => void = () => {};
  private lastSave = 0;
  private lastLog = 0;

  constructor(host: HTMLElement) {
    const now = Date.now();
    const loaded = loadLocal();
    this.s = loaded ?? newGame(now);
    if (loaded) {
      const r = catchUp(this.s, now);
      if (r) this.offline = r;
    }
    this.lastLog = this.s.log.length;
    this.view = new CityView(host, layout);
    this.view.onLotTap = (lot) => this.selectLot(lot ? lot.id : null);
    audio.setVolumes(this.s.settings);
  }

  async start() {
    await this.view.buildStatic();
    await this.view.traffic.init();
    this.view.motion = this.s.settings.motion ?? true;
    await this.syncView();
    this.view.ready = true;
    this.view.focusLot(this.s.hqLot);
    window.setInterval(() => this.tick(), 1000);
    const saveNow = () => this.save();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveNow();
      else this.resume();
    });
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('beforeunload', saveNow);
  }

  /** 1秒ごと */
  tick() {
    if (document.hidden) return;
    const now = Date.now();
    const dtMs = now - this.s.realTime;
    if (dtMs > 15_000) {
      // しばらく止まっていた（スリープなど）→ 留守中の進行として扱う
      this.resume();
      return;
    }
    if (!this.s.gameOver) advance(this.s, (dtMs / 1000 / TIME.realSecondsPerDay) * this.s.debug.speed);
    this.s.realTime = now;
    this.afterAdvance();
    if (now - this.lastSave > TIME.autosaveSeconds * 1000) this.save();
  }

  private resume() {
    const r = catchUp(this.s, Date.now());
    if (r && r.awayHours > 0.05) this.offline = r;
    this.afterAdvance();
  }

  /** デバッグ用：時間を飛ばす */
  skip(days: number) {
    advance(this.s, days);
    this.afterAdvance();
  }

  private afterAdvance() {
    if (this.s.log.length < this.lastLog) this.lastLog = 0;
    if (this.s.log.length > this.lastLog) {
      this.onLog(this.lastLog);
      this.lastLog = this.s.log.length;
    }
    void this.syncView();
    const c = clock(this.s.day);
    this.view.setTimeOfDay(c.hour + c.minute / 60);
    this.updateTraffic(c.hour);
    this.emitCoins();
    audio.setNight(c.hour >= 19 || c.hour < 6);
    this.onUpdate();
  }

  /** 車の台数：時間帯と街のにぎわい（店の数）で決める */
  private updateTraffic(hour: number) {
    const curve = HOUR_CURVES.retail[hour] ?? 0.5;
    const shops = this.s.stores.length;
    this.view.traffic.target = Math.round((4 + Math.min(36, shops * 1.2)) * (0.25 + 0.75 * curve));
  }

  /** 売上が入ったら、店の上にコインを出す（3秒ごとにまとめて） */
  private coinAcc = new Map<number, number>();
  private lastRevenue = new Map<number, number>();
  private lastCoin = 0;
  onCoin: (lotId: number, amount: number) => void = () => {};
  private emitCoins() {
    for (const st of this.s.stores) {
      if (st.company !== 0) continue;
      const r = st.today.revenue;
      const prev = this.lastRevenue.get(st.id) ?? r;
      const d = r >= prev ? r - prev : r;
      this.lastRevenue.set(st.id, r);
      if (d > 0) this.coinAcc.set(st.lotId, (this.coinAcc.get(st.lotId) ?? 0) + d);
    }
    const now = Date.now();
    if (now - this.lastCoin < 3000) return;
    this.lastCoin = now;
    for (const [lot, amount] of this.coinAcc) if (amount >= 1) this.onCoin(lot, amount);
    this.coinAcc.clear();
  }

  setMotion(on: boolean) {
    this.s.settings.motion = on;
    this.view.motion = on;
    if (!on) this.view.traffic.clear();
    this.view.invalidate();
  }

  save() {
    this.s.realTime = Date.now();
    saveLocal(this.s);
    this.lastSave = Date.now();
  }

  /** 新しく始める */
  reset() {
    clearLocal();
    this.s = newGame(Date.now());
    this.lastLog = this.s.log.length;
    this.selectedLot = null;
    this.save();
    location.reload();
  }

  replaceState(s: GameState) {
    this.s = s;
    this.save();
    location.reload();
  }

  /** 操作を実行して、結果をお知らせする */
  act(fn: (s: GameState) => Result, sound: SfxKey = 'click'): Result {
    const r = fn(this.s);
    if (r.ok) {
      void audio.play(sound);
      if (r.msg) this.onToast(r.msg, 'good');
    } else {
      void audio.play('error');
      this.onToast(r.msg, 'bad');
    }
    this.afterAdvance();
    return r;
  }

  selectLot(id: number | null) {
    this.selectedLot = id;
    this.view.select(id);
    if (id !== null) void audio.play('tab');
    this.onUpdate();
  }

  /** 区画ごとの見た目を状態から作り、3Dに反映 */
  async syncView() {
    const s = this.s;
    const views: LotView[] = layout.lots.map((l) => {
      const owner = s.lotOwner[l.id];
      const buyable = owner === -1 && playerCanBuyLot(s, l.id);
      const st = s.stores.find((x) => x.lotId === l.id);
      const v: LotView = {
        ground: owner !== -1 || buyable ? 'open' : 'locked',
        mark: owner === 0 && !st && l.id !== s.hqLot ? 'owned' : buyable ? 'buyable' : 'none',
        building: null,
        badge: null,
      };
      if (st) {
        const comp = s.companies[st.company];
        const building = st.buildUntil !== null && st.upgradeTo === null;
        const list = BUILDING_VISUALS[st.industry];
        const vis = list[Math.min(st.level, list.length) - 1];
        if (!building && vis) v.building = { visual: vis, color: comp.color };
        v.badge = { icon: building || st.upgradeTo !== null ? 'build' : isStoreIndustry(st.industry) ? st.industry : st.industry, color: comp.color };
      } else if (l.id === s.hqLot) {
        v.badge = { icon: 'hq', color: s.companies[0].color };
      }
      return v;
    });
    await this.view.sync(views, s.hqLot);
  }
}
