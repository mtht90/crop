import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { Button, txt } from '../core/UI';
import { MenuBackground } from '../game/Backdrop';
import { bigTexture, loadCharacterArt } from '../art/PieceArt';
import { CHAR_BY_ID, CHARACTERS, growthOf } from '../data/characters';
import { bossHp } from '../data/bosses';
import { expectedScore } from '../data/rank';
import { fmtTime, nextLifeIn, spendLife } from '../data/play';
import { CpuLink, Versus, findMatch, type VsLink } from '../core/Versus';
import { BattleScene } from './BattleScene';
import { HomeScene } from './HomeScene';
import { urAura } from '../game/Aura';
import { menuBar, rewardPopup } from './common';

/** Versus lobby: looks for an online opponent, falls back to a CPU, then starts the match. */
export class VersusScene extends Scene {
  private bg = new MenuBackground(0xff4f8f, 0x7a4dff, 3);
  private col = new Container();
  private status = txt('', { size: 30, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 8, align: 'center' });
  private cancelled = false;

  async preload(): Promise<void> {
    await loadCharacterArt([Save.data.selected], { strips: true });
  }

  enter(): void {
    this.view.addChild(this.bg, this.col);
    Sound.music('home', 0.8);
    const top = App.safeTop + 16;
    menuBar(this.col, 120);
    const title = txt('たいせん', { size: 56, font: 'dela', stroke: 0x2a1630, strokeWidth: 12 });
    title.position.set(360, top + 46);
    const back = new Button({ w: 150, h: 76, label: 'やめる', color: 'grey', size: 28, sound: 'ui_back', onTap: () => this.leave() });
    back.position.set(100, top + 46);
    this.col.addChild(title, back);
    const def = CHAR_BY_ID[Save.data.selected] ?? CHARACTERS[0];
    if (def.ur) {
      const aura = urAura(200);
      aura.position.set(360, App.H * 0.42 - 20);
      this.col.addChild(aura);
    }
    const me = new Sprite(bigTexture(def));
    me.anchor.set(0.5, 0.6);
    me.scale.set(1.1);
    me.position.set(360, App.H * 0.42);
    const ring = new Graphics().circle(0, 0, 190).stroke({ width: 10, color: 0xffffff, alpha: 0.5 });
    ring.position.copyFrom(me.position);
    gsap.to(ring.scale, { x: 1.15, y: 1.15, duration: 0.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.status.position.set(360, App.H * 0.66);
    const rec = Save.data.vs;
    const rules = txt(`60秒でスコア勝負！\n8チェイン以上・必殺技・フィーバーで\nあいてに妨害をおくれるよ\n\n通算 ${rec.win}勝 ${rec.lose}敗`, { size: 24, color: 0xfff27a, stroke: 0x2a1630, strokeWidth: 6, align: 'center', lineHeight: 34 });
    rules.position.set(360, App.H * 0.8);
    this.col.addChild(ring, me, this.status, rules);
    void this.run();
  }

  private leave(): void {
    this.cancelled = true;
    Scenes.go(() => new HomeScene());
  }

  private async run(): Promise<void> {
    if (!spendLife()) {
      rewardPopup(this.col, 'ライフがたりない', [`つぎまで ${fmtTime(nextLifeIn())}`], () => this.leave());
      return;
    }
    let link: VsLink | null = null;
    if (Versus.online) link = await findMatch((s) => (this.status.text = s), 15000, () => this.cancelled);
    if (this.cancelled) return;
    if (!link) {
      // nobody around: a CPU about as strong as you
      const def = CHAR_BY_ID[Save.data.selected] ?? CHARACTERS[0];
      link = new CpuLink(expectedScore(def, growthOf(Save.data.owned[def.id]), bossHp(Save.fightLv()), []));
      this.status.text = 'CPUと対戦！';
    }
    await loadCharacterArt([link.opponent.charId], { portraits: true });
    Sound.play('jStart', { vol: 0.7 });
    await new Promise((r) => setTimeout(r, 1200));
    if (this.cancelled) return link.leave();
    const l = link;
    Scenes.go(() => new BattleScene([], l));
  }

  resize(): void {
    this.bg.layout(App.W, App.H);
    this.col.x = App.colX;
  }

  update(dt: number): void {
    this.bg.update(dt);
  }
}
