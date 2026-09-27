import { events } from '../core/events';
import { el, escapeHtml, yen } from '../core/util';
import { itemDef } from '../data/items';
import { GRADE_COLOR, knownValue } from '../game/valuation';
import type { Game } from '../game/game';
import type { ItemState } from '../game/state';
import { icon } from './ui';

export interface PromptLine { key: string; text: string; disabled?: boolean }

/** 常時表示の HUD */
export class Hud {
  readonly el: HTMLDivElement;
  private day: HTMLElement;
  private clock: HTMLElement;
  private phase: HTMLElement;
  private money: HTMLElement;
  private rep: HTMLElement;
  private lvl: HTMLElement;
  private xpBar: HTMLElement;
  private prompt: HTMLElement;
  private info: HTMLElement;
  private held: HTMLElement;
  private objectives: HTMLElement;
  private queueInfo: HTMLElement;
  private shownMoney = 0;
  private lastPrompt = '';
  private lastInfo = '';
  private lastHeld = '';
  private lastObj = '';

  constructor(private g: Game) {
    this.el = el('div', 'hud');
    this.el.innerHTML = `
      <div class="hud-tl panel">
        <div class="hud-shop"></div>
        <div class="hud-row"><span class="hud-day"></span><span class="hud-clock"></span></div>
        <div class="hud-phase"></div>
      </div>
      <div class="hud-tr panel">
        <div class="hud-money"></div>
        <div class="hud-rep"></div>
        <div class="hud-lvl"><span></span><div class="xpbar"><i></i></div></div>
      </div>
      <div class="hud-queue"></div>
      <div class="crosshair"></div>
      <div class="hud-prompt"></div>
      <div class="hud-info"></div>
      <div class="hud-held"></div>
      <div class="hud-obj panel"></div>
      <div class="hud-keys">Tab: 店長タブレット ・ Q: 持っている品を在庫へ ・ Esc: メニュー</div>
    `;
    const q = (s: string) => this.el.querySelector(s) as HTMLElement;
    this.day = q('.hud-day');
    this.clock = q('.hud-clock');
    this.phase = q('.hud-phase');
    this.money = q('.hud-money');
    this.rep = q('.hud-rep');
    this.lvl = q('.hud-lvl span');
    this.xpBar = q('.xpbar i');
    this.prompt = q('.hud-prompt');
    this.info = q('.hud-info');
    this.held = q('.hud-held');
    this.objectives = q('.hud-obj');
    this.queueInfo = q('.hud-queue');
    (q('.hud-shop')).textContent = g.model.state.shopName;
    this.shownMoney = g.model.state.money;
    events.on('money:changed', (e) => {
      if (Math.abs(e.delta) < 1) return;
      const f = el('div', `money-float ${e.delta > 0 ? 'plus' : 'minus'}`, `${e.delta > 0 ? '+' : '−'}${yen(Math.abs(e.delta))}`);
      this.el.querySelector('.hud-tr')!.appendChild(f);
      setTimeout(() => f.remove(), 1600);
    });
    events.on('xp:gained', (e) => {
      if (e.leveledUp) {
        const f = el('div', 'levelup', `${icon('stars-stack')}<div>店舗レベル <b>${e.level}</b> に上がった！</div><small>新しい商品・客層・設備が解放されます</small>`);
        this.el.appendChild(f);
        setTimeout(() => f.remove(), 3500);
      }
    });
  }

  setPrompt(lines: PromptLine[]) {
    const html = lines.map((l) => `<div class="pl ${l.disabled ? 'dis' : ''}">${l.key ? `<kbd>${l.key}</kbd>` : ''}<span>${escapeHtml(l.text)}</span></div>`).join('');
    if (html !== this.lastPrompt) { this.prompt.innerHTML = html; this.lastPrompt = html; }
  }

  /** 視線の先の商品情報 */
  setInfo(it: ItemState | null) {
    let html = '';
    if (it) {
      const def = itemDef(it.defId);
      const kv = knownValue(it, this.g.model.trend(def.category));
      const status = [
        def.electronic ? (it.tested ? (it.working ? '動作OK' : '<b class="bad">動作不良</b>') : '<span class="dim">動作未確認</span>') : '',
        def.auth ? (it.verdict === 'genuine' ? '本物判定' : it.verdict === 'fake' ? '<b class="bad">偽物判定</b>' : '<span class="dim">真贋未判定</span>') : '',
        it.dirt > 0.25 ? '汚れあり' : '',
      ].filter(Boolean).join(' ・ ');
      html = `<div class="ii-name">${escapeHtml(def.name)}</div>
        <div class="ii-row"><span class="grade" style="background:${GRADE_COLOR[kv.grade]}">${kv.grade}</span>
        <span>相場目安 ${yen(kv.value)}${kv.certain ? '' : '?'}</span>${it.cost ? `<span class="dim">仕入 ${yen(it.cost)}</span>` : ''}</div>
        ${status ? `<div class="ii-row small">${status}</div>` : ''}
        ${it.price ? `<div class="ii-price">売価 ${yen(it.price)}</div>` : ''}`;
    }
    if (html !== this.lastInfo) {
      this.info.innerHTML = html;
      this.info.classList.toggle('show', !!html);
      this.lastInfo = html;
    }
  }

  setHeld(it: ItemState | null) {
    const html = it ? `${icon('cardboard-box')}<span>手に持っている: <b>${escapeHtml(itemDef(it.defId).name)}</b></span>` : '';
    if (html !== this.lastHeld) { this.held.innerHTML = html; this.held.classList.toggle('show', !!it); this.lastHeld = html; }
  }

  update(dt: number) {
    const s = this.g.model.state;
    this.day.textContent = `${s.day}日目`;
    const hh = Math.floor(s.minute / 60);
    const mm = Math.floor(s.minute % 60);
    this.clock.innerHTML = `${icon(hh >= 18 || hh < 6 ? 'moon' : 'sun')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const closeH = Math.floor(this.g.model.closeMinute() / 60);
    this.phase.textContent = s.phase === 'prep' ? '開店準備中 — 看板をOPENに' : s.phase === 'open' ? `営業中 (〜${closeH}:00)` : s.phase === 'closing' ? '閉店作業中' : '本日の営業終了';
    this.phase.className = `hud-phase ${s.phase}`;
    this.shownMoney += (s.money - this.shownMoney) * Math.min(1, dt * 8);
    if (Math.abs(this.shownMoney - s.money) < 1) this.shownMoney = s.money;
    this.money.innerHTML = `${icon('coins')} ${yen(this.shownMoney)}`;
    const stars = Math.round(s.reputation / 20 * 2) / 2;
    this.rep.innerHTML = `<span class="stars">${'★'.repeat(Math.floor(stars))}${stars % 1 ? '☆' : ''}</span><span class="dim"> 評判 ${Math.round(s.reputation)}</span>`;
    this.lvl.textContent = `Lv.${s.level}`;
    this.xpBar.style.width = `${(s.xp / this.g.model.xpForLevel(s.level)) * 100}%`;
    const objs = this.g.model.currentObjectives(3);
    const oh = `<div class="obj-title">${icon('star-formation')} 目標</div>` + objs.map((o) => `<div class="obj">・${escapeHtml(o.text)}${o.reward ? ` <span class="rw">${yen(o.reward)}</span>` : ''}</div>`).join('');
    if (oh !== this.lastObj) { this.objectives.innerHTML = oh; this.lastObj = oh; this.objectives.classList.toggle('hidden', !objs.length); }
    const cm = this.g.customers;
    const sq = cm.sellQueue.length;
    const bq = cm.buyQueue.length;
    this.queueInfo.innerHTML = s.phase === 'prep' ? '' : `<span class="${sq ? 'hot' : ''}">${icon('scales')} 買取待ち ${sq}</span><span class="${bq ? 'hot' : ''}">${icon('shopping-bag')} レジ待ち ${bq}</span><span>${icon('person')} 店内 ${cm.count}</span>`;
  }
}
