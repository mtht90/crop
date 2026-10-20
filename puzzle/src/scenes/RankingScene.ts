import { Container, Graphics } from 'pixi.js';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { Button, fmt, grad, panel, popIn, txt } from '../core/UI';
import { MenuBackground } from '../game/Backdrop';
import { CHAR_BY_ID } from '../data/characters';
import { Ranking, myRank, playerId, setName, submitScore, topScores, weekKey, weekLabel, type RankRow } from '../core/Ranking';
import { HomeScene } from './HomeScene';
import { ScrollBox, menuBar } from './common';

/** How many past weeks can be browsed. */
const PAST_WEEKS = 8;

/** Weekly online ranking: this week's best scores, past weeks, and your nickname. */
export class RankingScene extends Scene {
  private bg = new MenuBackground(0x3a7bff, 0xffb84d, 1);
  private col = new Container();
  private list!: ScrollBox;
  private offset = 0;
  private weekT = txt('', { size: 28, stroke: 0x2a1630, strokeWidth: 6 });
  private meT = txt('', { size: 24, color: 0x4a2f7a });
  private nameT = txt('', { size: 26, color: 0x4a2f7a, anchor: [0, 0.5] });
  private status = txt('', { size: 24, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 6, wrap: 600, align: 'center' });
  private req = 0;

  enter(): void {
    this.view.addChild(this.bg, this.col);
    Sound.music('home', 0.8);
    const top = App.safeTop + 16;
    menuBar(this.col, 120);
    const title = txt('ランキング', { size: 52, font: 'dela', stroke: 0x2a1630, strokeWidth: 12 });
    title.position.set(360, top + 46);
    const back = new Button({ w: 150, h: 76, label: 'もどる', color: 'grey', size: 28, sound: 'ui_back', onTap: () => Scenes.go(() => new HomeScene()) });
    back.position.set(100, top + 46);
    this.col.addChild(title, back);
    // nickname card
    const card = new Container();
    card.position.set(360, top + 170);
    card.addChild(panel(640, 120));
    this.nameT.position.set(-290, -22);
    this.meT.position.set(-290, 26);
    this.meT.anchor.set(0, 0.5);
    const edit = new Button({ w: 190, h: 64, label: 'なまえ変更', color: 'blue', size: 22, onTap: () => this.askName() });
    edit.position.set(200, -14);
    card.addChild(this.nameT, this.meT, edit);
    this.col.addChild(card);
    // week switcher
    const wy = top + 280;
    this.weekT.position.set(360, wy);
    const prev = new Button({ w: 80, h: 64, label: '◀', color: 'purple', size: 28, onTap: () => this.show(this.offset + 1) });
    prev.position.set(90, wy);
    const next = new Button({ w: 80, h: 64, label: '▶', color: 'purple', size: 28, onTap: () => this.show(this.offset - 1) });
    next.position.set(630, wy);
    this.col.addChild(this.weekT, prev, next);
    const y0 = wy + 50;
    this.list = new ScrollBox(720, App.H - y0 - App.safeBottom - 10);
    this.list.position.set(360, y0);
    this.status.position.set(360, y0 + 160);
    this.col.addChild(this.list, this.status);
    popIn(card, 0.05, 0.8);
    this.refreshName();
    if (!Ranking.enabled) {
      this.weekT.text = weekLabel(weekKey(0));
      this.status.text = 'オンラインランキングはまだ準備中です\n（サーバー設定後に遊べるようになります）';
      return;
    }
    if (!Ranking.registered) this.askName();
    this.show(0);
  }

  private refreshName(): void {
    const r = Save.data.rank;
    this.nameT.text = r.name ? `なまえ：${r.name}` : 'なまえ：（みとうろく）';
    const best = r.best[weekKey(0)] ?? 0;
    this.meT.text = `こんしゅうのベスト ${fmt(best)}`;
  }

  private async show(offset: number): Promise<void> {
    if (offset < 0 || offset >= PAST_WEEKS || !Ranking.enabled) return;
    this.offset = offset;
    const week = weekKey(offset);
    this.weekT.text = `${offset === 0 ? 'こんしゅう' : offset === 1 ? 'せんしゅう' : `${offset}しゅうまえ`}  ${weekLabel(week)}`;
    const c = this.list.content;
    for (const ch of c.removeChildren()) ch.destroy({ children: true });
    c.y = 0;
    this.list.contentH = 0;
    this.status.text = 'よみこみちゅう…';
    const req = ++this.req;
    try {
      const [rows, mine] = await Promise.all([topScores(week), myRank(week)]);
      if (req !== this.req || this.view.destroyed) return;
      this.status.text = rows.length ? '' : 'まだだれもいません\nいちばんのりをめざそう！';
      if (mine) this.meT.text = `${offset === 0 ? 'こんしゅう' : 'このしゅう'} ${mine.rank}位 / ${mine.total}人  ${fmt(mine.score)}`;
      else this.refreshName();
      this.fill(rows);
    } catch {
      if (req !== this.req || this.view.destroyed) return;
      this.status.text = 'ランキングをよみこめませんでした\n通信をたしかめてね';
    }
  }

  private fill(rows: RankRow[]): void {
    const me = playerId();
    const c = this.list.content;
    let rank = 0;
    let prevScore = -1;
    rows.forEach((row, i) => {
      if (row.score !== prevScore) rank = i + 1;
      prevScore = row.score;
      const r = new Container();
      r.y = 20 + i * 96 + 44;
      const mine = row.player_id === me;
      const medal = [0xffc71f, 0xc8d0e0, 0xd8915a][rank - 1];
      const g = new Graphics();
      g.roundRect(-320, -42, 640, 84, 20).fill(mine ? grad([[0, '#fff6c8'], [1, '#ffc94d']]) : 0xfff4dc);
      g.roundRect(-320, -42, 640, 84, 20).stroke({ width: mine ? 5 : 3, color: mine ? 0xff9a00 : 0x8a5a2a });
      if (medal) g.circle(-268, 0, 30).fill(medal).stroke({ width: 4, color: 0xffffff });
      const rt = txt(String(rank), { size: rank <= 3 ? 34 : 28, font: 'dela', color: rank <= 3 ? 0xffffff : 0x8a5a2a, stroke: rank <= 3 ? 0x6a3a00 : undefined, strokeWidth: rank <= 3 ? 6 : 0 });
      rt.x = -268;
      const nm = txt(row.name, { size: 28, color: 0x4a2f7a, anchor: [0, 0.5] });
      nm.position.set(-220, -12);
      const ch = txt(CHAR_BY_ID[row.char_id ?? '']?.name ?? '', { size: 18, color: 0x8a6cff, anchor: [0, 0.5] });
      ch.position.set(-220, 22);
      const sc = txt(fmt(row.score), { size: 30, font: 'dela', color: 0xd81b60, anchor: [1, 0.5] });
      sc.x = 300;
      r.addChild(g, rt, nm, ch, sc);
      c.addChild(r);
    });
    this.list.contentH = 20 + rows.length * 96;
  }

  /** Nickname entry (DOM input so phone keyboards work). */
  private askName(): void {
    const w = document.createElement('div');
    w.style.cssText = 'position:fixed;inset:0;z-index:50;background:rgba(10,4,24,.75);display:flex;align-items:center;justify-content:center;font-family:Memokatchi,sans-serif';
    w.innerHTML = `
      <div style="background:#fff4dc;border:6px solid #8a5a2a;border-radius:20px;padding:18px;width:min(86vw,380px);color:#4a2f7a;box-sizing:border-box">
        <div style="font-size:22px;margin-bottom:6px">ニックネーム</div>
        <div style="font-size:14px;margin-bottom:8px">ランキングにのる名前（12文字まで）</div>
        <input data-n maxlength="12" value="${Save.data.rank.name.replace(/"/g, '&quot;')}" style="width:100%;padding:10px;font-size:18px;border:3px solid #c8a878;border-radius:12px;box-sizing:border-box">
        <div data-m style="color:#d81b60;min-height:20px;font-size:14px;margin:6px 0"></div>
        <button data-ok style="width:100%;padding:10px;font-size:18px;border:0;border-radius:12px;background:#ff4f8f;color:#fff">けってい</button>
        <button data-x style="width:100%;padding:8px;margin-top:6px;font-size:16px;border:0;border-radius:12px;background:#8a7a9a;color:#fff">あとで</button>
      </div>`;
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) w.addEventListener(ev, (e) => e.stopPropagation());
    document.body.appendChild(w);
    const input = w.querySelector('[data-n]') as HTMLInputElement;
    input.focus();
    const ok = () => {
      const err = setName(input.value);
      if (err) {
        (w.querySelector('[data-m]') as HTMLDivElement).textContent = err;
        return;
      }
      w.remove();
      Sound.play('ui_ok');
      this.refreshName();
      // resend this week's best under the new name
      const best = Save.data.rank.best[weekKey(0)];
      if (best) void submitScore(best, Save.data.selected).then(() => this.show(this.offset));
      else void this.show(this.offset);
    };
    w.querySelector('[data-ok]')!.addEventListener('click', ok);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
    w.querySelector('[data-x]')!.addEventListener('click', () => w.remove());
  }

  resize(): void {
    this.bg.layout(App.W, App.H);
    this.col.x = App.colX;
  }

  update(dt: number): void {
    this.bg.update(dt);
    this.list?.update();
  }
}
