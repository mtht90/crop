import { TICK_RATE, type BattleSimulation, type CardStats, type SimEvent } from '@cardbattle/sim';
import { assets, assetUrl } from '../assets/assets';
import { audio } from '../audio';
import { cardArt, FRAME_BY_RARITY } from '../assets/visuals';

const RARITY_LABEL: Record<string, string> = { common: 'コモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンド' };
const TYPE_ICON: Record<string, string> = { troop: '⚔', building: '🏰', spell: '✦' };

export interface CardSlotEl {
  el: HTMLDivElement;
  card: CardStats | null;
}

/**
 * 対戦画面の UI（DOM）。上：相手の名前・クラウン、中央上：残り時間、
 * 下：手札4枚・次のカード・マナゲージ（10分割）。
 * 見た目は仮のCSS。Kenney / LAYERLAB の素材が届いたら枠画像に差し替える。
 */
export class Hud {
  readonly slots: CardSlotEl[] = [];
  private readonly els: Record<string, HTMLElement> = {};
  private readonly manaCells: HTMLDivElement[] = [];
  private lastTimer = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly sim: BattleSimulation,
    private readonly localPlayer: number,
  ) {
    const opp = sim.players[1 - localPlayer];
    const me = sim.players[localPlayer];
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-player enemy">
          <div class="hud-name">${escapeHtml(opp.name)}</div>
          <div class="hud-crowns" data-k="oppCrowns"></div>
        </div>
        <div class="hud-timer" data-k="timerBox">
          <div class="hud-timer-label" data-k="timerLabel">残り時間</div>
          <div class="hud-timer-value" data-k="timer">3:00</div>
          <div class="hud-mult" data-k="mult"></div>
        </div>
        <div class="hud-player ally">
          <div class="hud-name">${escapeHtml(me.name)}</div>
          <div class="hud-crowns" data-k="myCrowns"></div>
        </div>
      </div>
      <div class="hud-announce" data-k="announce"></div>
      <div class="hud-bottom">
        <div class="hud-hand">
          <div class="hud-next">
            <div class="hud-next-label">NEXT</div>
            <div class="card mini" data-k="next"></div>
          </div>
          <div class="hud-cards" data-k="cards"></div>
        </div>
        <div class="hud-mana">
          <div class="hud-mana-count" data-k="manaCount">5</div>
          <div class="hud-mana-bar" data-k="manaBar"></div>
        </div>
      </div>`;
    root.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => (this.els[el.dataset.k!] = el));
    for (let i = 0; i < sim.rules.handSize; i++) {
      const el = document.createElement('div');
      el.className = 'card';
      el.dataset.slot = String(i);
      this.els.cards.appendChild(el);
      this.slots.push({ el, card: null });
    }
    for (let i = 0; i < sim.rules.maxMana; i++) {
      const cell = document.createElement('div');
      cell.className = 'mana-cell';
      cell.innerHTML = '<div class="mana-fill"></div>';
      this.els.manaBar.appendChild(cell);
      this.manaCells.push(cell);
    }
    this.renderCrowns();
  }

  /** 画面下の手札エリアが canvas の高さに占める割合（カメラ合わせ用） */
  bottomFraction(): number {
    const bottom = this.root.querySelector<HTMLElement>('.hud-bottom')!;
    const h = this.root.clientHeight || 1;
    return Math.min(0.4, (bottom.offsetHeight + 8) / h);
  }

  topFraction(): number {
    const top = this.root.querySelector<HTMLElement>('.hud-top')!;
    const h = this.root.clientHeight || 1;
    return Math.min(0.2, (top.offsetHeight + 4) / h);
  }

  private renderCrowns(): void {
    const draw = (n: number) => crownIcons(n);
    this.els.oppCrowns.innerHTML = draw(this.sim.players[1 - this.localPlayer].crowns);
    this.els.myCrowns.innerHTML = draw(this.sim.players[this.localPlayer].crowns);
  }

  handleEvents(events: readonly SimEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'crownScored') {
        this.renderCrowns();
        const box = ev.owner === this.localPlayer ? this.els.myCrowns : this.els.oppCrowns;
        box.classList.remove('pop');
        void box.offsetWidth;
        box.classList.add('pop');
        this.announce(ev.owner === this.localPlayer ? 'クラウン獲得！' : 'タワーを壊された！', ev.owner === this.localPlayer ? 'good' : 'bad', 1400);
      } else if (ev.type === 'announcement') {
        audio.play('announce', 0.8, 0);
        if (ev.kind === 'doubleMana') this.announce('残り60秒！\nマナ2倍', 'big', 2200);
        else if (ev.kind === 'overtime') this.announce('延長戦！\nサドンデス', 'big', 2600);
        else this.announce('マナ3倍！', 'big', 2000);
      }
    }
  }

  announce(text: string, cls: string, ms: number): void {
    const el = this.els.announce;
    el.className = `hud-announce show ${cls}`;
    el.textContent = text;
    window.clearTimeout((el as unknown as { _t?: number })._t);
    (el as unknown as { _t?: number })._t = window.setTimeout(() => (el.className = 'hud-announce'), ms);
  }

  update(selected: number, dragging: number): void {
    const sim = this.sim;
    const me = sim.players[this.localPlayer];
    const mana = sim.manaExact(this.localPlayer);
    const whole = Math.floor(mana);

    // マナゲージ（10分割。たまりかけのマスは途中まで塗る）
    for (let i = 0; i < this.manaCells.length; i++) {
      const fill = this.manaCells[i].firstChild as HTMLDivElement;
      const f = Math.max(0, Math.min(1, mana - i));
      fill.style.transform = `scaleX(${f})`;
      this.manaCells[i].classList.toggle('full', f >= 1);
    }
    this.els.manaCount.textContent = String(whole);

    // 手札
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const card = me.hand[i];
      if (s.card !== card) {
        s.card = card;
        renderCard(s.el, card);
        if (s.card) audio.play('card', 0.3, 80);
        s.el.classList.remove('deal');
        void s.el.offsetWidth;
        s.el.classList.add('deal');
      }
      s.el.classList.toggle('disabled', card.cost > whole);
      s.el.classList.toggle('selected', i === selected);
      s.el.classList.toggle('dragging', i === dragging);
      const missing = Math.max(0, Math.min(1, (card.cost - mana) / card.cost));
      s.el.style.setProperty('--wait', String(missing));
    }
    const next = me.queue[0];
    if (this.els.next.dataset.id !== next.id) {
      this.els.next.dataset.id = next.id;
      renderCard(this.els.next as HTMLDivElement, next);
    }

    // 残り時間
    const secs = Math.ceil(sim.ticksRemaining / TICK_RATE);
    const t = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (t !== this.lastTimer) {
      this.lastTimer = t;
      this.els.timer.textContent = t;
      this.els.timerLabel.textContent = sim.phase === 'overtime' ? '延長戦' : '残り時間';
      this.els.timerBox.classList.toggle('overtime', sim.phase === 'overtime');
      this.els.timerBox.classList.toggle('hurry', secs <= 10);
      const mult = sim.manaMultiplier;
      this.els.mult.textContent = mult > 1 ? `マナ×${mult}` : '';
    }
  }
}

export function renderCard(el: HTMLDivElement, card: CardStats): void {
  el.dataset.rarity = card.rarity;
  el.dataset.type = card.type;
  // 素材があればカードの絵（撮影した画像）と LAYERLAB の枠、無ければ種類アイコン
  const art = assets.available
    ? `<img class="card-img" src="${assetUrl(cardArt(card.id, card.type))}" alt="" draggable="false">
       <img class="card-frame" src="${assetUrl(FRAME_BY_RARITY[card.rarity])}" alt="" draggable="false">`
    : `<div class="card-art"><span class="card-icon">${TYPE_ICON[card.type] ?? '?'}</span></div>`;
  el.innerHTML = `
    ${art}
    <div class="card-name">${escapeHtml(card.name)}</div>
    <div class="card-cost">${card.cost}</div>
    <div class="card-wait"></div>`;
  el.title = `${card.name}（${RARITY_LABEL[card.rarity] ?? card.rarity}）`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** クラウン3つ分のアイコン（Kenney UI Pack の星。素材が無ければ文字） */
export function crownIcons(n: number): string {
  return [0, 1, 2].map((i) => `<span class="crown ${i < n ? 'on' : ''}"><i></i></span>`).join('');
}
