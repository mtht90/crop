// ゲーム全体のつなぎ役:シミュレーションの進行、保存、留守中の進行、AI、UI
import { AIManager } from './ai/ai';
import { DT, RES_NAMES } from './sim/config';
import { SAVE_VERSION, Sim } from './sim/sim';
import type { GameState, ResKind, SimEvent, UpgradeKey } from './sim/types';
import { AudioMgr } from './render/audio';
import type { WorldScene } from './render/WorldScene';
import { UI } from './ui/ui';

const SAVE_KEY = 'kurashi-save-v1';
const OFFLINE_SIM_MAX = 600; // 留守中に実際にシミュレーションする最大秒数
const OFFLINE_MAX = 8 * 3600; // 留守中の進行の上限

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
  ai = new AIManager();
  scene: WorldScene | null = null;
  private acc = 0;
  private saveTimer = 0;
  private uiTimer = 0;
  welcome: WelcomeInfo | null = null;

  constructor() {
    const loaded = Controller.load();
    this.sim = new Sim(loaded ?? Sim.newGame());
    if (loaded) this.catchUp();
    this.ui = new UI(this);
    this.ai.onStatus = () => this.ui.updateAIStatus();
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
      if (s.version !== SAVE_VERSION) return null;
      return s;
    } catch {
      return null;
    }
  }

  save() {
    this.sim.s.savedAt = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.sim.s));
    } catch {
      /* 保存できない環境(プライベートモードなど) */
    }
  }

  /** 留守中の進行 */
  private catchUp() {
    const away = Math.min((Date.now() - this.sim.s.savedAt) / 1000, OFFLINE_MAX);
    if (away < 60) return;
    const s = this.sim.s;
    const before = { ...s.res };
    const p0 = s.points;
    const c0 = s.chronicle.length;
    const simSec = Math.min(away, OFFLINE_SIM_MAX);
    this.sim.fastForward(simSec);
    // 残りの時間は、早送り中の稼ぎから半分の効率で見積もる
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
    this.sim.addChronicle(`村人たちは、天が見守らぬあいだも働き続けた(${formatDuration(away)})。`, 'misc');
  }

  private resumeFromHidden() {
    // タブを隠していたあいだの分も進める(短い時間だけ実時間でシミュレーション)
    const gap = (Date.now() - this.sim.s.savedAt) / 1000;
    if (gap > 5) {
      this.sim.fastForward(Math.min(gap, 300));
    }
  }

  onSceneReady(scene: WorldScene) {
    this.scene = scene;
    this.audio.attach(scene);
    this.ui.ready();
    if (this.welcome) this.ui.showWelcome(this.welcome);
  }

  tick(deltaMs: number) {
    const dt = Math.min(deltaMs, 250) / 1000;
    this.acc += dt * this.speed;
    let steps = 0;
    while (this.acc >= DT && steps < 60) {
      this.sim.step(DT);
      this.acc -= DT;
      steps++;
    }
    if (steps >= 60) this.acc = 0;
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
    // BGM
    this.audio.setMood(this.sim.raidActive ? 'raid' : this.sim.isNight ? 'night' : 'day');
  }

  onSimEvent(e: SimEvent) {
    if (e.type === 'season') void this.runAICouncil();
    if (e.type === 'stage') this.audio.play('stage', 0.6);
    this.ui.onSimEvent(e);
  }

  async runAICouncil() {
    if (!this.ai.enabled) return;
    const sim = this.sim;
    const r = await this.ai.council(sim);
    if (!r || sim !== this.sim) return;
    sim.applyPolicy(r.policy);
    if (r.chronicle) sim.addChronicle(r.chronicle, 'ai');
    this.ui.update();
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

  depart() {
    const next = this.sim.depart();
    this.sim = new Sim(next);
    this.save();
    this.scene?.resetWorld();
    this.ui.refreshAll();
    this.audio.play('stage', 0.6);
  }

  resetAll() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* 無視 */
    }
    this.sim = new Sim(Sim.newGame());
    this.save();
    this.scene?.resetWorld();
    this.ui.refreshAll();
  }
}

export function formatDuration(sec: number) {
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}分`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m ? `${h}時間${m}分` : `${h}時間`;
}

export const resLabel = (k: ResKind) => RES_NAMES[k];
