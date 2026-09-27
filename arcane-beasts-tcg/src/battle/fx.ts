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
  kind: 'damage' | 'heal' | 'callout' | 'weak' | 'resist' | 'sprite' | 'cond' | 'ko' | 'ability';
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

function sprite(pos: Pos, name: string, scale = 1.6, duration = 700, dy = 0) {
  const c = posCenter(pos);
  if (!c) return;
  addFloater({ kind: 'sprite', x: c.x, y: c.y + dy * c.h, sprite: name, scale: (scale * c.w) / 100, duration });
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

const TYPE_SPRITE: Record<EType, [string, number][]> = {
  fire: [['fire', 2.2], ['flame', 1.3]],
  water: [['water', 2.6], ['ice', 1.8]],
  grass: [['grass', 2.6]],
  lightning: [['lightning', 0.9]],
  psychic: [['psychic', 2.4]],
  fighting: [['impact', 2.2], ['smoke', 2.2]],
  dark: [['darkburst', 2.4], ['dark', 2.6]],
  colorless: [['impact', 2.2]],
};

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
      if (c) particles.burst(c.x, c.y + c.h * 0.4, 'dust', 14, c.w / 100);
      const el = fxEl(pos);
      el?.animate([{ transform: 'translateY(-18px) scale(1.08)' }, { transform: 'translateY(0) scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    });
  },
  evolve(pos: Pos) {
    later(80, () => {
      sprite(pos, 'holy', 0.7, 900, -0.2);
      const c = posCenter(pos);
      if (c) particles.burst(c.x, c.y, 'sparkle', 40, c.w / 100);
      const el = fxEl(pos);
      el?.animate(
        [
          { filter: 'brightness(1)', transform: 'scale(1)' },
          { filter: 'brightness(3) saturate(0)', transform: 'scale(1.12)' },
          { filter: 'brightness(1.4)', transform: 'scale(1.02)' },
          { filter: 'brightness(1)', transform: 'scale(1)' },
        ],
        { duration: 1000, easing: 'ease-out' },
      );
    });
  },
  energy(pos: Pos, type: EType) {
    later(250, () => {
      sprite(pos, 'staff', 2.2, 500, 0.3);
      const c = posCenter(pos);
      if (c) particles.burst(c.x, c.y + c.h * 0.35, type, 16, c.w / 100);
    });
  },
  ability(pos: Pos, name: string) {
    sprite(pos, 'flare', 2.6, 900);
    const c = posCenter(pos);
    if (c) addFloater({ kind: 'ability', x: c.x, y: c.y - c.h * 0.62, text: name, duration: 1300 });
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
    if (o.source !== 'checkup') {
      for (const [s, k] of TYPE_SPRITE[type]) sprite(pos, s, k, 750);
      if (c) particles.burst(c.x, c.y, type, o.heavy ? 70 : 40, scale);
      shake(o.heavy ? 1.6 : 0.8);
    } else if (c) particles.burst(c.x, c.y, type, 18, scale);
    const el = fxEl(pos);
    el?.animate(
      [
        { transform: 'translateX(0)', filter: 'brightness(1)' },
        { transform: 'translateX(-10px) rotate(-2deg)', filter: 'brightness(2.2) sepia(1) hue-rotate(-50deg) saturate(4)' },
        { transform: 'translateX(9px) rotate(1.5deg)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(3px)' },
        { transform: 'translateX(0)', filter: 'brightness(1)' },
      ],
      { duration: 520, easing: 'ease-out' },
    );
    if (c) {
      addFloater({ kind: 'damage', x: c.x, y: c.y - c.h * 0.1, text: String(amount), big: amount >= 100 || !!o.weak, duration: 1300 });
      if (o.weak) addFloater({ kind: 'weak', x: c.x, y: c.y - c.h * 0.55, text: '弱点！×2', duration: 1400 });
      if (o.resist) addFloater({ kind: 'resist', x: c.x, y: c.y - c.h * 0.55, text: '抵抗力 -30', duration: 1300 });
    }
  },
  heal(pos: Pos, amount: number) {
    sprite(pos, 'heal', 2.4, 800);
    const c = posCenter(pos);
    if (c) {
      particles.burst(c.x, c.y, 'heal', 24, c.w / 100);
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
    sprite(pos, 'smoke', 3, 1000);
    if (c) {
      particles.burst(c.x, c.y, 'ko', 60, c.w / 100);
      addFloater({ kind: 'ko', x: c.x, y: c.y, text: 'きぜつ！', duration: 1300 });
    }
    shake(1.2);
    const el = fxEl(pos);
    el?.animate(
      [
        { transform: 'translateY(0) rotate(0)', filter: 'grayscale(0) brightness(1)', opacity: 1 },
        { transform: 'translateY(-8px) rotate(-3deg)', filter: 'grayscale(1) brightness(1.6)', opacity: 1, offset: 0.25 },
        { transform: 'translateY(30px) rotate(8deg) scale(0.9)', filter: 'grayscale(1) brightness(0.3)', opacity: 0 },
      ],
      { duration: 1100, easing: 'ease-in', fill: 'forwards' },
    );
  },
};
