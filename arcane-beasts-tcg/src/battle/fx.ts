// ============================================================================
// FX bus: banners, callouts, sprite bursts, particles, card animations
// ============================================================================
import { create } from 'zustand';
import type { Condition, EType, Pos } from '../engine/types';
import { posKey } from '../engine/game';
import { particles } from './particles';

export type BannerKind = 'turn' | 'myturn' | 'oppturn' | 'start' | 'info' | 'good' | 'bad';

export interface Floater {
  id: number;
  x: number;
  y: number;
  kind: 'damage' | 'heal' | 'callout' | 'weak' | 'resist' | 'sprite' | 'cond' | 'ko' | 'ability' | 'pillar';
  text?: string;
  sprite?: string;
  scale?: number;
  sub?: string;
  type?: EType;
  big?: boolean;
  duration: number;
}

interface FxStore {
  banner: { id: number; text: string; kind: BannerKind } | null;
  toast: { id: number; text: string } | null;
  coin: { id: number; heads: boolean; label: string } | null;
  attack: { id: number; name: string; type: EType; side: 0 | 1 } | null;
  floaters: Floater[];
}

export const useFx = create<FxStore>(() => ({ banner: null, toast: null, coin: null, attack: null, floaters: [] }));

let seq = 1;
const later = (ms: number, f: () => void) => setTimeout(f, ms);

function stageEl(): HTMLElement | null {
  return document.querySelector('.battle-stage');
}

export function posCenter(pos: Pos): { x: number; y: number; w: number; h: number } | null {
  const st = stageEl();
  const el = document.querySelector(`[data-pos="${posKey(pos)}"] .bc-card`) ?? document.querySelector(`[data-pos="${posKey(pos)}"]`);
  if (!st || !el) return null;
  const a = st.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2, w: b.width, h: b.height };
}

function fxEl(pos: Pos): HTMLElement | null {
  return document.querySelector(`[data-pos="${posKey(pos)}"] .bc-fx`);
}

function addFloater(f: Omit<Floater, 'id'>) {
  const id = seq++;
  useFx.setState((s) => ({ floaters: [...s.floaters, { ...f, id }] }));
  later(f.duration, () => useFx.setState((s) => ({ floaters: s.floaters.filter((x) => x.id !== id) })));
}

export function shake(intensity = 1) {
  const st = document.querySelector('.battle-shake') as HTMLElement | null;
  if (!st) return;
  const k = 6 * intensity;
  st.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-k}px, ${k * 0.6}px)` },
      { transform: `translate(${k}px, ${-k * 0.4}px)` },
      { transform: `translate(${-k * 0.6}px, ${k * 0.3}px)` },
      { transform: `translate(${k * 0.3}px, 0)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: 380, easing: 'ease-out' },
  );
}

/** the light each type hits with */
const LIGHT: Record<EType, string> = {
  fire: '#ff8a2a',
  water: '#4aa8ff',
  grass: '#86e070',
  lightning: '#ffe86a',
  psychic: '#d07dff',
  fighting: '#ffb070',
  dark: '#9b6bff',
  colorless: '#ffffff',
};

/** a layered, type-specific impact on a card centred at c */
function impact(c: { x: number; y: number; w: number; h: number }, type: EType, heavy: boolean) {
  const s = c.w / 100;
  const k = heavy ? 1.5 : 1;
  const R = c.w;
  const col = LIGHT[type];
  const { x, y } = c;
  particles.flash(x, y, col, R * 1.1 * k, 0.34);
  particles.ring(x, y, col, R * 0.95 * k, 0.5, 5 * s);
  switch (type) {
    case 'fire':
      particles.burst(x, y, 'fire', Math.round(46 * k), s);
      particles.burst(x, y + c.h * 0.1, 'ember', Math.round(22 * k), s);
      later(90, () => {
        particles.flash(x, y - c.h * 0.1, '#ffb347', R * 0.8 * k, 0.4);
        particles.burst(x, y - c.h * 0.15, 'smoke', 7, s);
      });
      break;
    case 'water':
      particles.burst(x, y, 'water', Math.round(44 * k), s);
      later(80, () => particles.ring(x, y, '#9ad8ff', R * 1.3 * k, 0.55, 3 * s));
      later(120, () => particles.burst(x, y, 'steam', 7, s));
      break;
    case 'grass':
      particles.burst(x, y, 'grass', Math.round(30 * k), s);
      particles.burst(x, y, 'sparkle', 8, s * 0.8);
      later(100, () => particles.ring(x, y, '#c8ff9a', R * 1.2 * k, 0.5, 3 * s));
      break;
    case 'lightning':
      for (let i = 0; i < (heavy ? 4 : 3); i++)
        later(i * 55, () => {
          const fromX = x + (Math.random() - 0.5) * c.w * 1.4;
          particles.bolt(fromX, y - c.h * 1.5, x + (Math.random() - 0.5) * c.w * 0.3, y, '#bfe8ff', 3 * s, 0.28);
          particles.flash(x, y, '#ffffff', R * 0.9, 0.18);
        });
      particles.burst(x, y, 'lightning', Math.round(44 * k), s);
      break;
    case 'psychic':
      particles.burst(x, y, 'psychic', Math.round(36 * k), s);
      for (let i = 1; i <= 3; i++) later(i * 110, () => particles.ring(x, y, i % 2 ? '#e2a8ff' : '#ff9ae0', R * (0.7 + i * 0.3) * k, 0.6, 3 * s));
      break;
    case 'fighting':
      particles.slash(x, y, -0.6, c.w * 1.5, '#ffd9b0', 6 * s, 0.24);
      particles.burst(x, y, 'fighting', Math.round(30 * k), s);
      particles.burst(x, y + c.h * 0.35, 'dust', 12, s);
      later(70, () => particles.ring(x, y, '#ffffff', R * 1.25 * k, 0.4, 8 * s));
      break;
    case 'dark':
      particles.burst(x, y, 'darksmoke', 10, s);
      particles.burst(x, y, 'dark', Math.round(34 * k), s);
      later(90, () => particles.ring(x, y, '#c04dff', R * 1.15 * k, 0.6, 4 * s));
      break;
    case 'colorless':
      particles.slash(x, y, -0.7, c.w * 1.6, '#ffffff', 5 * s, 0.26);
      later(60, () => particles.slash(x, y, 0.7, c.w * 1.5, '#ffffff', 4 * s, 0.26));
      particles.burst(x, y, 'colorless', Math.round(34 * k), s);
      break;
  }
}

const COND_TEXT: Record<Condition, string> = { poisoned: 'どく', burned: 'やけど', asleep: 'ねむり', paralyzed: 'マヒ', confused: 'こんらん' };

export const fx = {
  banner(text: string, kind: BannerKind) {
    const id = seq++;
    useFx.setState({ banner: { id, text, kind } });
    later(kind === 'myturn' || kind === 'oppturn' ? 1150 : 1500, () => useFx.setState((s) => (s.banner?.id === id ? { banner: null } : s)));
  },
  toast(text: string) {
    const id = seq++;
    useFx.setState({ toast: { id, text } });
    later(1600, () => useFx.setState((s) => (s.toast?.id === id ? { toast: null } : s)));
  },
  coin(heads: boolean, label: string) {
    const id = seq++;
    useFx.setState({ coin: { id, heads, label } });
    later(1450, () => useFx.setState((s) => (s.coin?.id === id ? { coin: null } : s)));
  },
  deckShuffle(p: 0 | 1) {
    const el = document.querySelector(`[data-deck="${p}"]`) as HTMLElement | null;
    el?.animate(
      [{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg) translateX(-4px)' }, { transform: 'rotate(4deg) translateX(4px)' }, { transform: 'rotate(0)' }],
      { duration: 260 },
    );
  },
  dust(pos: Pos) {
    later(60, () => {
      const c = posCenter(pos);
      if (c) {
        particles.burst(c.x, c.y + c.h * 0.42, 'dust', 14, c.w / 100);
        particles.ring(c.x, c.y + c.h * 0.42, 'rgba(255,240,210,0.7)', c.w * 0.8, 0.4, 2);
      }
      const el = fxEl(pos);
      el?.animate([{ transform: 'translateY(-18px) scale(1.08)' }, { transform: 'translateY(0) scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    });
  },
  evolve(pos: Pos) {
    later(80, () => {
      const c = posCenter(pos);
      if (c) {
        const s = c.w / 100;
        // a column of light, then the new form bursts out of it
        addFloater({ kind: 'pillar', x: c.x, y: c.y, scale: c.w, duration: 1100 });
        particles.burst(c.x, c.y + c.h * 0.3, 'mote', 30, s * 1.3);
        later(380, () => {
          particles.flash(c.x, c.y, '#fff6d8', c.w * 1.4, 0.5);
          particles.ring(c.x, c.y, '#ffe9a8', c.w * 1.3, 0.6, 5 * s);
          particles.burst(c.x, c.y, 'sparkle', 34, s);
          particles.burst(c.x, c.y, 'glint', 16, s * 1.2);
        });
      }
      const el = fxEl(pos);
      el?.animate(
        [
          { filter: 'brightness(1)', transform: 'scale(1)' },
          { filter: 'brightness(2.6) saturate(0.2)', transform: 'scale(1.06)', offset: 0.35 },
          { filter: 'brightness(3) saturate(0)', transform: 'scale(1.12)', offset: 0.45 },
          { filter: 'brightness(1.3)', transform: 'scale(1.02)', offset: 0.7 },
          { filter: 'brightness(1)', transform: 'scale(1)' },
        ],
        { duration: 1100, easing: 'ease-out' },
      );
    });
  },
  energy(pos: Pos, type: EType) {
    later(250, () => {
      const c = posCenter(pos);
      if (!c) return;
      const s = c.w / 100;
      const y = c.y + c.h * 0.32;
      particles.flash(c.x, y, LIGHT[type], c.w * 0.7, 0.35);
      particles.ring(c.x, y, LIGHT[type], c.w * 0.7, 0.45, 3 * s);
      particles.burst(c.x, y, type, 16, s * 0.8);
      particles.burst(c.x, y, 'mote', 10, s);
    });
  },
  ability(pos: Pos, name: string) {
    const c = posCenter(pos);
    if (c) {
      const s = c.w / 100;
      particles.flash(c.x, c.y, '#ffb0b0', c.w * 1.1, 0.5);
      for (let i = 0; i < 2; i++) later(i * 160, () => particles.ring(c.x, c.y, '#ff8a8a', c.w * (0.9 + i * 0.4), 0.6, 3 * s));
      particles.burst(c.x, c.y, 'glint', 14, s);
      addFloater({ kind: 'ability', x: c.x, y: c.y - c.h * 0.62, text: name, duration: 1300 });
    }
  },
  callout(pos: Pos, text: string, sub: string) {
    const c = posCenter(pos);
    if (c) addFloater({ kind: 'callout', x: c.x, y: c.y - c.h * 0.2, text, sub, duration: 1100 });
  },
  attack(p: 0 | 1, name: string, type: EType) {
    const id = seq++;
    useFx.setState({ attack: { id, name, type, side: p } });
    later(1300, () => useFx.setState((s) => (s.attack?.id === id ? { attack: null } : s)));
    const el = fxEl({ p, z: 'active' });
    const dir = p === 0 ? -1 : 1;
    el?.animate(
      [
        { transform: 'translateY(0) scale(1)' },
        { transform: `translateY(${-dir * 10}px) scale(1.04) rotate(${dir * 2}deg)`, offset: 0.35 },
        { transform: `translateY(${dir * 60}px) scale(1.14)`, offset: 0.6 },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: 700, easing: 'cubic-bezier(.5,0,.3,1)', delay: 150 },
    );
  },
  hit(pos: Pos, amount: number, type: EType, o: { weak?: boolean; resist?: boolean; heavy?: boolean; source?: string }) {
    const c = posCenter(pos);
    const scale = c ? c.w / 100 : 1;
    const heavy = !!o.heavy || !!o.weak;
    if (o.source !== 'checkup') {
      if (c) impact(c, type, heavy);
      shake(o.heavy ? 1.6 : 0.8);
    } else if (c) particles.burst(c.x, c.y, type, 18, scale);
    const el = fxEl(pos);
    // the card flashes white, then shudders with a red tint
    el?.animate(
      [
        { transform: 'translateX(0)', filter: 'brightness(1)' },
        { transform: 'translateX(-10px) rotate(-2deg) scale(0.97)', filter: 'brightness(3) saturate(0)', offset: 0.08 },
        { transform: 'translateX(9px) rotate(1.5deg)', filter: 'brightness(1.15) sepia(0.5) saturate(2.5) hue-rotate(-35deg)', offset: 0.3 },
        { transform: 'translateX(-6px)', offset: 0.5 },
        { transform: 'translateX(3px)', offset: 0.7 },
        { transform: 'translateX(0)', filter: 'brightness(1)' },
      ],
      { duration: 560, easing: 'ease-out' },
    );
    if (c) {
      addFloater({ kind: 'damage', x: c.x, y: c.y - c.h * 0.1, text: String(amount), big: amount >= 100 || !!o.weak, duration: 1300 });
      if (o.weak) addFloater({ kind: 'weak', x: c.x, y: c.y - c.h * 0.55, text: '弱点！×2', duration: 1400 });
      if (o.resist) addFloater({ kind: 'resist', x: c.x, y: c.y - c.h * 0.55, text: '抵抗力 -30', duration: 1300 });
    }
  },
  heal(pos: Pos, amount: number) {
    const c = posCenter(pos);
    if (c) {
      const s = c.w / 100;
      particles.flash(c.x, c.y, '#7dffa8', c.w * 1.1, 0.6);
      particles.ring(c.x, c.y + c.h * 0.3, '#a6ffc4', c.w * 0.9, 0.7, 3 * s);
      particles.burst(c.x, c.y + c.h * 0.2, 'heal', 30, s);
      addFloater({ kind: 'heal', x: c.x, y: c.y - c.h * 0.1, text: `+${amount}`, duration: 1200 });
    }
  },
  condition(pos: Pos, cond: Condition) {
    const c = posCenter(pos);
    if (c) {
      addFloater({ kind: 'cond', x: c.x, y: c.y - c.h * 0.3, text: COND_TEXT[cond], sub: cond, duration: 1200 });
      particles.burst(c.x, c.y, cond === 'poisoned' ? 'poison' : cond === 'burned' ? 'fire' : cond === 'asleep' ? 'sleep' : cond === 'paralyzed' ? 'lightning' : 'psychic', 26, c.w / 100);
    }
  },
  ko(pos: Pos) {
    const c = posCenter(pos);
    if (c) {
      const s = c.w / 100;
      particles.flash(c.x, c.y, '#ffffff', c.w * 1.3, 0.3);
      particles.ring(c.x, c.y, '#ffffff', c.w * 1.4, 0.55, 6 * s);
      // the card crumbles into ash and light that drift up
      later(260, () => {
        particles.burst(c.x, c.y, 'ko', 50, s);
        particles.burst(c.x, c.y + c.h * 0.1, 'smoke', 12, s);
      });
      addFloater({ kind: 'ko', x: c.x, y: c.y, text: 'きぜつ！', duration: 1300 });
    }
    shake(1.2);
    const el = fxEl(pos);
    el?.animate(
      [
        { transform: 'translateY(0) rotate(0)', filter: 'grayscale(0) brightness(1)', opacity: 1 },
        { transform: 'translateY(-8px) rotate(-3deg)', filter: 'grayscale(1) brightness(2)', opacity: 1, offset: 0.2 },
        { transform: 'translateY(-4px) rotate(-2deg)', filter: 'grayscale(1) brightness(0.7)', opacity: 0.9, offset: 0.45 },
        { transform: 'translateY(24px) rotate(6deg) scale(0.92)', filter: 'grayscale(1) brightness(0.2) blur(2px)', opacity: 0 },
      ],
      { duration: 1100, easing: 'ease-in', fill: 'forwards' },
    );
  },
};
