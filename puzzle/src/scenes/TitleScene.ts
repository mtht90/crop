import { Container, Graphics, Text } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { grad, txt } from '../core/UI';
import { MenuBackground } from '../game/Backdrop';
import { Board } from '../game/Board';
import { CHARACTERS, CHAR_BY_ID } from '../data/characters';
import { HomeScene } from './HomeScene';

/** Title: an auto-playing board under a bouncing logo. */
export class TitleScene extends Scene {
  private bg = new MenuBackground(0x5a3dff, 0xff6fb5);
  private col = new Container();
  private board!: Board;
  private letters: Text[] = [];
  private t = 0;
  private autoT = 1.5;
  private started = false;

  enter(): void {
    this.view.addChild(this.bg, this.col);
    const owned = CHARACTERS.filter((c) => Save.data.owned[c.id]);
    const def = CHAR_BY_ID[Save.data.selected] ?? owned[0];
    const bh = Math.max(560, App.H * 0.55);
    this.board = new Board(def, 680, bh, { onResolve: () => 0, onPiecePop: () => {} });
    this.board.view.position.set(20, App.H - bh - 20 - App.safeBottom);
    const frame = new Graphics();
    frame.roundRect(8, this.board.view.y - 16, 704, bh + 28, 40).fill({ color: 0x2a1630, alpha: 0.55 });
    this.col.addChild(frame, this.board.view);
    this.board.fillInitial();

    // logo
    const logo = new Container();
    logo.position.set(360, App.safeTop + Math.min(250, App.H * 0.2));
    const word = 'ぷにっと';
    const fill = grad([[0, '#ffffff'], [0.5, '#fff3a0'], [1, '#ffc71f']]);
    [...word].forEach((ch, i) => {
      const t = txt(ch, { size: 120, font: 'dela', color: 0xffffff, stroke: 0x2a1630, strokeWidth: 18, shadow: true });
      t.style.fill = fill;
      t.position.set((i - (word.length - 1) / 2) * 118, 0);
      logo.addChild(t);
      this.letters.push(t);
    });
    const sub = txt('☆バトル☆', { size: 84, font: 'dela', color: 0xff4f8f, stroke: 0xffffff, strokeWidth: 14 });
    sub.y = 120;
    logo.addChild(sub);
    const en = txt('PUNITTO BATTLE', { size: 26, font: 'dela', color: 0xffffff, stroke: 0x2a1630, strokeWidth: 6, letterSpacing: 6 });
    en.y = 190;
    logo.addChild(en);
    this.col.addChild(logo);
    logo.scale.set(0);
    gsap.to(logo.scale, { x: 1, y: 1, duration: 0.9, ease: 'elastic.out(1,0.5)', delay: 0.2 });

    const tap = txt('TAP TO START', { size: 44, font: 'dela', color: 0xffffff, stroke: 0x2a1630, strokeWidth: 10 });
    tap.position.set(360, logo.y + 300);
    gsap.to(tap, { alpha: 0.25, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.col.addChild(tap);
    const credit = txt('Music: Juhani Junkala  /  Art & SFX: Kenney.nl  (CC0)', { size: 18, weight: '500', color: 0xffffff });
    credit.alpha = 0.7;
    credit.position.set(360, App.H - App.safeBottom - 8);
    credit.anchor.set(0.5, 1);
    this.col.addChild(credit);

    this.view.eventMode = 'static';
    this.view.on('pointertap', () => this.start());
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    Sound.unlock();
    Sound.play('ui_ok', { vol: 0.8 });
    Sound.chord(0);
    Scenes.go(() => new HomeScene());
  }

  resize(): void {
    this.bg.layout(App.W, App.H);
    this.col.x = App.colX;
  }

  update(dt: number): void {
    this.t += dt;
    this.bg.update(dt);
    this.board.update(dt);
    this.letters.forEach((l, i) => {
      const p = this.t * 3 - i * 0.5;
      l.y = -Math.max(0, Math.sin(p)) * 26;
      l.scale.set(1 + Math.max(0, -Math.sin(p)) * 0.08, 1 - Math.max(0, -Math.sin(p)) * 0.08);
    });
    // the demo board plays itself
    this.autoT -= dt;
    if (this.autoT <= 0) {
      this.autoT = 1.1 + Math.random() * 0.8;
      const g = this.board.bestGroup();
      if (g.length >= 3) this.board.popWhere((p) => g.includes(p), g[0].x, g[0].y, 'chain');
    }
  }

  exit(): void {
    this.board.destroy();
  }
}
