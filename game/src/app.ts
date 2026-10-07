import { CpuController } from './ai/cpu';
import { audio } from './audio/audio';
import { characters } from './characters';
import { TICK } from './combat/types';
import { EYE_HEIGHT } from './config';
import { wrapAngle } from './core/math';
import { PlayerInput } from './core/input';
import { Match } from './game/match';
import { GameView } from './render/view';
import { Hud } from './ui/hud';
import { TouchControls } from './ui/touch';
import { Menus, type Selection, type Settings } from './ui/menus';
import { emptyIntent } from './combat/types';
import { BotTransport } from './net/botPeer';
import { LockstepSession } from './net/lockstep';
import { findOpponent, levelForRating, loadRecord, randomStage, ratingDelta, saveRecord } from './net/online';
import type { PlayerProfile } from './net/protocol';

type Screen = 'title' | 'select' | 'lobby' | 'match' | 'paused' | 'result';

/** Frames of input delay for online lockstep (4 = 67 ms). */
const NET_DELAY = 4;

interface OnlineGame {
  session: LockstepSession;
  bot: BotTransport;
  me: PlayerProfile;
  foe: PlayerProfile;
  stage: string;
}

const SETTINGS_KEY = 'star-arena-settings';

function loadSettings(): Settings {
  const d: Settings = { sensitivity: 1, volume: 0.7, shake: true, aimAssist: true };
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
  private mode: 'cpu' | 'online' = 'cpu';
  private record = loadRecord();
  private online: OnlineGame | null = null;
  private lobbyTimer = 0;

  constructor(root: HTMLElement) {
    this.view = new GameView(root);
    this.input = new PlayerInput(this.view.renderer.domElement);
    this.hud = new Hud(root);
    this.menus = new Menus(root);
    this.touch = new TouchControls(root, this.input, () => this.pause());
    this.applySettings();

    // Attract mode behind the menus: two CPUs sparring.
    this.idleMatch = this.makeDemo();

    document.addEventListener('pointerlockchange', () => {
      if (!this.touch.active && !this.input.locked && this.screen === 'match' && !this.match?.finished) this.pause();
    });
    this.view.renderer.domElement.addEventListener('click', () => {
      if (this.screen === 'match') this.lock();
    });
    // A real mouse click on the canvas switches back from touch controls.
    this.view.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && this.touch.active && !window.matchMedia?.('(pointer: coarse)').matches) {
        this.touch.setActive(false);
        this.touch.show(false);
      }
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
  private touch: TouchControls;

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

  /** Pointer lock only for mouse play. */
  private lock() {
    if (!this.touch.active) this.input.requestLock();
  }

  private toTitle() {
    this.touch.show(false);
    this.screen = 'title';
    this.match = null;
    this.hud.show(false);
    this.hud.setBanner(null);
    this.input.releaseLock();
    this.input.enabled = false;
    this.idleMatch = this.makeDemo();
    audio.startMusic('menu');
    this.endOnline();
    this.menus.title(
      () => {
        this.mode = 'cpu';
        this.toSelect();
      },
      () => {
        this.mode = 'online';
        this.toSelect();
      },
    );
  }

  private toSelect() {
    this.touch.show(false);
    this.screen = 'select';
    this.hud.show(false);
    this.input.releaseLock();
    this.input.enabled = false;
    if (!this.match) audio.startMusic('menu');
    this.endOnline();
    if (this.mode === 'online') {
      this.menus.select(
        (sel) => {
          this.selection = sel;
          saveRecord(this.record);
          this.findMatch();
        },
        () => this.toTitle(),
        undefined,
        this.record,
      );
      return;
    }
    this.menus.select(
      (sel) => this.startMatch(sel),
      () => this.toTitle(),
      (id) => this.view.setStage(id),
    );
  }

  // --- Online (lockstep against a remote peer; the bot stands in for now) ----

  /** Matchmaking: wait a little, then pair with an opponent near our rating. */
  private findMatch() {
    this.screen = 'lobby';
    this.endOnline();
    const stopClock = this.menus.matchmaking(this.record, () => {
      window.clearTimeout(this.lobbyTimer);
      this.toSelect();
    });
    this.lobbyTimer = window.setTimeout(() => {
      stopClock();
      const me: PlayerProfile = { name: this.record.name, rating: this.record.rating, character: this.selection!.player, region: '日本(東京)' };
      const foe = findOpponent(this.record.rating);
      const stage = randomStage();
      this.view.setStage(stage);
      const latency = 18 + Math.random() * 40;
      audio.play('go');
      this.menus.versus(me, foe, latency * 2);
      this.lobbyTimer = window.setTimeout(() => this.startOnline(me, foe, stage, latency), 2800);
    }, 1500 + Math.random() * 3500);
  }

  private startOnline(me: PlayerProfile, foe: PlayerProfile, stage: string, latency: number) {
    if (this.online) this.online.session.close();
    // The host picks the seed and stage; both sides build the same Match from it.
    const seed = Math.floor(Math.random() * 2 ** 31);
    const m = new Match(characters[me.character], characters[foe.character], levelForRating(foe.rating), seed);
    // The "remote" opponent: CPU inputs streamed through the network protocol.
    const bot = new BotTransport(foe, () => m.ai.think(m.phase === 'fight'), NET_DELAY, latency);
    const session = new LockstepSession(bot, 0, NET_DELAY);
    session.onOther = (msg) => {
      // Start the rematch outside the current tick loop.
      if (msg.t === 'rematch' && this.screen === 'result' && this.online) {
        const o = this.online;
        window.setTimeout(() => this.startOnline(o.me, o.foe, o.stage, latency), 0);
      }
    };
    bot.send({ t: 'hello', profile: me });
    this.online = { session, bot, me, foe, stage };
    this.selection = { ...this.selection!, cpu: foe.character, stage };
    this.beginMatch(m, stage);
    this.hud.setOnline(foe.name);
  }

  private endOnline() {
    window.clearTimeout(this.lobbyTimer);
    if (this.online) this.online.session.close();
    this.online = null;
    this.hud.setOnline(null);
  }

  private startMatch(sel: Selection) {
    this.selection = sel;
    this.endOnline();
    this.beginMatch(new Match(characters[sel.player], characters[sel.cpu], sel.difficulty), sel.stage);
  }

  private beginMatch(m: Match, stage: string) {
    this.menus.hide();
    this.match = m;
    this.view.freeCamera = false;
    this.view.setStage(stage);
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
    this.lock();
    this.touch.show(true);
    audio.startMusic('battle');
  }

  private pause() {
    if (this.screen !== 'match') return;
    this.screen = 'paused';
    this.input.enabled = false;
    this.touch.show(false);
    this.menus.pause(
      this.settings,
      () => this.resume(),
      () => {
        // Leaving an online match counts as a loss.
        if (this.online) {
          this.record.rating = Math.max(100, this.record.rating + ratingDelta(this.record.rating, this.online.foe.rating, false));
          this.record.losses++;
          saveRecord(this.record);
        }
        this.toTitle();
      },
      () => this.applySettings(),
    );
  }

  private resume() {
    if (this.screen !== 'paused') return;
    this.menus.hide();
    this.screen = 'match';
    this.input.enabled = true;
    this.lock();
    this.touch.show(true);
  }

  private showResult() {
    const m = this.match!;
    this.screen = 'result';
    this.touch.show(false);
    this.input.enabled = false;
    this.input.releaseLock();
    this.hud.setBanner(null);
    const won = m.wins[0] > m.wins[1];
    if (this.online) {
      const o = this.online;
      const before = this.record.rating;
      this.record.rating = Math.max(100, before + ratingDelta(before, o.foe.rating, won));
      if (won) this.record.wins++;
      else this.record.losses++;
      saveRecord(this.record);
      this.menus.onlineResult(
        won,
        `${m.wins[0]} - ${m.wins[1]}`,
        before,
        this.record.rating,
        () => o.session.send({ t: 'rematch' }),
        () => this.findMatch(),
        () => this.toSelect(),
        () => this.toTitle(),
      );
      return;
    }
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
      const net = this.online?.session;
      // Online play can't pause: the match keeps running (with no input) behind the menu.
      if (this.screen !== 'paused' || net) {
        this.acc += dt * m.timeScale * (net ? 1 : this.view.cinematicTimeScale());
        while (this.acc >= TICK) {
          if (net) {
            net.tick();
            let mine = emptyIntent();
            if (this.screen === 'match') {
              this.aimAssist(m);
              mine = this.input.sample();
            }
            net.pushLocal(mine);
            if (!net.ready()) {
              // Waiting for the opponent's input for this frame.
              net.stall++;
              this.acc = Math.min(this.acc, TICK * 2);
              break;
            }
            const [a, b] = net.advance();
            m.step(a, b);
          } else {
            this.aimAssist(m);
            m.step(this.input.sample());
          }
          this.acc -= TICK;
          if (m.player.yawOverride !== null) {
            // The simulation turned the player (counter teleport): follow with the camera.
            this.input.setView(m.player.yawOverride, m.player.pitch);
            m.player.yawOverride = null;
          }
          const events = m.world.drainEvents();
          for (const e of events) {
            if (e.type === 'action' && e.kind === 'ult') {
              // Super flash: slow motion, a third-person shot of the user and a cut-in.
              this.view.startCinematic('ult', e.fighter);
              this.hud.cutIn(e.fighter.def, e.fighter.def.actions[e.id].name ?? '', e.fighter !== m.player);
            } else if (e.type === 'hit' && e.ko) this.view.startCinematic('ko', e.target);
            if (e.type === 'justGuard') {
              if (e.target === m.player) this.hud.toast('JUST GUARD!');
              else if (e.attacker === m.player) this.hud.toast(e.pushed ? 'はじかれた！' : 'JUST GUARD', '#ffb0a0');
            } else if (e.type === 'counter') {
              if (e.target === m.player) this.hud.toast('居合カウンター！', '#dfe8ff');
              else if (e.attacker === m.player) this.hud.toast('カウンターされた！', '#ffb0a0');
            } else if (e.type === 'canopyBreak') {
              if (e.fighter === m.player) this.hud.toast('傘が壊れた！ しばらく開けない', '#ffb0a0');
              else if (e.attacker === m.player) this.hud.toast('傘を壊した！');
            } else if (e.type === 'parry' && e.reflected && e.target === m.player) this.hud.toast('ジャスト！ はね返した！', '#c9b8ff');
          }
          this.view.handleEvents(events);
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
      const paused = this.screen === 'paused';
      this.view.setRealDt(paused ? 0 : dt);
      this.view.render(dt * (paused ? 0 : m.timeScale * this.view.cinematicTimeScale()), this.acc / TICK, look, this.input.consumeSway(), true);
      this.hud.update(dt, m, this.view.feedback, this.view.camera);
      if (net) this.hud.setNetStatus(net.rtt, net.stall > 12);
      this.touch.update(m.player);
    } else {
      this.stepDemo(dt);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * Touch only (mouse aiming gets no help at all): thumbs aim coarsely, so the
   * view is pulled hard toward the opponent whenever they are roughly in view,
   * nearly locking on while attacking. A deliberate look drag still wins.
   */
  private aimAssist(m: Match) {
    if (!this.settings.aimAssist || !this.touch.active || m.phase !== 'fight') return;
    const p = m.player;
    const c = m.cpu;
    if (!(p.state === 'free' || p.state === 'action' || p.state === 'dash') || !c.isAlive()) return;
    const dx = c.pos.x - p.pos.x;
    const dz = c.pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 32 || dist < 0.3) return;
    const yawTo = Math.atan2(-dx, -dz);
    const pitchTo = Math.atan2(c.pos.y + 1.0 - (p.pos.y + EYE_HEIGHT), dist);
    const dy = wrapAngle(yawTo - this.input.yaw);
    const dp = pitchTo - this.input.pitch;
    const angle = Math.hypot(dy, dp);
    const cone = 1.2;
    if (angle > cone) return;
    const attacking = p.state === 'action' || this.input.touch.attack;
    // Exponential approach (fraction of the error closed per second), softer near the cone edge.
    let k = (attacking ? 16 : 7) * (1 - 0.5 * (angle / cone));
    if (this.touch.looking) k *= 0.3;
    const f = Math.min(1, k * TICK);
    this.input.yaw += dy * f;
    this.input.pitch += dp * f * 0.8;
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
