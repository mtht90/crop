import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { Button, fmt, grad, popIn, txt } from '../core/UI';
import { bigTexture, loadCharacterArt } from '../art/PieceArt';
import { CHARACTERS, CHAR_BY_ID } from '../data/characters';
import { Ranking, board, playerId, setName, submitScore, weekKey, weeklyReward, type RankRow } from '../core/Ranking';
import { weekStartMs } from '../data/rankBots';
import { rewardText } from '../data/missions';
import { ScrollBox, rewardPopup } from './common';

const WD = ['月', '火', '水', '木', '金', '土', '日'];

/** "10/19(月)〜10/25(日)" for a week key. */
export function weekDates(week: string): string {
  const s = new Date(`${week}T00:00:00Z`);
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + 6);
  return `${s.getUTCMonth() + 1}/${s.getUTCDate()}(${WD[0]})〜${e.getUTCMonth() + 1}/${e.getUTCDate()}(${WD[6]})`;
}

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
  async open(): Promise<void> {
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
      this.fill(rows);
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

  private fill(rows: RankRow[]): void {
    const me = playerId();
    // ranks with ties
    let rank = 0;
    let prev = -1;
    const ranked = rows.map((r, i) => {
      if (r.score !== prev) rank = i + 1;
      prev = r.score;
      return { ...r, rank };
    });
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
    ranked.slice(3).forEach((row, i) => {
      const r = new Container();
      r.y = 10 + i * 92 + 42;
      const mine = row.player_id === me;
      const g = new Graphics();
      g.roundRect(-320, -40, 640, 80, 20).fill(mine ? grad([[0, '#fff6c8'], [1, '#ffc94d']]) : 0xfff4dc);
      g.roundRect(-320, -40, 640, 80, 20).stroke({ width: mine ? 5 : 3, color: mine ? 0xff9a00 : 0x8a5a2a });
      const rt = txt(String(row.rank), { size: 30, font: 'dela', color: 0x8a5a2a });
      rt.x = -276;
      const pic = this.portrait(row.char_id, 58);
      pic.x = -205;
      const nm = txt(row.name, { size: 28, color: 0x4a2f7a, anchor: [0, 0.5] });
      nm.x = -162;
      if (nm.width > 260) nm.scale.set(260 / nm.width);
      const sc = txt(fmt(row.score), { size: 28, font: 'dela', color: 0xd81b60, anchor: [1, 0.5] });
      sc.x = 300;
      r.addChild(g, rt, pic, nm, sc);
      c.addChild(r);
    });
    this.list.contentH = 10 + Math.max(0, ranked.length - 3) * 92;
    // my row
    const mineRow = ranked.find((r) => r.player_id === me);
    this.buildMe(mineRow?.rank ?? 0, mineRow?.score ?? 0, ranked.length);
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

  private showRewards(rank: number, total: number): void {
    const t = Math.max(total, 1);
    const lines = [
      `1位：${rewardText(weeklyReward(1, t))}`,
      `2〜3位：${rewardText(weeklyReward(2, t))}`,
      `上位10%：${rewardText(weeklyReward(Math.max(4, Math.ceil(t * 0.1)), t))}`,
      `上位30%：${rewardText(weeklyReward(Math.max(4, Math.ceil(t * 0.3)), t))}`,
      `上位50%：${rewardText(weeklyReward(Math.max(4, Math.ceil(t * 0.5)), t))}`,
      `さんか賞：${rewardText(weeklyReward(t, t))}`,
    ];
    if (rank) lines.push('', `いまのままだと → ${rewardText(weeklyReward(rank, t))}`);
    rewardPopup(this.parentLayer, '今週のほうしゅう', lines);
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
