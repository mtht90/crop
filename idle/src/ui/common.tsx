import { useEffect, useState, useRef } from 'preact/hooks';
import type { ComponentChildren, CSSProperties } from 'preact';
import { game } from '../game/store';
import { sfx, unlockAudio } from '../game/audio';
import { ALLY_BY_ID, ELEMENT_INFO, ROLE_INFO, type AllyDef } from '../data/monsters';
import { spriteUrl } from '../render/sprites';
import { ElIcon, RoleIcon, Stars } from './icons';

/** Re-render when the game changes (throttled). */
export function useGame(fps = 6) {
  const [, set] = useState(0);
  useEffect(() => {
    let pending = false;
    let last = 0;
    let timer = 0;
    const unsub = game.subscribe(() => {
      const now = performance.now();
      if (now - last > 1000 / fps) {
        last = now;
        set(game.version);
      } else if (!pending) {
        pending = true;
        timer = window.setTimeout(() => {
          pending = false;
          last = performance.now();
          set(game.version);
        }, 1000 / fps);
      }
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);
  return game.save;
}

export function Btn(props: {
  color?: 'wood' | 'red' | 'green' | 'blue' | 'gold' | 'purple' | 'white' | 'gray' | 'teal';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  children: ComponentChildren;
  class?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const { color = 'wood', size = 'md', disabled } = props;
  return (
    <button
      class={`btn btn-${color} btn-${size} ${disabled ? 'is-disabled' : ''} ${props.class ?? ''}`}
      style={props.style}
      title={props.title}
      onClick={() => {
        unlockAudio();
        if (disabled) return;
        sfx.click();
        props.onClick?.();
      }}
    >
      <span class="btn-in">{props.children}</span>
    </button>
  );
}

export function Panel(props: { kind?: 'wood' | 'gray' | 'blue' | 'note' | 'plank'; class?: string; children: ComponentChildren; style?: CSSProperties }) {
  return (
    <div class={`panel panel-${props.kind ?? 'wood'} ${props.class ?? ''}`} style={props.style}>
      {props.children}
    </div>
  );
}

export const RARITY_COLOR = ['', 'gray', 'green', 'blue', 'purple', 'gold'] as const;
export const RARITY_NAME = ['', 'N', 'R', 'SR', 'SSR', 'UR'];

export function Card(props: { rarity: number; class?: string; children: ComponentChildren; onClick?: () => void; selected?: boolean; style?: CSSProperties }) {
  return (
    <div
      class={`card card-${RARITY_COLOR[props.rarity] || 'wood'} ${props.selected ? 'is-selected' : ''} ${props.onClick ? 'is-click' : ''} ${props.class ?? ''}`}
      style={props.style}
      onClick={() => {
        if (props.onClick) {
          unlockAudio();
          sfx.click();
          props.onClick();
        }
      }}
    >
      {props.children}
    </div>
  );
}

export function Portrait(props: { ally: AllyDef; size?: number; shiny?: boolean; ghost?: boolean; class?: string }) {
  const { ally, size = 72 } = props;
  return (
    <div class={`portrait ${props.ghost ? 'ghost' : ''} ${props.shiny ? 'shiny' : ''} ${props.class ?? ''}`} style={{ width: size + 'px', height: size + 'px' }}>
      <img src={spriteUrl(ally.sprite)} alt={ally.name} loading="lazy" draggable={false} />
    </div>
  );
}

export function CharCard(props: { id: string; onClick?: () => void; selected?: boolean; badge?: ComponentChildren; small?: boolean; shiny?: boolean; ghost?: boolean; footer?: ComponentChildren }) {
  const a = ALLY_BY_ID[props.id];
  return (
    <Card rarity={a.rarity} onClick={props.onClick} selected={props.selected} class={`char-card ${props.small ? 'small' : ''}`}>
      <div class="cc-head">
        <ElIcon el={a.el} size={props.small ? 14 : 16} />
        <span class="cc-r">{RARITY_NAME[a.rarity]}</span>
      </div>
      <Portrait ally={a} size={props.small ? 56 : 70} shiny={props.shiny} ghost={props.ghost} />
      <div class="cc-name">{a.name}</div>
      {props.footer}
      {props.badge && <div class="cc-badge">{props.badge}</div>}
    </Card>
  );
}

export function AllyInfoLine({ ally }: { ally: AllyDef }) {
  return (
    <div class="ally-line">
      <span class="chip">
        <ElIcon el={ally.el} size={16} /> {ELEMENT_INFO[ally.el].name}
      </span>
      <span class="chip chip-cream">
        <RoleIcon role={ally.role} size={14} /> {ROLE_INFO[ally.role].name}
      </span>
      <Stars n={ally.rarity} />
    </div>
  );
}

export function Bar(props: { value: number; max: number; label?: ComponentChildren; class?: string }) {
  const pct = Math.max(0, Math.min(1, props.value / Math.max(1e-9, props.max))) * 100;
  return (
    <div class={`bar ${props.class ?? ''}`}>
      {pct > 2 && <div class="bar-fill" style={{ width: `calc(${pct}% + ${(12 * pct) / 100}px)` }} />}
      {props.label !== undefined && <div class="bar-label">{props.label}</div>}
    </div>
  );
}

export function Toggle(props: { on: boolean; onChange: (v: boolean) => void; label: ComponentChildren }) {
  return (
    <label
      class="toggle"
      onClick={(e) => {
        e.preventDefault();
        unlockAudio();
        sfx.click();
        props.onChange(!props.on);
      }}
    >
      <span class={`checkbox ${props.on ? 'on' : ''}`} />
      <span>{props.label}</span>
    </label>
  );
}

export function Modal(props: { title?: ComponentChildren; onClose?: () => void; children: ComponentChildren; class?: string; wide?: boolean; noClose?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && props.onClose && !props.noClose) props.onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props.onClose]);
  return (
    <div class="modal-back" onClick={(e) => e.target === ref.current && !props.noClose && props.onClose?.()} ref={ref}>
      <div class={`modal card card-wood ${props.wide ? 'wide' : ''} ${props.class ?? ''}`}>
        {props.title && <div class="modal-title">{props.title}</div>}
        {props.onClose && !props.noClose && (
          <button class="modal-x" onClick={props.onClose} aria-label="閉じる" />
        )}
        <div class="modal-body">{props.children}</div>
      </div>
    </div>
  );
}

export function SubTabs<T extends string>(props: { tabs: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div class="subtabs">
      {props.tabs.map(([k, label]) => (
        <button
          class={`subtab ${props.value === k ? 'on' : ''}`}
          onClick={() => {
            sfx.click();
            props.onChange(k);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
