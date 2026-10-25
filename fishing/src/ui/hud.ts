import { LAYER_LABEL, SEASON_LABEL, TIME_LABEL, WEATHER_LABEL, type Season, type TimeBand, type Weather } from '../data/types';
import type { FishingHud } from '../fishing/fishing';
import { bar, h, yen } from './dom';

const WEATHER_ICON: Record<Weather, string> = { sunny: '☀', cloudy: '☁', rain: '☂', storm: '⛈', fog: '🌫' };

/** 常時表示のHUD */
export class Hud {
  readonly root = h('div');
  private status = h('div', { class: 'status' });
  private prompt = h('div', { class: 'prompt' });
  private toasts = h('div', { class: 'toasts' });
  private keys = h('div', { class: 'keys' });
  private fish = h('div', { class: 'fishhud' });
  private charge = h('div', { class: 'charge' });
  private crosshair = h('div', { class: 'crosshair' });
  private guide = h('div', { class: 'guide' });
  private lastGuide = '';
  readonly flash = h('div', { class: 'flash' });
  private lastKeys = '';

  constructor(parent: HTMLElement) {
    this.root.append(this.flash, this.status, this.crosshair, this.guide, this.prompt, this.toasts, this.keys, this.fish, this.charge);
    parent.append(this.root);
    this.setPrompt(null);
    this.setFishing(null, true);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  setStatus(o: { day: number; clock: string; time: TimeBand; weather: Weather; season: Season; money: number; cooler: string }): void {
    this.status.replaceChildren(
      h('span', { class: 'chip' }, `${o.day}日目・${SEASON_LABEL[o.season]}`),
      h('span', { class: 'chip' }, `${o.clock}  ${TIME_LABEL[o.time]}`),
      h('span', { class: 'chip' }, `${WEATHER_ICON[o.weather]} ${WEATHER_LABEL[o.weather]}`),
      h('span', { class: 'chip money' }, yen(o.money)),
      h('span', { class: 'chip' }, `クーラー ${o.cooler}`),
    );
  }

  /** 「次にやること」の案内 */
  setGuide(text: string | null): void {
    this.guide.style.display = text ? '' : 'none';
    if (!text || text === this.lastGuide) return;
    this.lastGuide = text;
    this.guide.textContent = text;
    this.guide.classList.toggle('hot', text.startsWith('竿先が入った') || text.startsWith('おとなしくなった'));
  }

  setPrompt(html: string | null): void {
    // タッチ操作ではキー表示を出さない
    if (html && document.body.classList.contains('is-touch')) html = html.replace(/<b>\[[A-Z]\]<\/b>\s*/, '');
    this.prompt.style.display = html ? '' : 'none';
    if (html) this.prompt.innerHTML = html;
  }

  setKeys(lines: [string, string][]): void {
    const key = lines.map((l) => l.join(':')).join('|');
    if (key === this.lastKeys) return;
    this.lastKeys = key;
    this.keys.replaceChildren(...lines.map(([k, v]) => h('div', null, ...k.split(' ').map((x) => h('b', { text: x })), v)));
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'big' = 'info'): void {
    const el = h('div', { class: `toast ${kind}`, text });
    this.toasts.append(el);
    while (this.toasts.children.length > 5) this.toasts.firstElementChild?.remove();
    setTimeout(() => (el.style.opacity = '0'), kind === 'big' ? 1200 : 2400);
    setTimeout(() => el.remove(), kind === 'big' ? 1700 : 2900);
  }

  setFishing(hud: FishingHud | null, showStamina: boolean): void {
    this.fish.style.display = hud ? '' : 'none';
    this.charge.style.display = 'none';
    this.crosshair.style.display = hud && hud.phase !== 'ready' && hud.phase !== 'aiming' ? 'none' : '';
    if (!hud) return;
    const rows: (HTMLElement | null)[] = [];
    const row = (label: string, val: string) => h('div', { class: 'row' }, h('span', { class: 'label', text: label }), h('span', { class: 'val', text: val }));
    rows.push(h('div', { class: 'fh-title', text: `${hud.lureName}${hud.lureCount !== null ? ` ×${hud.lureCount}` : ''}` }));
    // 竿の角度（立てる↑／寝かせる↓）
    if (hud.phase === 'water') {
      const g = h('div', { class: `rodgauge${hud.rodHigh ? ' danger' : ''}` });
      const k = h('i');
      k.style.bottom = `${hud.rodLift * 100}%`;
      g.append(h('span', { class: 'rg-high' }), k);
      rows.push(h('div', { class: 'row' }, h('span', { class: 'label', text: '竿の角度' }), h('span', { class: 'val', text: hud.rodLift > 0.62 ? '立てている' : hud.rodLift < 0.25 ? '寝かせている' : '中間' })), g);
    }
    if (hud.chase !== null) {
      rows.push(h('div', { class: 'row' }, h('span', { class: 'label', text: '魚の食い気' }), h('span', { class: 'val', text: ''})));
      rows.push(bar(hud.chase, hud.chase > 0.75 ? 'var(--gold)' : '#ffb27a'));
    }
    if (hud.phase === 'water' && hud.slack > 1) rows.push(row('糸ふけ', `${hud.slack.toFixed(1)} m`));
    if (hud.fight) {
      // ファイト中は糸の張りだけ。あとは竿のしなりと魚の動きで判断する
      const f = hud.fight;
      const frac = f.tension / f.lineTest;
      const col = frac > 0.85 ? 'var(--bad)' : frac > 0.6 ? 'var(--gold)' : 'var(--accent)';
      rows.push(row('糸の張り', f.slipping ? 'ドラグが出ている' : ''));
      rows.push(bar(frac, col, [f.drag / f.lineTest], 'tension'));
      rows.push(row('ドラグ（ホイール）', `${f.drag.toFixed(1)} kg`));
      if (f.lineOut / f.capacity > 0.6) {
        rows.push(row('残りの糸', `${Math.max(0, f.capacity - f.lineOut).toFixed(0)} m`));
        rows.push(bar(f.lineOut / f.capacity, 'var(--bad)'));
      }
      if (f.wear > 0.05) rows.push(row('糸の傷み', `${Math.round(f.wear * 100)}%`));
      if (showStamina) {
        rows.push(row('魚の勢い', ''));
        rows.push(bar(f.stamina, '#ff9f6a', [0.3]));
      }
    } else {
      if (hud.phase === 'water') {
        rows.push(row('距離', `${hud.distance.toFixed(1)} m`));
        rows.push(row('ルアーの水深', `${hud.depth.toFixed(1)} m / ${hud.waterDepth.toFixed(1)} m（${LAYER_LABEL[hud.layer]}）`));
      }
      if (hud.isBait) rows.push(row(document.body.classList.contains('is-touch') ? 'ウキ下' : 'ウキ下（R）', hud.floatDepth > 0 ? `${hud.floatDepth} m` : 'ウキなし（底）'));
    }
    this.fish.replaceChildren(...rows.filter((r): r is HTMLElement => !!r));
  }
}
