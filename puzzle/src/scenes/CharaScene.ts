import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound, haptic } from '../core/Audio';
import { Button, grad, panel, popIn, txt } from '../core/UI';
import { MenuBackground } from '../game/Backdrop';
import { Effects } from '../game/Effects';
import { COLORS, bigTexture, loadCharacterArt, pieceTexture } from '../art/PieceArt';
import { CHARACTERS, MAX_LV, RARITY_INFO, charAtk, charCharge, copiesForLevel, type CharDef } from '../data/characters';
import { HomeScene } from './HomeScene';
import { stars } from './common';

export class CharaScene extends Scene {
  private bg = new MenuBackground(0x3a7bff, 0x7a4dff);
  private col = new Container();
  private fx = new Effects();
  private cards: { c: Container; def: CharDef; sel: Graphics }[] = [];
  private detail: Container | null = null;

  enter(): void {
    this.view.addChild(this.bg, this.col);
    Sound.music('home', 0.8);
    const top = App.safeTop + 16;
    const title = txt('キャラ', { size: 56, font: 'dela', stroke: 0x2a1630, strokeWidth: 12 });
    title.position.set(360, top + 46);
    const back = new Button({ w: 150, h: 76, label: 'もどる', color: 'grey', size: 28, sound: 'ui_back', onTap: () => Scenes.go(() => new HomeScene()) });
    back.position.set(100, top + 46);
    const ownedN = CHARACTERS.filter((c) => Save.data.owned[c.id]).length;
    const cnt = txt(`${ownedN} / ${CHARACTERS.length}`, { size: 28, stroke: 0x2a1630, strokeWidth: 6 });
    cnt.position.set(620, top + 46);
    this.col.addChild(title, back, cnt);

    const cols = 3;
    const cw = 214;
    const ch = 232;
    const gx = (720 - cols * cw) / (cols + 1);
    const y0 = top + 120;
    const avail = App.H - y0 - App.safeBottom - 20;
    const scale = Math.min(1, avail / (Math.ceil(CHARACTERS.length / cols) * (ch + 14)));
    const grid = new Container();
    grid.position.set(360, y0);
    grid.scale.set(scale);
    this.col.addChild(grid, this.fx.view);
    CHARACTERS.forEach((def, i) => {
      const c = new Container();
      const x = -360 + gx + (i % cols) * (cw + gx) + cw / 2;
      const y = Math.floor(i / cols) * (ch + 14) + ch / 2;
      c.position.set(x, y);
      const owned = Save.data.owned[def.id];
      const r = RARITY_INFO[def.rarity];
      const g = new Graphics();
      g.roundRect(-cw / 2, -ch / 2 + 6, cw, ch, 26).fill({ color: 0x000000, alpha: 0.25 });
      g.roundRect(-cw / 2, -ch / 2, cw, ch, 26).fill(owned ? grad([[0, '#ffffff'], [1, '#e8deff']]) : 0x4a3a7a);
      g.roundRect(-cw / 2, -ch / 2, cw, ch, 26).stroke({ width: 6, color: owned ? r.color : 0x6a5a9a });
      c.addChild(g);
      const sp = new Sprite(bigTexture(def));
      sp.anchor.set(0.5, 0.55);
      sp.scale.set(150 / Math.max(1, sp.texture.width));
      sp.y = -10;
      if (!owned) {
        sp.tint = 0x1a0f30;
        sp.alpha = 0.9;
      }
      c.addChild(sp);
      const rb = new Graphics().roundRect(-cw / 2 + 8, -ch / 2 + 8, 62, 32, 16).fill(owned ? r.color : 0x6a5a9a);
      const rt = txt(def.rarity, { size: 20, font: 'dela', stroke: 0x2a1630, strokeWidth: 4 });
      rt.position.set(-cw / 2 + 39, -ch / 2 + 24);
      c.addChild(rb, rt);
      const nm = txt(owned ? def.name : '？？？', { size: 26, color: owned ? 0x4a2f7a : 0xb8a8e8 });
      nm.y = ch / 2 - 48;
      c.addChild(nm);
      if (owned) {
        const lv = txt(`Lv.${owned.lv}`, { size: 22, color: 0xffffff, stroke: 0x4a2f7a, strokeWidth: 5 });
        lv.y = ch / 2 - 18;
        c.addChild(lv);
      }
      const sel = new Graphics();
      sel.circle(cw / 2 - 26, -ch / 2 + 26, 22).fill(0xff4f8f);
      sel.circle(cw / 2 - 26, -ch / 2 + 26, 22).stroke({ width: 4, color: 0xffffff });
      sel.moveTo(cw / 2 - 36, -ch / 2 + 26).lineTo(cw / 2 - 28, -ch / 2 + 34).lineTo(cw / 2 - 14, -ch / 2 + 18).stroke({ width: 6, color: 0xffffff, cap: 'round', join: 'round' });
      sel.visible = Save.data.selected === def.id;
      c.addChild(sel);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointertap', () => {
        Sound.play('ui_tap', { vol: 0.7 });
        haptic(5);
        gsap.fromTo(c.scale, { x: 0.9, y: 0.9 }, { x: 1, y: 1, duration: 0.4, ease: 'elastic.out(1.2,0.4)' });
        if (owned)
          loadCharacterArt([def.id], { strips: true })
            .then(() => !this.view.destroyed && this.openDetail(def))
            .catch(() => !this.view.destroyed && this.toast('読み込みに失敗しました。通信を確認してね'));
        else this.toast('ガチャで手に入れよう！');
      });
      grid.addChild(c);
      this.cards.push({ c, def, sel });
      popIn(c, 0.03 * i, 0.6);
    });
  }

  private toast(s: string): void {
    const t = txt(s, { size: 30, stroke: 0x2a1630, strokeWidth: 8, color: 0xfff27a });
    t.position.set(360, App.H - App.safeBottom - 80);
    this.col.addChild(t);
    popIn(t);
    gsap.to(t, { alpha: 0, delay: 1.2, duration: 0.3, onComplete: () => t.destroy() });
  }

  private openDetail(def: CharDef): void {
    this.detail?.destroy({ children: true });
    const owned = Save.data.owned[def.id];
    const ov = new Container();
    const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.6 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => close());
    ov.addChild(dim);
    const box = new Container();
    box.position.set(360, App.H / 2);
    const h = 1100;
    const s = Math.min(1, (App.H - 60) / h);
    box.scale.set(s);
    box.addChild(panel(640, h, { color: 0xfdf7ff }));
    box.eventMode = 'static';
    const r = RARITY_INFO[def.rarity];
    const glow = new Graphics().circle(0, -260, 170).fill({ color: r.color, alpha: 0.25 });
    box.addChild(glow);
    const big = new Sprite(bigTexture(def, 0));
    big.anchor.set(0.5, 0.6);
    big.scale.set(1.0);
    big.y = -250;
    box.addChild(big);
    gsap.to(big, { y: -270, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    // five color variants row
    for (let i = 0; i < 5; i++) {
      const sp = new Sprite(pieceTexture(def, i));
      sp.anchor.set(0.5, 0.6);
      sp.scale.set(0.42);
      sp.position.set(-220 + i * 110, -60);
      sp.eventMode = 'static';
      sp.cursor = 'pointer';
      sp.on('pointertap', () => {
        big.texture = bigTexture(def, i);
        gsap.delayedCall(0.6, () => (big.texture = bigTexture(def)));
        Sound.link(i * 2);
        gsap.fromTo(sp.scale, { x: 0.55, y: 0.35 }, { x: 0.42, y: 0.42, duration: 0.5, ease: 'elastic.out(1.4,0.3)' });
      });
      box.addChild(sp);
    }
    const name = txt(def.name, { size: 52, font: 'dela', color: 0x4a2f7a });
    name.y = 30;
    const st = stars(r.stars, 32, 4);
    st.y = 86;
    box.addChild(name, st);
    const lv = owned?.lv ?? 1;
    const nextNeed = lv < MAX_LV ? copiesForLevel(lv + 1) - (owned?.count ?? 0) : 0;
    const rows: [string, string][] = [
      ['レベル', lv >= MAX_LV ? `Lv.${lv} (MAX)` : `Lv.${lv}（あと${nextNeed}体でUP）`],
      ['こうげき', `${charAtk(def, lv)}`],
      ['必殺技', def.skill.name],
      ['', def.skill.desc],
      ['ゲージ', `${charCharge(def, lv)} 個で発動`],
    ];
    rows.forEach(([k, v], i) => {
      const y = 150 + i * 52;
      if (k) {
        const kt = txt(k, { size: 26, color: 0x8a6cff, anchor: [0, 0.5] });
        kt.position.set(-270, y);
        box.addChild(kt);
      }
      const vt = txt(v, { size: k ? 28 : 24, color: 0x4a2f7a, anchor: [0, 0.5], weight: k ? '800' : '500' });
      vt.position.set(-110, y);
      box.addChild(vt);
    });
    const desc = txt(def.catch, { size: 22, color: 0x7a6a9a, weight: '500', wrap: 540 });
    desc.y = 425;
    box.addChild(desc);
    const selected = Save.data.selected === def.id;
    const btn = new Button({
      w: 420, h: 100, label: selected ? 'えらんでいます' : 'このキャラでたたかう', color: selected ? 'grey' : 'pink', size: 32, sound: 'ui_ok', onTap: () => {
        if (Save.data.selected === def.id) return close();
        Save.data.selected = def.id;
        Save.write();
        for (const c of this.cards) c.sel.visible = c.def.id === def.id;
        Sound.play('powerUp2', { vol: 0.6 });
        Sound.sparkle();
        this.fx.burst(360, App.H / 2 - 250 * s, { count: 30, tex: 'star_06', tint: COLORS.map((c) => c.glow), add: true, speed: [200, 600], size: [0.08, 0.2] });
        close();
      },
    });
    btn.y = h / 2 - 75;
    box.addChild(btn);
    const x = new Button({ w: 70, h: 70, label: '×', color: 'grey', size: 40, sound: 'ui_back', onTap: () => close() });
    x.position.set(280, -h / 2 + 50);
    box.addChild(x);
    ov.addChild(box);
    this.col.addChild(ov);
    this.detail = ov;
    popIn(box, 0, 0.7);
    Sound.play('ui_open', { vol: 0.5 });
    const close = () => {
      if (this.detail !== ov) return;
      this.detail = null;
      gsap.to(ov, { alpha: 0, duration: 0.15, onComplete: () => ov.destroy({ children: true }) });
    };
  }

  resize(): void {
    this.bg.layout(App.W, App.H);
    this.col.x = App.colX;
  }

  update(dt: number): void {
    this.bg.update(dt);
    this.fx.update(dt);
  }
}
