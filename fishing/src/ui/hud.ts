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
  readonly flash = h('div', { class: 'flash' });
  private lastKeys = '';

  constructor(parent: HTMLElement) {
    this.root.append(this.flash, this.status, this.crosshair, this.prompt, this.toasts, this.keys, this.fish, this.charge);
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

  setPrompt(html: string | null): void {
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
    this.charge.style.display = hud?.phase === 'charging' ? '' : 'none';
    this.crosshair.style.display = hud && hud.phase !== 'ready' && hud.phase !== 'charging' ? 'none' : '';
    if (!hud) return;
    if (hud.phase === 'charging') {
      const over = hud.charge > 1.15;
      this.charge.replaceChildren(
        bar(Math.min(1, hud.charge / 1.15), over ? 'var(--bad)' : 'var(--gold)'),
        h('div', { class: 'hint', text: over ? '力みすぎ！ 狙いがブレる' : '離してキャスト' }),
      );
    }
    const rows: (HTMLElement | null)[] = [];
    const row = (label: string, val: string) => h('div', { class: 'row' }, h('span', { class: 'label', text: label }), h('span', { class: 'val', text: val }));
    rows.push(h('div', { class: 'fh-title', text: `${hud.lureName}${hud.lureCount !== null ? ` ×${hud.lureCount}` : ''}` }));
    if (hud.fight) {
      const f = hud.fight;
      const frac = f.tension / f.lineTest;
      const col = frac > 0.85 ? 'var(--bad)' : frac > 0.6 ? 'var(--gold)' : 'var(--accent)';
      rows.push(row('ラインテンション', `${f.tension.toFixed(1)} / ${f.lineTest.toFixed(1)} kg`));
      rows.push(bar(frac, col, [f.drag / f.lineTest], 'tension'));
      rows.push(row('ドラグ（ホイール）', `${f.drag.toFixed(1)} kg${f.slipping ? '  ズズズ…' : ''}`));
      rows.push(row('出ている糸', `${f.lineOut.toFixed(0)} / ${f.capacity.toFixed(0)} m`));
      rows.push(bar(f.lineOut / f.capacity, f.lineOut / f.capacity > 0.8 ? 'var(--bad)' : '#8fa3ad'));
      if (f.wear > 0.05) rows.push(row('ライン摩耗', `${Math.round(f.wear * 100)}%`));
      if (showStamina) {
        rows.push(row('魚の勢い', ''));
        rows.push(bar(f.stamina, '#ff9f6a', [0.3]));
      }
      const side = h('div', { class: 'rodside' });
      const knob = h('i');
      knob.style.left = `${50 + f.rodSide * 50}%`;
      side.append(knob);
      rows.push(row('竿の向き（マウス左右）', ''), side);
    } else {
      if (hud.phase === 'water') {
        rows.push(row('距離', `${hud.distance.toFixed(1)} m`));
        rows.push(row('ルアーの水深', `${hud.depth.toFixed(1)} m / ${hud.waterDepth.toFixed(1)} m（${LAYER_LABEL[hud.layer]}）`));
      }
      if (hud.isBait) rows.push(row('ウキ下（R）', hud.floatDepth > 0 ? `${hud.floatDepth} m` : 'ウキなし（底）'));
    }
    this.fish.replaceChildren(...rows.filter((r): r is HTMLElement => !!r));
  }
}
