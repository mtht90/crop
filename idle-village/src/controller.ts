// ゲーム全体のつなぎ役:シミュレーションの進行、保存、留守中の進行、AI(村の心)、UI
import { VillageMind } from './ai/mind';
import { DT } from './sim/config';
import { SAVE_VERSION, Sim } from './sim/sim';
import type { GameState, ResKind, SimEvent, UpgradeKey } from './sim/types';
import { AudioMgr } from './render/audio';
import type { WorldScene } from './render/WorldScene';
import { UI } from './ui/ui';

const SAVE_KEY = 'kurashi-save-v2';
const OFFLINE_SIM_MAX = 600;
const OFFLINE_MAX = 8 * 3600;

export interface WelcomeInfo {
  away: number;
  gained: Record<ResKind, number>;
  points: number;
  entries: string[];
}

export class Controller {
  sim: Sim;
  speed = 1;
  ui: UI;
  audio = new AudioMgr();
  mind = new VillageMind();
  scene: WorldScene | null = null;
  private acc = 0;
  private saveTimer = 0;
  private uiTimer = 0;
  welcome: WelcomeInfo | null = null;
  /** 公開ページなど、外部のAPIに接続できない環境 */
  readonly sandboxed = typeof window !== 'undefined' && window.self !== window.top && /claude/.test(document.referrer + location.hostname);

  constructor() {
    const loaded = Controller.load();
    this.sim = new Sim(loaded ?? Sim.newGame());
    this.sim.aiEnabled = this.mind.ready;
    if (loaded) this.catchUp();
    this.ui = new UI(this);
    this.mind.onChange = () => this.ui.updateMindStatus();
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
      else this.resumeFromHidden();
    });
  }

  static load(): GameState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as GameState;
      return s.version === SAVE_VERSION ? s : null;
    } catch {
      return null;
    }
  }

  save() {
    this.sim.s.savedAt = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.sim.s));
    } catch {
      /* 保存できない環境 */
    }
  }

  /** 留守中の進行(AIは呼ばず、本能と習慣で進める) */
  private catchUp() {
    const away = Math.min((Date.now() - this.sim.s.savedAt) / 1000, OFFLINE_MAX);
    if (away < 60) return;
    const s = this.sim.s;
    const before = { ...s.res };
    const p0 = s.points;
    const c0 = s.chronicle.length;
    const simSec = Math.min(away, OFFLINE_SIM_MAX);
    const ai = this.sim.aiEnabled;
    this.sim.aiEnabled = false;
    this.sim.fastForward(simSec);
    this.sim.aiEnabled = ai;
    for (const v of s.villagers) v.thinking = false;
    const rest = away - simSec;
    if (rest > 0) {
      const k = (rest / simSec) * 0.5;
      for (const r of ['wood', 'meat', 'gold'] as ResKind[]) s.res[r] += Math.max(0, s.res[r] - before[r]) * k;
      const dp = Math.max(0, s.points - p0) * k;
      s.points += dp;
      s.totalPoints += dp;
    }
    const gained = { wood: s.res.wood - before.wood, meat: s.res.meat - before.meat, gold: s.res.gold - before.gold };
    this.welcome = { away, gained, points: s.points - p0, entries: s.chronicle.slice(c0).map((c) => `${c.label} ${c.text}`) };
  }

  private resumeFromHidden() {
    const gap = (Date.now() - this.sim.s.savedAt) / 1000;
    if (gap > 5) {
      const ai = this.sim.aiEnabled;
      this.sim.aiEnabled = false;
      this.sim.fastForward(Math.min(gap, 300));
      this.sim.aiEnabled = ai;
    }
  }

  onSceneReady(scene: WorldScene) {
    this.scene = scene;
    this.audio.attach(scene);
    this.ui.ready();
    if (this.welcome) this.ui.showWelcome(this.welcome);
    else if (!this.mind.settings.apiKey) this.ui.openModal('setup');
  }

  tick(deltaMs: number) {
    const dt = Math.min(deltaMs, 250) / 1000;
    this.sim.aiEnabled = this.mind.ready;
    this.sim.timeScale = this.speed;
    this.acc += dt * this.speed;
    // 速いときは刻みを粗くして軽くする
    const stepDt = this.speed >= 100 ? 0.5 : this.speed >= 30 ? 0.25 : DT;
    let steps = 0;
    while (this.acc >= stepDt && steps < 160) {
      this.sim.step(stepDt);
      this.acc -= stepDt;
      steps++;
    }
    if (steps >= 160) this.acc = 0;
    this.mind.tick(this.sim);
    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      this.save();
    }
    this.uiTimer += dt;
    if (this.uiTimer > 0.25) {
      this.uiTimer = 0;
      this.ui.update();
    }
    this.audio.setMood(this.sim.raidActive ? 'raid' : this.sim.isNight ? 'night' : 'day');
  }

  onSimEvent(e: SimEvent) {
    this.ui.onSimEvent(e);
  }

  setSpeed(n: number) {
    this.speed = n;
    this.ui.update();
  }

  buyUpgrade(k: UpgradeKey) {
    if (this.sim.buyUpgrade(k)) {
      this.audio.play('upgrade', 0.6);
      this.save();
      return true;
    }
    return false;
  }

  private replaceSim(state: GameState) {
    this.sim = new Sim(state);
    this.sim.aiEnabled = this.mind.ready;
    this.save();
    this.scene?.resetWorld();
    this.ui.refreshAll();
  }

  depart() {
    this.replaceSim(this.sim.depart());
    this.audio.play('stage', 0.6);
  }

  resetAll() {
    this.replaceSim(Sim.newGame());
  }
}

export function formatDuration(sec: number) {
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}分`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m ? `${h}時間${m}分` : `${h}時間`;
}
