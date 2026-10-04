import { CpuController } from './ai/cpu';
import { audio } from './audio/audio';
import { characters } from './characters';
import { TICK } from './combat/types';
import { PlayerInput } from './core/input';
import { Match } from './game/match';
import { GameView } from './render/view';
import { Hud } from './ui/hud';
import { Menus, type Selection, type Settings } from './ui/menus';

type Screen = 'title' | 'select' | 'match' | 'paused' | 'result';

const SETTINGS_KEY = 'star-arena-settings';

function loadSettings(): Settings {
  const d: Settings = { sensitivity: 1, volume: 0.7, shake: true };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return d;
  }
}

/** Top-level flow: title -> select -> match -> result, plus pause handling. */
export class App {
  private view: GameView;
  private input: PlayerInput;
  private hud: Hud;
  private menus: Menus;
  private screen: Screen = 'title';
  private match: Match | null = null;
  private acc = 0;
  private last = performance.now();
  private settings = loadSettings();
  private selection: Selection | null = null;
  private idleMatch: Match;

  constructor(root: HTMLElement) {
    this.view = new GameView(root);
    this.input = new PlayerInput(this.view.renderer.domElement);
    this.hud = new Hud(root);
    this.menus = new Menus(root);
    this.applySettings();

    // Attract mode behind the menus: two CPUs sparring.
    this.idleMatch = this.makeDemo();

    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.screen === 'match' && !this.match?.finished) this.pause();
    });
    this.view.renderer.domElement.addEventListener('click', () => {
      if (this.screen === 'match') this.input.requestLock();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.screen === 'paused') this.resume();
    });

    this.toTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  private makeDemo() {
    const m = new Match(characters.blaze, characters.star, 'normal');
    m.start();
    // Let both sides fight immediately and loop forever.
    m.player.setState('free');
    m.cpu.setState('free');
    m.phase = 'fight';
    this.demoAi = new CpuController(m.player, m.cpu, m.world, 'normal');
    this.view.bind(m.world, null);
    this.view.freeCamera = true;
    return m;
  }

  private demoAi: CpuController | null = null;

  private applySettings() {
    this.input.sensitivity = this.settings.sensitivity;
    audio.setVolume(this.settings.volume);
    this.view.shakeEnabled = this.settings.shake;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable */
    }
  }

  private toTitle() {
    this.screen = 'title';
    this.match = null;
    this.hud.show(false);
    this.hud.setBanner(null);
    this.input.releaseLock();
    this.input.enabled = false;
    this.idleMatch = this.makeDemo();
    audio.startMusic('menu');
    this.menus.title(() => this.toSelect());
  }

  private toSelect() {
    this.screen = 'select';
    this.hud.show(false);
    this.input.releaseLock();
    this.input.enabled = false;
    if (!this.match) audio.startMusic('menu');
    this.menus.select(
      (sel) => this.startMatch(sel),
      () => this.toTitle(),
    );
  }

  private startMatch(sel: Selection) {
    this.selection = sel;
    this.menus.hide();
    const m = new Match(characters[sel.player], characters[sel.cpu], sel.difficulty);
    this.match = m;
    this.view.freeCamera = false;
    this.view.bind(m.world, m.player);
    this.hud.setup(m);
    this.hud.show(true);
    m.onBanner = (b) => {
      this.hud.setBanner(b);
      if (b?.style === 'count') audio.play('beep');
      if (b?.style === 'fight') audio.play('go');
    };
    m.onRoundStart = () => {
      this.input.setView(0, 0);
      this.view.effects.clear();
    };
    m.start();
    this.screen = 'match';
    this.input.enabled = true;
    this.input.requestLock();
    audio.startMusic('battle');
  }

  private pause() {
    if (this.screen !== 'match') return;
    this.screen = 'paused';
    this.input.enabled = false;
    this.menus.pause(
      this.settings,
      () => this.resume(),
      () => this.toTitle(),
      () => this.applySettings(),
    );
  }

  private resume() {
    if (this.screen !== 'paused') return;
    this.menus.hide();
    this.screen = 'match';
    this.input.enabled = true;
    this.input.requestLock();
  }

  private showResult() {
    const m = this.match!;
    this.screen = 'result';
    this.input.enabled = false;
    this.input.releaseLock();
    this.hud.setBanner(null);
    const won = m.wins[0] > m.wins[1];
    this.menus.result(
      won,
      `${m.wins[0]} - ${m.wins[1]}`,
      () => this.startMatch(this.selection!),
      () => this.toSelect(),
      () => this.toTitle(),
    );
  }

  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    if (this.screen === 'match' || this.screen === 'result' || this.screen === 'paused') {
      const m = this.match!;
      if (this.screen !== 'paused') {
        this.acc += dt * m.timeScale;
        while (this.acc >= TICK) {
          this.acc -= TICK;
          m.step(this.input.sample());
          this.view.handleEvents(m.world.drainEvents());
          if (m.finished && this.screen === 'match') this.showResult();
        }
      }
      this.view.setOutcome(m.outcome);
      const look = { yaw: this.input.yaw, pitch: this.input.pitch };
      if (m.player.state === 'tumble' || m.player.state === 'knockdown' || m.player.state === 'ko') {
        look.yaw = m.player.yaw;
        look.pitch = m.player.pitch;
        this.input.setView(m.player.yaw, m.player.pitch);
      }
      this.view.render(dt * (this.screen === 'paused' ? 0 : m.timeScale), this.acc / TICK, look, this.input.consumeSway(), true);
      this.hud.update(dt, m, this.view.feedback, this.view.camera);
    } else {
      this.stepDemo(dt);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Background sparring match with an orbiting camera. */
  private stepDemo(dt: number) {
    const m = this.idleMatch;
    this.acc += dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      const a = this.demoAi!.think(true);
      const b = m.ai.think(true);
      m.world.step([a, b]);
      this.view.handleEvents(m.world.drainEvents(), true);
      for (const f of m.world.fighters) {
        if (!f.isAlive() || f.pos.y < -3) {
          f.reset((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, Math.random() * 6);
          f.setState('free');
        }
      }
    }
    const t = performance.now() / 1000;
    const c = this.view.camera;
    const mid = m.player.pos.clone().add(m.cpu.pos).multiplyScalar(0.5);
    c.position.set(mid.x + Math.cos(t * 0.15) * 9, 3.2, mid.z + Math.sin(t * 0.15) * 9);
    c.lookAt(mid.x, 1.2, mid.z);
    c.fov = 55;
    c.updateProjectionMatrix();
    this.view.render(dt, this.acc / TICK, { yaw: 0, pitch: 0 }, { x: 0, y: 0 }, false);
  }
}
