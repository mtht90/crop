import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound, haptic } from '../core/Audio';
import { Button, coinIcon, fmt, grad, iconButton, panel, popIn, txt } from '../core/UI';
import { MenuBackground } from '../game/Backdrop';
import { BossView } from '../game/BossView';
import { Effects } from '../game/Effects';
import { COLORS, bigTexture, loadCharacterArt, pieceTexture } from '../art/PieceArt';
import { CHARACTERS, CHAR_BY_ID, RARITY_INFO, charAtk, growthOf } from '../data/characters';
import { bossForLevel, bossHp } from '../data/bosses';
import { GIMMICKS, gimmicksFor } from '../data/gimmicks';
import { BattleScene } from './BattleScene';
import { CharaScene } from './CharaScene';
import { GachaScene } from './GachaScene';
import { MissionScene } from './MissionScene';
import { DressScene } from './DressScene';
import { claimableCount } from '../data/missions';
import { ITEMS, MAX_LIVES, fmtTime, lives, nextLifeIn, spendLife, type ItemId } from '../data/play';
import { tex } from '../core/Loader';
import { CoinCounter, loginPopup, openSettings, rewardPopup, stars } from './common';
import { claimLogin } from '../data/login';
import { claimWeekly } from '../core/Ranking';
import { RankingScene } from './RankingScene';
import { COST_SINGLE } from '../data/gacha';

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
    this.coinCounter = coins;
    coins.position.set(40, top + 40);
    const settings = iconButton('settings', 80, () => openSettings(this.col));
    settings.position.set(650, top + 38);
    const best = txt(`ベスト ${fmt(Save.data.best)}`, { size: 24, stroke: 0x2a1630, strokeWidth: 6 });
    best.position.set(430, top + 38);
    this.col.addChild(coins, settings, best);
    // lives (one per round, refill every 10 minutes)
    const lifeBg = new Graphics().roundRect(-20, -26, 330, 52, 26).fill({ color: 0x2a1630, alpha: 0.85 });
    lifeBg.position.set(40, top + 98);
    this.col.addChild(lifeBg);
    for (let i = 0; i < MAX_LIVES; i++) {
      const h = new Sprite(tex('ui:heart'));
      h.anchor.set(0.5);
      h.scale.set(40 / Math.max(1, h.texture.width));
      h.position.set(44 + i * 40, top + 98);
      this.hearts.push(h);
      this.col.addChild(h);
    }
    this.lifeT.position.set(250, top + 98);
    this.col.addChild(this.lifeT);
    this.tickLives();

    // boss card (◀ ▶ picks any boss reached so far)
    const card = new Container();
    card.position.set(360, top + 228);
    const cg = new Graphics();
    cg.roundRect(-320, -90, 640, 190, 34).fill({ color: 0x000000, alpha: 0.25 });
    cg.roundRect(-320, -96, 640, 190, 34).fill(grad([[0, '#3a2470'], [1, '#22164a']]));
    cg.roundRect(-320, -96, 640, 190, 34).stroke({ width: 4, color: 0xffffff, alpha: 0.3 });
    card.addChild(cg, this.cardBody);
    this.col.addChild(card);
    popIn(card, 0.05, 0.8);
    const max = Save.data.bossLv;
    if (max > 1) {
      for (const dir of [-1, 1]) {
        const arrow = new Button({ w: 64, h: 64, label: dir < 0 ? '◀' : '▶', color: 'blue', size: 28, onTap: () => this.pickBoss(dir) });
        arrow.position.set(dir * 318, 0);
        card.addChild(arrow);
      }
    }

    // hero
    // keep the hero (and its info line) clear of the item row above the battle button
    const heroY = Math.min(top + 560, H * 0.5, H - App.safeBottom - 120 - 670);
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
    const nm = txt(`${def.name}  Lv.${owned.lv}${owned.plus ? `+${owned.plus}` : ''}`, { size: 40, stroke: 0x2a1630, strokeWidth: 9 });
    nm.x = 30;
    nameRow.addChild(rb, rt, nm);
    const st = stars(rinfo.stars, 30, 4);
    st.position.set(360, heroY + 275);
    const info = txt(`こうげき ${charAtk(def, growthOf(owned))}   必殺技「${def.skill.name}」`, { size: 24, stroke: 0x2a1630, strokeWidth: 6 });
    info.position.set(360, heroY + 318);
    this.col.addChild(nameRow, st, info);

    // buttons
    const by = H - App.safeBottom - 120;
    const battle = new Button({ w: 520, h: 130, label: 'バトル！', sub: ' ', color: 'pink', size: 54, sound: 'ui_ok', onTap: () => this.startBattle() });
    this.battleBtn = battle;
    battle.position.set(360, by - 150);
    battle.breathe();
    const chara = new Button({ w: 300, h: 100, label: 'キャラ', color: 'blue', size: 38, onTap: () => Scenes.go(() => new CharaScene()) });
    chara.position.set(195, by);
    const gacha = new Button({ w: 300, h: 100, label: 'ガチャ', color: 'yellow', size: 38, onTap: () => Scenes.go(() => new GachaScene()) });
    gacha.position.set(525, by);
    this.col.addChild(battle, chara, gacha);
    this.buildItems(by - 265);
    // missions / cosmetics on either side of the hero
    const mission = new Button({ w: 170, h: 84, label: 'ミッション', color: 'orange', size: 26, onTap: () => Scenes.go(() => new MissionScene()) });
    mission.position.set(100, heroY - 40);
    const dress = new Button({ w: 170, h: 84, label: 'きせかえ', color: 'green', size: 28, onTap: () => Scenes.go(() => new DressScene()) });
    dress.position.set(620, heroY - 40);
    const ranking = new Button({ w: 170, h: 84, label: 'ランキング', color: 'purple', size: 24, onTap: () => Scenes.go(() => new RankingScene()) });
    ranking.position.set(100, heroY + 60);
    this.col.addChild(mission, dress, ranking);
    popIn(ranking, 0.3, 0.6);
    popIn(mission, 0.2, 0.6);
    popIn(dress, 0.25, 0.6);
    const ready = claimableCount();
    if (ready > 0) {
      const badge = new Container();
      const bg = new Graphics().circle(0, 0, 22).fill(0xff3355).stroke({ width: 4, color: 0xffffff });
      const bt = txt(String(ready), { size: 24, font: 'dela' });
      badge.addChild(bg, bt);
      badge.position.set(175, heroY - 78);
      this.col.addChild(badge);
      gsap.to(badge.scale, { x: 1.2, y: 1.2, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    this.fillBossCard(Save.fightLv());
    // the gacha badge only shows when a pull is affordable
    if (Save.data.coins >= COST_SINGLE || Save.data.tickets > 0) {
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
    const notice = () => Save.data.notice && this.showNotice(Save.data.notice);
    const login = Save.data.tutorialDone ? claimLogin() : null;
    if (login) loginPopup(this.col, login.day, login.got, () => {
      this.coinCounter?.refresh();
      notice();
    });
    else notice();
    // last week's ranking reward (async; shows once per week)
    void claimWeekly().then((res) => {
      if (!res || this.view.destroyed) return;
      this.coinCounter?.refresh();
      rewardPopup(this.col, 'しゅうかんランキング', [`せんしゅうは ${res.rank}位 / ${res.total}人！`, ...res.got]);
    });
  }

  private cardBody = new Container();
  private battleBtn?: Button;

  private pickBoss(dir: number): void {
    const max = Save.data.bossLv;
    const lv = ((Save.fightLv() - 1 + dir + max) % max) + 1;
    Save.data.fightLv = lv === max ? 0 : lv;
    Save.write();
    this.fillBossCard(lv);
    Sound.play('ui_tap');
  }

  private fillBossCard(lv: number): void {
    const c = this.cardBody;
    for (const ch of c.removeChildren()) ch.destroy({ children: true });
    const bdef = bossForLevel(lv);
    const current = lv === Save.data.bossLv;
    const bl = txt(current ? 'いまのボス' : 'さいせん（クリアずみ）', { size: 22, color: current ? 0xffd23f : 0x9be7ff, anchor: [0, 0.5] });
    bl.position.set(-270, -62);
    const bn = txt(`Lv.${lv}  ${bdef.name}`, { size: 40, stroke: 0x2a1630, strokeWidth: 8, anchor: [0, 0.5] });
    bn.position.set(-270, -12);
    const bh = txt(`討伐ライン ${fmt(bossHp(lv))}`, { size: 26, color: 0xffb8d8, anchor: [0, 0.5] });
    bh.position.set(-270, 30);
    const gl = gimmicksFor(lv);
    const gt = txt(gl.length ? `妨害：${gl.map((g) => GIMMICKS[g].name).join('・')}` : '妨害：なし', { size: 21, color: 0xd8c8ff, anchor: [0, 0.5] });
    gt.position.set(-270, 66);
    if (gt.width > 350) gt.scale.set(350 / gt.width);
    const bossClip = new Container();
    const bm = new Graphics().roundRect(80, -96, 240, 190, 34).fill(0xffffff);
    this.boss = new BossView(bdef);
    this.boss.scale.set(0.5);
    this.boss.position.set(205, 90);
    bossClip.addChild(this.boss);
    bossClip.mask = bm;
    c.addChild(bm, bossClip, bl, bn, bh, gt);
    this.battleBtn?.setSub(`Lv.${lv} ${bdef.name}に${current ? 'ちょうせん' : 'さいせん'}`);
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
    if (!spendLife()) return this.noLives();
    const items = [...Save.data.pendingItems];
    Save.data.pendingItems = [];
    Save.write();
    Sound.stopMusic(0.4);
    Scenes.go(() => new BattleScene(items));
  }

  private noLives(): void {
    Sound.play('ui_error');
    rewardPopup(this.col, 'ライフがたりない', [`つぎのライフまで ${fmtTime(nextLifeIn())}`, '10分で1つかいふくするよ']);
  }

  /** Item buttons above the battle button: tapping one pays for it right away (tap again to refund). */
  private buildItems(y: number): void {
    ITEMS.forEach((it, i) => {
      const c = new Container();
      c.position.set(105 + i * 170, y);
      const bg = new Graphics();
      const check = txt('✓', { size: 34, font: 'dela', color: 0xff6a00, stroke: 0xffffff, strokeWidth: 6 });
      check.position.set(56, -40);
      const draw = () => {
        const on = Save.data.pendingItems.includes(it.id);
        bg.clear();
        bg.roundRect(-75, -58, 150, 116, 22).fill({ color: 0x000000, alpha: 0.25 });
        bg.roundRect(-75, -62, 150, 116, 22).fill(on ? grad([[0, '#fff6c8'], [1, '#ffc94d']]) : 0xfff4dc);
        bg.roundRect(-75, -62, 150, 116, 22).stroke({ width: on ? 6 : 4, color: on ? 0xff9a00 : 0x8a5a2a });
        check.visible = on;
        c.y = y - (on ? 4 : 0);
      };
      const icon = this.itemIcon(it.id);
      icon.y = -26;
      const nm = txt(it.name, { size: 20, color: 0x4a2f7a });
      nm.y = 10;
      if (nm.width > 136) nm.scale.set(136 / nm.width);
      const pr = new Container();
      const ci = coinIcon(10);
      ci.x = -34;
      const pt = txt(fmt(it.price), { size: 20, color: 0x8a4f00, anchor: [0, 0.5] });
      pt.x = -20;
      pr.addChild(ci, pt);
      pr.y = 36;
      c.addChild(bg, icon, nm, pr, check);
      draw();
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointertap', () => {
        const d = Save.data;
        const on = d.pendingItems.includes(it.id);
        if (on) {
          d.pendingItems = d.pendingItems.filter((x) => x !== it.id);
          d.coins += it.price;
          Sound.play('ui_back');
        } else {
          if (d.coins < it.price) {
            Sound.play('ui_error');
            gsap.fromTo(c, { x: c.x - 8 }, { x: c.x, duration: 0.3, ease: 'elastic.out(1.5,0.3)' });
            return;
          }
          d.coins -= it.price;
          d.pendingItems.push(it.id);
          Sound.play('coins', { vol: 0.6 });
        }
        Save.write();
        this.coinCounter?.refresh();
        draw();
        gsap.fromTo(c.scale, { x: 1.12, y: 0.9 }, { x: 1, y: 1, duration: 0.4, ease: 'elastic.out(1.4,0.4)' });
      });
      this.col.addChild(c);
      popIn(c, 0.2 + i * 0.04, 0.6);
    });
  }

  private itemIcon(id: ItemId): Container {
    const c = new Container();
    const sp = (alias: string, h: number) => {
      const s = new Sprite(tex(alias));
      s.anchor.set(0.5);
      s.scale.set(h / Math.max(1, s.texture.height));
      c.addChild(s);
      return s;
    };
    if (id === 'score') sp('ui:star', 50);
    else if (id === 'coin') sp('ui:coins', 50);
    else if (id === 'time') {
      sp('jungle:clock', 46);
      const t = txt('+5', { size: 22, font: 'dela', color: 0xffffff, stroke: 0x2a1630, strokeWidth: 5 });
      t.position.set(24, 10);
      c.addChild(t);
    } else {
      // five colors become four
      const g = new Graphics();
      [0xff4d6a, 0x36a2ff, 0x3fd35c, 0xffc71f].forEach((col, i) => g.circle(-27 + i * 18, 0, 9).fill(col).stroke({ width: 2, color: 0x2a1630 }));
      c.addChild(g);
    }
    return c;
  }

  resize(): void {
    this.bg.layout(App.W, App.H);
    this.col.x = App.colX;
  }

  private coinCounter?: CoinCounter;
  private lifeT = txt('', { size: 24, color: 0xffffff, anchor: [0, 0.5] });
  private hearts: Sprite[] = [];
  private lifeClock = 0;

  private tickLives(): void {
    const n = lives();
    const wait = nextLifeIn();
    this.hearts.forEach((h, i) => (h.texture = tex(i < n ? 'ui:heart' : 'ui:heart_empty')));
    this.lifeT.text = wait ? fmtTime(wait) : 'MAX';
  }

  update(dt: number): void {
    this.lifeClock -= dt;
    if (this.lifeClock <= 0) {
      this.lifeClock = 1;
      this.tickLives();
    }
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
