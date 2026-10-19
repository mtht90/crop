import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound, haptic } from '../core/Audio';
import { Button, fmt, grad, iconButton, panel, popIn, txt } from '../core/UI';
import { MenuBackground } from '../game/Backdrop';
import { BossView } from '../game/BossView';
import { Effects } from '../game/Effects';
import { COLORS, bigTexture, loadCharacterArt, pieceTexture } from '../art/PieceArt';
import { CHARACTERS, CHAR_BY_ID, RARITY_INFO, charAtk } from '../data/characters';
import { bossForLevel, bossHp } from '../data/bosses';
import { GIMMICKS, gimmicksFor } from '../data/gimmicks';
import { BattleScene } from './BattleScene';
import { CharaScene } from './CharaScene';
import { GachaScene } from './GachaScene';
import { CoinCounter, openSettings, stars } from './common';

export class HomeScene extends Scene {
  private bg = new MenuBackground(0x6a4dff, 0xff7ab8);
  private col = new Container();
  private fx = new Effects();
  private hero = new Container();
  private heroSprite!: Sprite;
  private colorIdx = 0;
  private boss!: BossView;
  private t = 0;
  private floaters: { s: Sprite; vy: number; vr: number }[] = [];

  async preload(): Promise<void> {
    await loadCharacterArt([Save.data.selected], { strips: true });
  }

  enter(): void {
    this.view.addChild(this.bg, this.col);
    Sound.music('home', 0.8);
    const H = App.H;
    const top = App.safeTop + 16;
    const def = CHAR_BY_ID[Save.data.selected] ?? CHARACTERS[0];
    const owned = Save.data.owned[def.id] ?? { lv: 1, count: 1 };

    // floating background pieces
    for (let i = 0; i < 9; i++) {
      const s = new Sprite(pieceTexture(def, i % 5));
      s.anchor.set(0.5);
      s.scale.set(0.25 + Math.random() * 0.25);
      s.alpha = 0.22;
      s.position.set(Math.random() * 720, Math.random() * H);
      this.col.addChild(s);
      this.floaters.push({ s, vy: -(10 + Math.random() * 20), vr: (Math.random() - 0.5) * 0.4 });
    }

    // top bar
    const coins = new CoinCounter();
    coins.position.set(40, top + 40);
    const settings = iconButton('settings', 80, () => openSettings(this.col));
    settings.position.set(650, top + 38);
    const best = txt(`ベスト ${fmt(Save.data.best)}`, { size: 24, stroke: 0x2a1630, strokeWidth: 6 });
    best.position.set(430, top + 38);
    this.col.addChild(coins, settings, best);

    // boss card
    const bossLv = Save.data.bossLv;
    const bdef = bossForLevel(bossLv);
    const card = new Container();
    card.position.set(360, top + 200);
    const cg = new Graphics();
    cg.roundRect(-320, -90, 640, 190, 34).fill({ color: 0x000000, alpha: 0.25 });
    cg.roundRect(-320, -96, 640, 190, 34).fill(grad([[0, '#3a2470'], [1, '#22164a']]));
    cg.roundRect(-320, -96, 640, 190, 34).stroke({ width: 4, color: 0xffffff, alpha: 0.3 });
    card.addChild(cg);
    const bl = txt('いまのボス', { size: 22, color: 0xffd23f, anchor: [0, 0.5] });
    bl.position.set(-290, -62);
    const bn = txt(`Lv.${bossLv}  ${bdef.name}`, { size: 40, stroke: 0x2a1630, strokeWidth: 8, anchor: [0, 0.5] });
    bn.position.set(-290, -12);
    const bh = txt(`討伐ライン ${fmt(bossHp(bossLv))}`, { size: 26, color: 0xffb8d8, anchor: [0, 0.5] });
    bh.position.set(-290, 30);
    card.addChild(bl, bn, bh);
    const gl = gimmicksFor(bossLv);
    const gt = txt(gl.length ? `妨害：${gl.map((g) => GIMMICKS[g].name).join('・')}` : '妨害：なし', { size: 21, color: 0xd8c8ff, anchor: [0, 0.5] });
    gt.position.set(-290, 66);
    if (gt.width > 370) gt.scale.set(370 / gt.width);
    card.addChild(gt);
    const bossClip = new Container();
    const bm = new Graphics().roundRect(80, -96, 240, 190, 34).fill(0xffffff);
    this.boss = new BossView(bdef);
    this.boss.scale.set(0.5);
    this.boss.position.set(205, 90);
    bossClip.addChild(this.boss);
    bossClip.mask = bm;
    card.addChild(bm, bossClip);
    this.col.addChild(card);
    popIn(card, 0.05, 0.8);

    // hero
    const heroY = Math.min(top + 560, H * 0.5);
    this.hero.position.set(360, heroY);
    const pedestal = new Graphics();
    pedestal.ellipse(0, 150, 210, 46).fill({ color: 0x000000, alpha: 0.25 });
    pedestal.ellipse(0, 140, 200, 44).fill(grad([[0, '#ffffff'], [1, '#e2d4ff']]));
    pedestal.ellipse(0, 140, 200, 44).stroke({ width: 5, color: 0x8a6cff });
    this.hero.addChild(pedestal);
    this.heroSprite = new Sprite(bigTexture(def));
    this.heroSprite.anchor.set(0.5, 0.75);
    this.heroSprite.scale.set(1.1);
    this.heroSprite.y = 150;
    this.heroSprite.eventMode = 'static';
    this.heroSprite.cursor = 'pointer';
    this.heroSprite.on('pointertap', () => this.poke());
    this.hero.addChild(this.heroSprite);
    this.col.addChild(this.hero, this.fx.view);
    const rinfo = RARITY_INFO[def.rarity];
    const nameRow = new Container();
    nameRow.position.set(360, heroY + 225);
    const rb = new Graphics().roundRect(-40, -22, 80, 44, 22).fill(rinfo.color);
    rb.roundRect(-40, -22, 80, 44, 22).stroke({ width: 3, color: 0xffffff });
    rb.x = -170;
    const rt = txt(def.rarity, { size: 26, font: 'dela', stroke: 0x2a1630, strokeWidth: 5 });
    rt.x = -170;
    const nm = txt(`${def.name}  Lv.${owned.lv}`, { size: 40, stroke: 0x2a1630, strokeWidth: 9 });
    nm.x = 30;
    nameRow.addChild(rb, rt, nm);
    const st = stars(rinfo.stars, 30, 4);
    st.position.set(360, heroY + 275);
    const info = txt(`こうげき ${charAtk(def, owned.lv)}   必殺技「${def.skill.name}」`, { size: 24, stroke: 0x2a1630, strokeWidth: 6 });
    info.position.set(360, heroY + 318);
    this.col.addChild(nameRow, st, info);

    // buttons
    const by = H - App.safeBottom - 120;
    const battle = new Button({ w: 520, h: 130, label: 'バトル！', sub: `Lv.${bossLv} ${bdef.name}にちょうせん`, color: 'pink', size: 54, sound: 'ui_ok', onTap: () => this.startBattle() });
    battle.position.set(360, by - 150);
    battle.breathe();
    const chara = new Button({ w: 300, h: 100, label: 'キャラ', color: 'blue', size: 38, onTap: () => Scenes.go(() => new CharaScene()) });
    chara.position.set(195, by);
    const gacha = new Button({ w: 300, h: 100, label: 'ガチャ', color: 'yellow', size: 38, onTap: () => Scenes.go(() => new GachaScene()) });
    gacha.position.set(525, by);
    this.col.addChild(battle, chara, gacha);
    if (Save.data.coins >= 100) {
      const badge = new Container();
      const bgB = new Graphics().circle(0, 0, 22).fill(0xff3b5c);
      bgB.circle(0, 0, 22).stroke({ width: 4, color: 0xffffff });
      badge.addChild(bgB, txt('!', { size: 30, font: 'dela' }));
      badge.position.set(650, by - 40);
      this.col.addChild(badge);
      gsap.to(badge.scale, { x: 1.2, y: 1.2, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    [battle, chara, gacha].forEach((b, i) => popIn(b, 0.15 + i * 0.06, 0.6));
    if (!Save.data.tutorialDone) {
      const tip = panel(560, 90, { color: 0xffffff });
      const tt = txt('まずは「バトル！」をタップ！', { size: 30, color: 0x4a2f7a });
      const tipC = new Container();
      tipC.addChild(tip, tt);
      tipC.position.set(360, by - 270);
      this.col.addChild(tipC);
      gsap.to(tipC, { y: tipC.y - 10, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    if (Save.data.notice) this.showNotice(Save.data.notice);
  }

  private showNotice(msg: string): void {
    const ov = new Container();
    const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.6 });
    dim.eventMode = 'static';
    const box = new Container();
    box.position.set(360, App.H * 0.45);
    const t = txt(msg, { size: 30, color: 0x4a2f7a });
    box.addChild(panel(600, t.height + 220), t);
    t.y = -50;
    const ok = new Button({
      w: 280, h: 90, label: 'OK', color: 'pink', onTap: () => {
        Save.data.notice = undefined;
        Save.write();
        ov.destroy({ children: true });
      },
    });
    ok.y = t.height / 2 + 30;
    box.addChild(ok);
    ov.addChild(dim, box);
    this.col.addChild(ov);
    popIn(box, 0.3, 0.6);
  }

  private poke(): void {
    this.colorIdx = (this.colorIdx + 1) % 5;
    const def = CHAR_BY_ID[Save.data.selected] ?? CHARACTERS[0];
    this.heroSprite.texture = bigTexture(def, this.colorIdx);
    gsap.delayedCall(0.5, () => {
      this.heroSprite.texture = bigTexture(def);
    });
    gsap.killTweensOf(this.heroSprite.scale);
    this.heroSprite.scale.set(1.32, 0.88);
    gsap.to(this.heroSprite.scale, { x: 1.1, y: 1.1, duration: 0.7, ease: 'elastic.out(1.4,0.3)' });
    Sound.link(this.colorIdx * 2);
    haptic(8);
    this.fx.burst(this.hero.x, this.hero.y + 40, { count: 14, tex: 'star_06', tint: [COLORS[this.colorIdx].glow, 0xffffff], add: true, speed: [150, 400], size: [0.08, 0.16], gravity: 300 });
  }

  private startBattle(): void {
    Sound.stopMusic(0.4);
    Scenes.go(() => new BattleScene());
  }

  resize(): void {
    this.bg.layout(App.W, App.H);
    this.col.x = App.colX;
  }

  update(dt: number): void {
    this.t += dt;
    this.bg.update(dt);
    this.fx.update(dt);
    this.boss?.update(dt);
    if (this.heroSprite) {
      this.heroSprite.y = 150 - Math.abs(Math.sin(this.t * 2.6)) * 26;
      this.heroSprite.skew.x = Math.sin(this.t * 2.6) * 0.03;
    }
    for (const f of this.floaters) {
      f.s.y += f.vy * dt;
      f.s.rotation += f.vr * dt;
      if (f.s.y < -80) f.s.y = App.H + 80;
    }
  }
}
