import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { Button, fmt, grad, panel, popIn, txt } from '../core/UI';
import { bigTexture, loadCharacterArt } from '../art/PieceArt';
import { CHARACTERS, CHAR_BY_ID } from '../data/characters';
import { Ranking, WEEKLY_TIERS, board, giftWait, playerId, sendLife, setName, submitScore, weekKey, weeklyTier, type RankRow } from '../core/Ranking';
import { tex } from '../core/Loader';
import { weekStartMs } from '../data/rankBots';
import { rewardText } from '../data/missions';
import { ScrollBox } from './common';

const WD = ['月', '火', '水', '木', '金', '土', '日'];

/** "10/19(月)〜10/25(日)" for a week key. */
export function weekDates(week: string): string {
  const s = new Date(`${week}T00:00:00Z`);
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + 6);
  return `${s.getUTCMonth() + 1}/${s.getUTCDate()}(${WD[0]})〜${e.getUTCMonth() + 1}/${e.getUTCDate()}(${WD[6]})`;
}

/** A round that beat this week's best: the ranking page animates the player's climb. */
export interface RankUp {
  prev: number;
  now: number;
}

/** List slot y (content coordinates) of the n-th row below the podium. */
const slotY = (i: number) => 10 + i * 92 + 42;

/** This week's ranking, shown as the page to the right of home (Tsum Tsum-style). */
export class RankingPanel extends Container {
  private list: ScrollBox;
  private podium = new Container();
  private me = new Container();
  private status = txt('', { size: 26, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 7, wrap: 600, align: 'center' });
  private left = txt('', { size: 22, color: 0xfff27a, stroke: 0x2a1630, strokeWidth: 6 });
  private loaded = false;
  private clock = 0;
  private listTop: number;

  constructor(private readonly parentLayer: Container) {
    super();
    const top = App.safeTop + 16;
    // title ribbon
    const ribbon = new Graphics();
    ribbon.poly([-300, -38, 300, -38, 330, 0, 300, 38, -300, 38, -330, 0]).fill(grad([[0, '#ff7ab8'], [1, '#d81b60']]));
    ribbon.poly([-300, -38, 300, -38, 330, 0, 300, 38, -300, 38, -330, 0]).stroke({ width: 5, color: 0xffffff });
    ribbon.position.set(360, top + 150);
    const title = txt('今週のランキング', { size: 44, font: 'dela', stroke: 0x7a1048, strokeWidth: 9 });
    title.position.set(360, top + 146);
    const dates = txt(weekDates(weekKey(0)), { size: 26, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 7 });
    dates.position.set(360, top + 210);
    this.left.position.set(360, top + 246);
    this.podium.position.set(360, top + 530);
    this.listTop = top + 606;
    const bottom = App.H - App.safeBottom - 150;
    this.list = new ScrollBox(720, Math.max(200, bottom - this.listTop - 10));
    this.list.position.set(360, this.listTop);
    this.me.position.set(360, bottom + 66);
    this.status.position.set(360, top + 500);
    this.addChild(ribbon, title, dates, this.left, this.podium, this.list, this.me, this.status);
    this.tickClock();
  }

  /** Loads the board the first time the page is shown (and refreshes on later visits). */
  async open(rankUp?: RankUp): Promise<void> {
    if (!Ranking.enabled) {
      this.status.text = 'ランキングはじゅんびちゅうです';
      return;
    }
    if (!this.loaded) this.status.text = 'よみこみちゅう…';
    try {
      await loadCharacterArt(CHARACTERS.map((c) => c.id), { portraits: true });
      const rows = await board(weekKey(0));
      if (this.destroyed) return;
      this.loaded = true;
      this.status.text = rows.length ? '' : 'まだだれもいません\nいちばんのりをめざそう！';
      this.fill(rows, rankUp);
    } catch {
      if (this.destroyed) return;
      this.status.text = 'ランキングをよみこめませんでした';
    }
  }

  private tickClock(): void {
    const end = weekStartMs(weekKey(0)) + 7 * 86400_000;
    const ms = Math.max(0, end - Date.now());
    const d = Math.floor(ms / 86400_000);
    const h = Math.floor((ms % 86400_000) / 3600_000);
    const m = Math.floor((ms % 3600_000) / 60_000);
    this.left.text = `しめきりまで ${d ? `${d}日 ` : ''}${h}時間${d ? '' : ` ${m}分`}`;
  }

  update(dt: number): void {
    this.list.update();
    // heart buttons count down their wait
    this.giftClock -= dt;
    if (this.giftClock <= 0) {
      this.giftClock = 5;
      for (const d of this.gifts) d();
    }
    this.clock -= dt;
    if (this.clock <= 0) {
      this.clock = 20;
      this.tickClock();
    }
  }

  private portrait(charId: string | null, size: number): Container {
    const c = new Container();
    const ring = new Graphics().circle(0, 0, size / 2 + 4).fill(0xffffff).circle(0, 0, size / 2).fill(0xe8dcff);
    c.addChild(ring);
    const def = CHAR_BY_ID[charId ?? ''];
    if (def) {
      const s = new Sprite(bigTexture(def));
      s.anchor.set(0.5, 0.55);
      s.scale.set((size * 1.05) / Math.max(1, s.texture.width));
      const m = new Graphics().circle(0, 0, size / 2).fill(0xffffff);
      s.mask = m;
      c.addChild(s, m);
    }
    return c;
  }

  private fill(rows: RankRow[], rankUp?: RankUp): void {
    const me = playerId();
    // the server may not have this round yet (or the send failed): use the local weekly best
    const local = Math.max(Save.data.rank.best[weekKey(0)] ?? 0, rankUp?.now ?? 0);
    if (Ranking.registered && local > 0) {
      const mine = rows.find((r) => r.player_id === me);
      if (!mine) rows = [...rows, { player_id: me, name: Save.data.rank.name, score: local, char_id: Save.data.selected }];
      else if (mine.score < local) mine.score = local;
      rows.sort((a, z) => z.score - a.score);
    }
    // ranks with ties
    let rank = 0;
    let prev = -1;
    const ranked = rows.map((r, i) => {
      if (r.score !== prev) rank = i + 1;
      prev = r.score;
      return { ...r, rank };
    });
    this.gifts = [];
    // podium: 2nd, 1st, 3rd
    for (const ch of this.podium.removeChildren()) ch.destroy({ children: true });
    const slots: [number, number, number, number][] = [[1, -200, 150, 0xc8d0e0], [0, 0, 180, 0xffc71f], [2, 200, 132, 0xd8915a]];
    for (const [idx, x, h, col] of slots) {
      const row = ranked[idx];
      if (!row) continue;
      const c = new Container();
      c.x = x;
      const top = -h + 60;
      const base = new Graphics();
      base.roundRect(-88, top, 176, h, 18).fill(grad([[0, '#fff6dc'], [1, '#e2c89a']]));
      base.roundRect(-88, top, 176, h, 18).stroke({ width: 5, color: 0x8a5a2a });
      const size = idx === 0 ? 120 : 100;
      const pic = this.portrait(row.char_id, size);
      pic.y = top - size / 2 + 14;
      // rank medal on the portrait's corner
      const medal = new Graphics().circle(0, 0, 24).fill(col).stroke({ width: 4, color: 0x6a3a00 });
      medal.position.set(size / 2 - 6, pic.y + size / 2 - 14);
      const num = txt(String(row.rank), { size: 28, font: 'dela', color: 0xffffff, stroke: 0x6a3a00, strokeWidth: 6 });
      num.position.set(medal.x, medal.y - 2);
      const nm = txt(row.name, { size: 24, color: 0x4a2a10 });
      nm.y = top + 40;
      if (nm.width > 160) nm.scale.set(160 / nm.width);
      const sc = txt(fmt(row.score), { size: 23, color: 0xd81b60 });
      sc.y = nm.y + 32;
      c.addChild(base, nm, sc, pic, medal, num);
      if (row.player_id !== me) {
        const heart = this.giftButton(row, 40);
        heart.position.set(0, top + 106);
        c.addChild(heart);
      }
      if (idx === 0) {
        const crown = new Graphics();
        crown.poly([-36, 16, -42, -18, -18, 0, 0, -28, 18, 0, 42, -18, 36, 16]).fill(0xffd23f).stroke({ width: 4, color: 0x8a5a00 });
        crown.y = pic.y - size / 2 - 12;
        c.addChild(crown);
        gsap.to(crown, { y: crown.y - 6, duration: 0.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }
      if (row.player_id === me) pic.addChild(new Graphics().circle(0, 0, size / 2 + 8).stroke({ width: 6, color: 0xff4f8f }));
      this.podium.addChild(c);
      popIn(c, 0.05 + idx * 0.08, 0.5);
    }
    // the rest
    const c = this.list.content;
    for (const ch of c.removeChildren()) ch.destroy({ children: true });
    const els: Container[] = [];
    ranked.slice(3).forEach((row, i) => {
      const r = new Container();
      r.y = slotY(i);
      els.push(r);
      const mine = row.player_id === me;
      const g = new Graphics();
      g.roundRect(-290, -40, 580, 80, 20).fill(mine ? grad([[0, '#fff6c8'], [1, '#ffc94d']]) : 0xfff4dc);
      g.roundRect(-290, -40, 580, 80, 20).stroke({ width: mine ? 5 : 3, color: mine ? 0xff9a00 : 0x8a5a2a });
      const rt = txt(String(row.rank), { size: 30, font: 'dela', color: 0x8a5a2a });
      rt.x = -250;
      const pic = this.portrait(row.char_id, 58);
      pic.x = -184;
      const nm = txt(row.name, { size: 28, color: 0x4a2f7a, anchor: [0, 0.5] });
      nm.x = -144;
      if (nm.width > 180) nm.scale.set(180 / nm.width);
      const sc = txt(fmt(row.score), { size: 28, font: 'dela', color: 0xd81b60, anchor: [1, 0.5] });
      sc.x = row.player_id === me ? 272 : 214;
      r.addChild(g, rt, pic, nm, sc);
      if (row.player_id !== me) {
        const heart = this.giftButton(row, 50);
        heart.x = 250;
        r.addChild(heart);
      }
      c.addChild(r);
    });
    this.list.contentH = 10 + Math.max(0, ranked.length - 3) * 92;
    // my row
    const mineRow = ranked.find((r) => r.player_id === me);
    this.buildMe(mineRow?.rank ?? 0, mineRow?.score ?? 0, ranked.length);
    if (rankUp && mineRow) this.climb(ranked, els, rankUp);
  }

  /**
   * Tsum Tsum-style climb: the player's row starts where the old best ranked, rises to the new
   * place while the rows it passes slide down, and a banner shows old → new.
   */
  private climb(ranked: (RankRow & { rank: number })[], els: Container[], up: RankUp): void {
    const me = playerId();
    const others = ranked.filter((r) => r.player_id !== me);
    const newIdx = ranked.findIndex((r) => r.player_id === me);
    const newRank = ranked[newIdx].rank;
    const oldRank = up.prev > 0 ? others.filter((r) => r.score > up.prev).length + 1 : 0;
    const oldIdx = up.prev > 0 ? Math.min(ranked.length - 1, oldRank - 1) : ranked.length - 1;
    const banner = (text: string) => {
      const b = new Container();
      const t = txt(text, { size: 46, font: 'dela', color: 0xfff27a, stroke: 0xd81b60, strokeWidth: 10 });
      const g = new Graphics().roundRect(-t.width / 2 - 40, -46, t.width + 80, 92, 46).fill({ color: 0x2a1630, alpha: 0.85 }).stroke({ width: 5, color: 0xffffff });
      b.addChild(g, t);
      b.position.set(360, this.listTop + 120);
      this.addChild(b);
      popIn(b, 0, 0.6);
      gsap.to(b, { alpha: 0, y: b.y - 40, delay: 2.4, duration: 0.5, onComplete: () => b.destroy({ children: true }) });
    };
    const label = oldRank ? `順位アップ！ ${oldRank}位 → ${newRank}位` : `ランクイン！ ${newRank}位`;
    if (oldRank && oldRank <= newRank) return;
    const mineEl = newIdx >= 3 ? els[newIdx - 3] : null;
    if (!mineEl || oldIdx <= newIdx) {
      // landed on the podium (or no visible move): just celebrate
      this.list.centerOn(0);
      gsap.delayedCall(0.5, () => {
        banner(label);
        Sound.play('jLevel', { vol: 0.7 });
      });
      return;
    }
    // start: me at the old slot, the rows I pass one slot higher
    const from = oldIdx - 3;
    const to = newIdx - 3;
    for (let i = to + 1; i <= from && i < els.length; i++) els[i].y = slotY(i - 1);
    mineEl.y = slotY(from);
    this.list.content.setChildIndex(mineEl, this.list.content.children.length - 1);
    this.list.centerOn(slotY(from));
    const dur = Math.min(2.2, 0.8 + (from - to) * 0.04);
    const tl = gsap.timeline({ delay: 0.7 });
    tl.to(mineEl.scale, { x: 1.06, y: 1.06, duration: 0.2, ease: 'back.out(2)' });
    tl.add(() => Sound.play('cardSlide', { vol: 0.6 }));
    tl.to(mineEl, { y: slotY(to), duration: dur, ease: 'power2.inOut' });
    // the row's rank number counts down as it climbs
    const rt = mineEl.children[1] as ReturnType<typeof txt>;
    const n = { v: oldRank || ranked.length };
    rt.text = String(n.v);
    tl.to(n, { v: newRank, duration: dur, ease: 'power2.inOut', onUpdate: () => (rt.text = String(Math.round(n.v))) }, '<');
    for (let i = to + 1; i <= from && i < els.length; i++) tl.to(els[i], { y: slotY(i), duration: dur, ease: 'power2.inOut' }, '<');
    tl.add(() => this.list.centerOn(slotY(to), dur), '<');
    tl.to(mineEl.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
    tl.add(() => {
      banner(label);
      Sound.play('jLevel', { vol: 0.7 });
    });
  }

  /** Heart button: sends this player a life (once an hour), or shows the wait. */
  private giftButton(row: RankRow, size: number): Container {
    const c = new Container();
    const icon = new Sprite(tex('ui:heart'));
    icon.anchor.set(0.5);
    const wait = txt('', { size: 15, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 4 });
    wait.y = size * 0.42;
    c.addChild(icon, wait);
    const draw = () => {
      const ms = giftWait(row.player_id);
      icon.texture = tex(ms ? 'ui:heart_empty' : 'ui:heart');
      icon.scale.set(size / Math.max(1, icon.texture.width));
      icon.alpha = ms ? 0.6 : 1;
      wait.text = ms ? `${Math.ceil(ms / 60000)}分` : '';
    };
    draw();
    this.gifts.push(draw);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    let busy = false;
    c.on('pointertap', async () => {
      if (busy || giftWait(row.player_id)) return Sound.play('ui_tap');
      busy = true;
      const err = await sendLife(row.player_id);
      busy = false;
      if (this.destroyed) return;
      if (err) return this.toast(err);
      draw();
      Sound.play('powerUp2', { vol: 0.6 });
      // a heart floats up from the button
      const p = c.getGlobalPosition();
      const local = this.toLocal(p);
      const h = new Sprite(tex('ui:heart'));
      h.anchor.set(0.5);
      h.scale.set(size / Math.max(1, h.texture.width));
      h.position.set(local.x, local.y);
      this.addChild(h);
      gsap.to(h, { y: h.y - 120, alpha: 0, duration: 0.8, ease: 'power1.out', onComplete: () => h.destroy() });
      gsap.fromTo(h.scale, { x: h.scale.x * 0.6, y: h.scale.y * 0.6 }, { x: h.scale.x * 1.4, y: h.scale.y * 1.4, duration: 0.8 });
      this.toast(`${row.name} にライフをおくった！`);
    });
    return c;
  }

  private gifts: (() => void)[] = [];
  private giftClock = 0;

  /** Short message over the list. */
  private toastBox: Container | null = null;
  private toast(text: string): void {
    this.toastBox?.destroy({ children: true });
    const box = new Container();
    const t = txt(text, { size: 28, color: 0xffffff });
    if (t.width > 560) t.scale.set(560 / t.width);
    box.addChild(new Graphics().roundRect(-t.width / 2 - 30, -32, t.width + 60, 64, 32).fill({ color: 0xd81b60, alpha: 0.95 }).stroke({ width: 4, color: 0xffffff }), t);
    box.position.set(360, this.listTop - 4);
    this.addChild(box);
    this.toastBox = box;
    popIn(box, 0, 0.4);
    gsap.to(box, { alpha: 0, y: box.y - 24, delay: 1.4, duration: 0.4, onComplete: () => {
      if (this.toastBox === box) this.toastBox = null;
      box.destroy({ children: true });
    } });
  }

  private buildMe(rank: number, score: number, total: number): void {
    for (const ch of this.me.removeChildren()) ch.destroy({ children: true });
    const g = new Graphics();
    g.roundRect(-330, -58, 660, 116, 26).fill({ color: 0x000000, alpha: 0.25 });
    g.roundRect(-330, -62, 660, 116, 26).fill(grad([[0, '#7a4dff'], [1, '#4a2a9a']]));
    g.roundRect(-330, -62, 660, 116, 26).stroke({ width: 5, color: 0xffffff });
    this.me.addChild(g);
    const name = Save.data.rank.name;
    if (!name) {
      const t = txt('なまえをとうろくして\nランキングにさんかしよう！', { size: 24, color: 0xffffff, lineHeight: 32, anchor: [0, 0.5] });
      t.position.set(-300, -4);
      const b = new Button({ w: 220, h: 76, label: 'とうろく', color: 'pink', size: 30, onTap: () => this.askName() });
      b.position.set(200, -6);
      this.me.addChild(t, b);
      return;
    }
    const left = txt(rank ? `${rank}位` : '--位', { size: 44, font: 'dela', color: 0xfff27a, stroke: 0x2a1630, strokeWidth: 7, anchor: [0, 0.5] });
    left.position.set(-300, -6);
    const nm = txt(name, { size: 24, color: 0xffffff, anchor: [0, 0.5] });
    nm.position.set(-150, -26);
    const sc = txt(rank ? fmt(score) : 'まだ記録なし', { size: 28, font: 'dela', color: 0xffffff, anchor: [0, 0.5] });
    sc.position.set(-150, 14);
    const info = new Button({ w: 120, h: 60, label: 'ほうしゅう', color: 'yellow', size: 20, onTap: () => this.showRewards(rank, total) });
    info.position.set(158, -6);
    const edit = new Button({ w: 90, h: 60, label: 'なまえ', color: 'blue', size: 20, onTap: () => this.askName() });
    edit.position.set(272, -6);
    this.me.addChild(left, nm, sc, info, edit);
  }

  /** Reward table for this week, with the player's current tier highlighted. */
  private showRewards(rank: number, total: number): void {
    const cur = rank ? weeklyTier(rank, total) : -1;
    const ov = new Container();
    const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.6 });
    dim.eventMode = 'static';
    const box = new Container();
    box.position.set(360, App.H * 0.45);
    const rowH = 70;
    const h = 200 + WEEKLY_TIERS.length * rowH + 60;
    const title = txt('今週のほうしゅう', { size: 44, color: 0xff4f8f, stroke: 0xffffff, strokeWidth: 8 });
    title.y = -h / 2 + 56;
    const note = txt(rank ? `いまは ${rank}位 / ${total}人` : 'タイムアタックでスコアを出すとさんかできるよ', { size: 24, color: 0x8a5a2a });
    note.y = title.y + 52;
    box.addChild(panel(620, h), title, note);
    WEEKLY_TIERS.forEach((t, i) => {
      const y = -h / 2 + 170 + i * rowH;
      const on = i === cur;
      const g = new Graphics().roundRect(-280, y - 30, 560, 60, 16).fill(on ? grad([[0, '#fff6c8'], [1, '#ffc94d']]) : i % 2 ? 0xfff8ea : 0xf6ead2);
      if (on) g.roundRect(-280, y - 30, 560, 60, 16).stroke({ width: 4, color: 0xff9a00 });
      const lb = txt(t.label, { size: 26, color: i < 2 ? 0xd81b60 : 0x4a2f7a, anchor: [0, 0.5] });
      lb.position.set(-262, y);
      const rw = txt(rewardText(t.reward), { size: 24, color: 0x4a2f7a, anchor: [1, 0.5] });
      rw.position.set(262, y);
      if (rw.width > 360) rw.scale.set(360 / rw.width);
      box.addChild(g, lb, rw);
      if (on) {
        const tag = txt('いまここ！', { size: 18, color: 0xffffff, stroke: 0xd81b60, strokeWidth: 5 });
        tag.position.set(-262 + lb.width + 54, y - 1);
        box.addChild(tag);
      }
    });
    const ok = new Button({ w: 240, h: 84, label: 'OK', color: 'pink', onTap: () => ov.destroy({ children: true }) });
    ok.y = h / 2 - 64;
    box.addChild(ok);
    ov.addChild(dim, box);
    this.parentLayer.addChild(ov);
    popIn(box, 0, 0.5);
    Sound.play('ui_tap');
  }

  /** Nickname entry (DOM input so phone keyboards work). */
  askName(): void {
    const w = document.createElement('div');
    w.style.cssText = 'position:fixed;inset:0;z-index:50;background:rgba(10,4,24,.75);display:flex;align-items:center;justify-content:center;font-family:Memokatchi,sans-serif';
    w.innerHTML = `
      <div style="background:#fff4dc;border:6px solid #8a5a2a;border-radius:20px;padding:18px;width:min(86vw,380px);color:#4a2f7a;box-sizing:border-box">
        <div style="font-size:22px;margin-bottom:6px">ニックネーム</div>
        <div style="font-size:14px;margin-bottom:8px">ランキングにのる名前（12文字まで）</div>
        <input data-n maxlength="12" style="width:100%;padding:10px;font-size:18px;border:3px solid #c8a878;border-radius:12px;box-sizing:border-box">
        <div data-m style="color:#d81b60;min-height:20px;font-size:14px;margin:6px 0"></div>
        <button data-ok style="width:100%;padding:10px;font-size:18px;border:0;border-radius:12px;background:#ff4f8f;color:#fff">けってい</button>
        <button data-x style="width:100%;padding:8px;margin-top:6px;font-size:16px;border:0;border-radius:12px;background:#8a7a9a;color:#fff">あとで</button>
      </div>`;
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) w.addEventListener(ev, (e) => e.stopPropagation());
    document.body.appendChild(w);
    const input = w.querySelector('[data-n]') as HTMLInputElement;
    input.value = Save.data.rank.name;
    input.focus();
    const ok = () => {
      const err = setName(input.value);
      if (err) {
        (w.querySelector('[data-m]') as HTMLDivElement).textContent = err;
        return;
      }
      w.remove();
      Sound.play('ui_ok');
      // resend this week's best under the new name
      const best = Save.data.rank.best[weekKey(0)];
      (best ? submitScore(best, Save.data.selected) : Promise.resolve(false)).then(() => this.open());
    };
    w.querySelector('[data-ok]')!.addEventListener('click', ok);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
    w.querySelector('[data-x]')!.addEventListener('click', () => w.remove());
  }
}
