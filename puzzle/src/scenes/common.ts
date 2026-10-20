import { Container, Graphics } from 'pixi.js';
import { battleTrackLabel, nextBattleTrack } from '../data/music';
import gsap from 'gsap';
import { App } from '../core/App';
import { Save, exportSave, importSave } from '../core/Save';
import { LOGIN_REWARDS } from '../data/login';
import { Sound } from '../core/Audio';
import { Button, coinIcon, fmt, grad, panel, popIn, txt } from '../core/UI';
import { jungle, num, installBitmapFonts } from '../game/Hud';
import { ITEMS, ITEM_BY_ID, MAX_LIVES, fmtTime, lives, nextLifeIn, spendLife, type ItemId } from '../data/play';

/** Coins counter shown at the top of menu screens. */
export class CoinCounter extends Container {
  private digits;
  private shown: number;
  constructor() {
    super();
    installBitmapFonts();
    const bg = new Graphics();
    bg.roundRect(-20, -26, 220, 52, 26).fill({ color: 0x000000, alpha: 0.3 });
    bg.roundRect(-20, -30, 220, 52, 26).fill({ color: 0x2a1630, alpha: 0.85 });
    const c = coinIcon(22);
    c.position.set(8, -4);
    this.shown = Save.data.coins;
    this.digits = num(fmt(this.shown), 32);
    this.digits.anchor.set(1, 0.5);
    this.digits.position.set(186, -4);
    this.addChild(bg, c, this.digits);
  }
  refresh(animate = true): void {
    const target = Save.data.coins;
    if (!animate) {
      this.shown = target;
      this.digits.text = fmt(target);
      return;
    }
    const o = { v: this.shown };
    gsap.to(o, {
      v: target,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        this.digits.text = fmt(o.v);
      },
    });
    this.shown = target;
    gsap.fromTo(this.digits.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
  }
}

/** Settings dialog (sound, haptics, accessibility). */
export function openSettings(parent: Container, onClose?: () => void): void {
  const ov = new Container();
  const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.7 });
  dim.eventMode = 'static';
  ov.addChild(dim);
  const box = new Container();
  box.position.set(360, App.H / 2);
  const p = panel(620, 980, { color: 0xfdf7ff });
  box.addChild(p);
  const title = txt('せってい', { size: 48, font: 'dela', color: 0x4a2f7a });
  title.y = -430;
  box.addChild(title);
  const s = Save.data.settings;
  const rows: [string, () => boolean, () => void][] = [
    ['BGM', () => s.bgm > 0, () => (s.bgm = s.bgm > 0 ? 0 : 0.7)],
    ['効果音', () => s.sfx > 0, () => (s.sfx = s.sfx > 0 ? 0 : 0.9)],
    ['振動', () => s.haptics, () => (s.haptics = !s.haptics)],
    ['色覚サポート', () => s.colorAssist, () => (s.colorAssist = !s.colorAssist)],
    ['必殺技 自動発動', () => s.autoSkill, () => (s.autoSkill = !s.autoSkill)],
  ];
  rows.forEach(([label, get, toggle], i) => {
    const y = -330 + i * 96;
    const l = txt(label, { size: 30, color: 0x4a2f7a, anchor: [0, 0.5] });
    l.position.set(-250, y);
    box.addChild(l);
    let btn: Button;
    const make = () => {
      btn?.destroy({ children: true });
      btn = new Button({
        w: 150, h: 70, label: get() ? 'ON' : 'OFF', color: get() ? 'green' : 'grey', size: 30, onTap: () => {
          toggle();
          Save.write();
          Sound.applyVolumes();
          make();
        },
      });
      btn.position.set(185, y);
      box.addChild(btn);
    };
    make();
  });
  // battle BGM: tap to cycle (おまかせ = random each round); plays a preview
  const prevMusic = Sound.currentMusic();
  const ml = txt('バトルBGM', { size: 30, color: 0x4a2f7a, anchor: [0, 0.5] });
  ml.position.set(-250, 150);
  box.addChild(ml);
  let mb: Button;
  const makeMusic = () => {
    mb?.destroy({ children: true });
    mb = new Button({
      w: 250, h: 70, label: battleTrackLabel(), color: 'blue', size: 26, onTap: () => {
        nextBattleTrack();
        Save.write();
        if (Save.data.settings.battleBgm !== 'auto') Sound.music(Save.data.settings.battleBgm, 0.3);
        makeMusic();
      },
    });
    mb.position.set(135, 150);
    box.addChild(mb);
  };
  makeMusic();
  const credit = txt('キャラ・ボス: KayKit (CC0)  背景・UI: CraftPix\n効果音: 効果音ラボ  音楽: 魔王魂 (CC BY 4.0)\nガチャ筐体: gumball machine / myles_683 (CC BY 4.0)\nフォント: めもかっち / やっちゃん (SIL OFL 1.1)', { size: 20, weight: '500', color: 0x7a6a9a, lineHeight: 30 });
  credit.y = 322;
  box.addChild(credit);
  const backup = new Button({ w: 320, h: 64, label: 'データのひきつぎ', color: 'green', size: 24, onTap: () => openBackup() });
  backup.y = 228;
  box.addChild(backup);
  const close = new Button({
    w: 300, h: 90, label: 'とじる', color: 'pink', sound: 'ui_back', onTap: () => {
      ov.destroy({ children: true });
      if (prevMusic) Sound.music(prevMusic, 0.4);
      onClose?.();
    },
  });
  close.y = 415;
  box.addChild(close);
  ov.addChild(box);
  parent.addChild(ov);
  popIn(box);
  Sound.play('ui_open', { vol: 0.6 });
}


/** Rarity stars row. */
export function stars(n: number, size = 28, total = n): Container {
  const c = new Container();
  for (let i = 0; i < total; i++) {
    const g = new Graphics();
    starPath(g, size / 2);
    g.fill(i < n ? 0xffd23f : 0x6a5a8a);
    g.stroke({ width: 3, color: 0x6a3a00 });
    g.x = (i - (total - 1) / 2) * size * 1.05;
    c.addChild(g);
  }
  return c;
}

export function starPath(g: Graphics, r: number): Graphics {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return g.poly(pts);
}

/** Vertical drag-to-scroll area; taps on children still work unless the finger moved. */
export class ScrollBox extends Container {
  readonly content = new Container();
  private maskG = new Graphics();
  private hit = new Graphics();
  private y0 = 0;
  private start = 0;
  private dragging = false;
  private moved = false;
  private vel = 0;
  private lastY = 0;
  /** Height of the scrolled content (bounds are clipped by the mask, so callers set it). */
  contentH = 0;
  constructor(public readonly w: number, public readonly h: number) {
    super();
    this.maskG.rect(-w / 2, 0, w, h).fill(0xffffff);
    this.hit.rect(-w / 2, 0, w, h).fill({ color: 0xffffff, alpha: 0.001 });
    this.addChild(this.hit, this.content, this.maskG);
    this.content.mask = this.maskG;
    this.eventMode = 'static';
    this.on('pointerdown', (e) => {
      this.dragging = true;
      this.moved = false;
      this.start = e.global.y;
      this.lastY = e.global.y;
      this.y0 = this.content.y;
      this.vel = 0;
    });
    this.on('globalpointermove', (e) => {
      if (!this.dragging) return;
      const dy = (e.global.y - this.start) / (this.worldTransform.d || 1);
      if (Math.abs(dy) > 12 && !this.moved) {
        this.moved = true;
        this.content.interactiveChildren = false;
      }
      if (this.moved) {
        this.vel = (e.global.y - this.lastY) / (this.worldTransform.d || 1);
        this.lastY = e.global.y;
        this.content.y = this.clamp(this.y0 + dy);
      }
    });
    const end = () => {
      this.dragging = false;
      this.content.interactiveChildren = true;
    };
    this.on('pointerup', end);
    this.on('pointerupoutside', end);
  }
  private clamp(y: number): number {
    const min = Math.min(0, this.h - this.contentH - 30);
    return Math.max(min, Math.min(0, y));
  }
  /** Glide after a flick (call every frame). */
  update(): void {
    if (this.dragging || Math.abs(this.vel) < 0.3) return;
    this.vel *= 0.92;
    this.content.y = this.clamp(this.content.y + this.vel);
  }
}

/** Shows what was received from a mission or bonus. */
export function rewardPopup(parent: Container, title: string, lines: string[], onClose?: () => void): void {
  const ov = new Container();
  const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.6 });
  dim.eventMode = 'static';
  const box = new Container();
  box.position.set(360, App.H * 0.45);
  const body = txt(lines.join('\n'), { size: 32, color: 0x4a2f7a, lineHeight: 46 });
  const h = body.height + 260;
  const t = txt(title, { size: 44, font: 'dela', color: 0xff4f8f, stroke: 0xffffff, strokeWidth: 8 });
  t.y = -h / 2 + 60;
  body.y = -h / 2 + 120 + body.height / 2;
  const ok = new Button({
    w: 260, h: 90, label: 'OK', color: 'pink', onTap: () => {
      ov.destroy({ children: true });
      onClose?.();
    },
  });
  ok.y = h / 2 - 70;
  box.addChild(panel(560, h), t, body, ok);
  ov.addChild(dim, box);
  parent.addChild(ov);
  popIn(box, 0, 0.5);
  Sound.play('powerUp2', { vol: 0.7 });
  Sound.sparkle();
}

/** Before a round: lives, boost items to buy, and the start button. */
export function openPrep(parent: Container, onStart: (items: ItemId[]) => void): void {
  const ov = new Container();
  const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.7 });
  dim.eventMode = 'static';
  const box = new Container();
  box.position.set(360, App.H * 0.5);
  const h = 860;
  box.addChild(panel(620, h, { color: 0xfdf7ff }));
  const title = txt('アイテムをえらぼう', { size: 40, font: 'dela', color: 0x4a2f7a });
  title.y = -h / 2 + 60;
  box.addChild(title);
  // lives row
  const lifeT = txt('', { size: 28, color: 0xff3d6a, anchor: [0.5, 0.5] });
  lifeT.y = -h / 2 + 120;
  box.addChild(lifeT);
  const tick = () => {
    if (lifeT.destroyed) return;
    const n = lives();
    const wait = nextLifeIn();
    lifeT.text = `ライフ ${'♥'.repeat(n)}${'♡'.repeat(MAX_LIVES - n)}${wait ? `  つぎまで ${fmtTime(wait)}` : ''}`;
  };
  tick();
  const timer = setInterval(tick, 1000);
  const chosen = new Set<ItemId>();
  const totalT = txt('', { size: 28, color: 0x4a2f7a });
  totalT.y = h / 2 - 220;
  const coinsT = txt('', { size: 22, color: 0x8a6cff });
  coinsT.y = h / 2 - 180;
  const total = () => [...chosen].reduce((a, id) => a + ITEM_BY_ID[id].price, 0);
  const refresh = () => {
    totalT.text = `ごうけい ${fmt(total())} コイン`;
    coinsT.text = `もっているコイン ${fmt(Save.data.coins)}`;
    totalT.style.fill = total() > Save.data.coins ? 0xd81b60 : 0x4a2f7a;
  };
  ITEMS.forEach((it, i) => {
    const row = new Container();
    row.y = -h / 2 + 210 + i * 130;
    const bg = new Graphics();
    const draw = () => {
      const on = chosen.has(it.id);
      bg.clear();
      bg.roundRect(-270, -55, 540, 110, 24).fill(on ? grad([[0, '#fff6c8'], [1, '#ffe08a']]) : 0xffffff);
      bg.roundRect(-270, -55, 540, 110, 24).stroke({ width: on ? 6 : 4, color: on ? 0xff9a00 : 0xc8b8f0 });
      check.text = on ? '✓' : '';
    };
    const check = txt('', { size: 44, font: 'dela', color: 0xff6a00 });
    check.x = 220;
    const nm = txt(it.name, { size: 30, color: 0x4a2f7a, anchor: [0, 0.5] });
    nm.position.set(-240, -16);
    const ds = txt(it.desc, { size: 22, color: 0x8a6cff, anchor: [0, 0.5] });
    ds.position.set(-240, 24);
    const pr = new Container();
    const ci = coinIcon(14);
    ci.x = -20;
    const pt = txt(fmt(it.price), { size: 26, color: 0x8a4f00, anchor: [0, 0.5] });
    pr.addChild(ci, pt);
    pr.x = 80;
    row.addChild(bg, nm, ds, pr, check);
    draw();
    row.eventMode = 'static';
    row.cursor = 'pointer';
    row.on('pointertap', () => {
      if (chosen.has(it.id)) chosen.delete(it.id);
      else chosen.add(it.id);
      Sound.play('ui_tap');
      draw();
      refresh();
    });
    box.addChild(row);
  });
  box.addChild(totalT, coinsT);
  refresh();
  const close = () => {
    clearInterval(timer);
    ov.destroy({ children: true });
  };
  const start = new Button({
    w: 340, h: 110, label: 'スタート！', sub: 'ライフを1つつかう', color: 'pink', size: 44, sound: 'ui_ok', onTap: () => {
      if (total() > Save.data.coins) return Sound.play('ui_error');
      if (!spendLife()) {
        Sound.play('ui_error');
        lifeT.scale.set(1.3);
        gsap.to(lifeT.scale, { x: 1, y: 1, duration: 0.3 });
        return;
      }
      Save.data.coins -= total();
      Save.write();
      const items = [...chosen];
      close();
      onStart(items);
    },
  });
  start.position.set(-70, h / 2 - 90);
  const cancel = new Button({ w: 170, h: 84, label: 'やめる', color: 'grey', size: 28, sound: 'ui_back', onTap: close });
  cancel.position.set(200, h / 2 - 90);
  box.addChild(start, cancel);
  ov.addChild(dim, box);
  parent.addChild(ov);
  popIn(box, 0, 0.6);
}

/** Wooden plank across the top of a menu screen (behind its title and buttons). */
export function menuBar(parent: Container, height: number): void {
  const bar = jungle('topbar');
  bar.anchor.set(0.5, 0);
  bar.width = App.W + 40;
  bar.height = App.safeTop + height;
  bar.position.set(360, -6);
  parent.addChildAt(bar, 0);
}

/** Save transfer: shows the save as a code to copy, and restores from a pasted code (DOM dialog). */
export function openBackup(): void {
  const code = exportSave();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:50;background:rgba(10,4,24,.75);display:flex;align-items:center;justify-content:center;font-family:Memokatchi,sans-serif';
  wrap.innerHTML = `
    <div style="background:#fff4dc;border:6px solid #8a5a2a;border-radius:20px;padding:18px;width:min(88vw,420px);color:#4a2f7a;box-sizing:border-box">
      <div style="font-size:22px;margin-bottom:8px">データのひきつぎ</div>
      <div style="font-size:14px">このコードをコピーして保存しておくと、べつの端末やブラウザでつづきから遊べます。</div>
      <textarea readonly style="width:100%;height:80px;margin:8px 0;font-size:11px;box-sizing:border-box">${code}</textarea>
      <button data-a="copy" style="width:100%;padding:10px;font-size:16px;border-radius:12px;border:0;background:#ff4f8f;color:#fff">コードをコピー</button>
      <div style="font-size:14px;margin:14px 0 4px">コードからふっかつ（いまのデータは上書きされます）</div>
      <textarea data-in placeholder="ここにコードをはりつけ" style="width:100%;height:60px;font-size:11px;box-sizing:border-box"></textarea>
      <button data-a="load" style="width:100%;padding:10px;margin-top:6px;font-size:16px;border-radius:12px;border:0;background:#36a2ff;color:#fff">ふっかつする</button>
      <div data-msg style="font-size:14px;min-height:20px;margin-top:6px;color:#d81b60"></div>
      <button data-a="close" style="width:100%;padding:10px;margin-top:4px;font-size:16px;border-radius:12px;border:0;background:#8a7a9a;color:#fff">とじる</button>
    </div>`;
  document.body.appendChild(wrap);
  const msg = wrap.querySelector('[data-msg]') as HTMLDivElement;
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  wrap.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', async () => {
      const a = b.getAttribute('data-a');
      if (a === 'close') wrap.remove();
      if (a === 'copy') {
        try {
          await navigator.clipboard.writeText(code);
          msg.textContent = 'コピーしました！';
        } catch {
          (wrap.querySelector('textarea') as HTMLTextAreaElement).select();
          msg.textContent = 'コードを長押ししてコピーしてね';
        }
      }
      if (a === 'load') {
        const v = (wrap.querySelector('[data-in]') as HTMLTextAreaElement).value.trim();
        if (importSave(v)) {
          msg.textContent = 'ふっかつしました！ 読みこみなおします…';
          setTimeout(() => location.reload(), 900);
        } else msg.textContent = 'コードがただしくありません';
      }
    }),
  );
}

/** Login bonus calendar: seven stamps, today's one lands. */
export function loginPopup(parent: Container, day: number, got: string[], onClose?: () => void): void {
  const ov = new Container();
  const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.65 });
  dim.eventMode = 'static';
  const box = new Container();
  box.position.set(360, App.H * 0.45);
  const h = 640;
  box.addChild(panel(640, h));
  const t = txt('ログインボーナス', { size: 44, font: 'dela', color: 0xff4f8f, stroke: 0xffffff, strokeWidth: 8 });
  t.y = -h / 2 + 60;
  box.addChild(t);
  for (let i = 0; i < 7; i++) {
    const c = new Container();
    const col = i % 4;
    const row = Math.floor(i / 4);
    c.position.set(-225 + col * 150 + (row ? 75 : 0), -110 + row * 170);
    const done = i + 1 < day;
    const today = i + 1 === day;
    const g = new Graphics().roundRect(-62, -70, 124, 140, 18).fill(today ? 0xffe08a : done ? 0xe8dcc8 : 0xffffff).stroke({ width: today ? 6 : 3, color: today ? 0xff9a00 : 0x8a5a2a });
    const d = txt(`${i + 1}日目`, { size: 20, color: 0x8a5a2a });
    d.y = -48;
    const r = LOGIN_REWARDS[i];
    const label = r.tickets ? `チケット×${r.tickets}${r.coins ? `\n+${fmt(r.coins)}` : ''}` : `${fmt(r.coins ?? 0)}\nコイン`;
    const v = txt(label, { size: 20, color: 0x4a2f7a, lineHeight: 26 });
    v.y = 12;
    c.addChild(g, d, v);
    if (done || today) {
      const stamp = txt('GET', { size: 30, font: 'dela', color: 0xff3d6a, stroke: 0xffffff, strokeWidth: 6 });
      stamp.rotation = -0.3;
      stamp.y = 10;
      c.addChild(stamp);
      if (today) {
        stamp.scale.set(3);
        stamp.alpha = 0;
        gsap.to(stamp, { alpha: 1, duration: 0.15, delay: 0.6 });
        gsap.to(stamp.scale, { x: 1, y: 1, duration: 0.3, delay: 0.6, ease: 'back.out(2)', onStart: () => Sound.play('hitHeavy', { vol: 0.5 }) });
      }
    }
    box.addChild(c);
  }
  const msg = txt(got.join('  '), { size: 26, color: 0xd81b60 });
  msg.y = h / 2 - 140;
  const ok = new Button({ w: 260, h: 86, label: 'OK', color: 'pink', onTap: () => {
    ov.destroy({ children: true });
    onClose?.();
  } });
  ok.y = h / 2 - 70;
  box.addChild(msg, ok);
  ov.addChild(dim, box);
  parent.addChild(ov);
  popIn(box, 0.1, 0.6);
  Sound.sparkle();
}
