// Hand-made SVG icons drawn in the Cozy UI style: chunky brown outline, flat fills, one soft highlight.
import type { CSSProperties } from 'preact';

const O = '#7a4134'; // outline (matches Cozy UI)
const SW = 3;

type P = { size?: number; class?: string; style?: CSSProperties };

function Svg({ size = 24, children, class: cls, style }: P & { children: any }) {
  return (
    <svg class={'ico ' + (cls ?? '')} style={style} width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={O} stroke-width={SW} stroke-linejoin="round" stroke-linecap="round">
      {children}
    </svg>
  );
}
const HL = (d: string) => <path d={d} stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" />;

// ---------- currencies ----------
export const Coin = (p: P) => (
  <Svg {...p}>
    <circle cx="24" cy="25" r="17" fill="#e9a72f" />
    <circle cx="24" cy="23" r="17" fill="#ffd34d" />
    <path d="M24 13l3 6.2 6.8 1-4.9 4.7 1.2 6.7L24 28.4l-6.1 3.2 1.2-6.7-4.9-4.7 6.8-1z" fill="#f6b73c" stroke-width="2.4" />
    {HL('M13 17a12 12 0 0 1 7-6')}
  </Svg>
);
export const Gem = (p: P) => (
  <Svg {...p}>
    <path d="M12 18l6-9h12l6 9-12 22z" fill="#5fd0e8" />
    <path d="M12 18h24M18 9l6 9 6-9M24 18v22" stroke-width="2.2" />
    <path d="M24 18l-6-9-6 9z" fill="#a8ecf7" stroke-width="2.2" />
    {HL('M15 20l6 10')}
  </Svg>
);
export const Soul = (p: P) => (
  <Svg {...p}>
    <path d="M24 42c-8 0-13-6-12-13 1-6 6-8 7-14 4 3 4 7 3 9 3-1 6-5 5-11 6 4 10 10 9 17-1 7-5 12-12 12z" fill="#b98cff" />
    <path d="M24 38c-4 0-6-3-5-6 1-3 3-4 4-7 3 3 6 5 6 8 0 3-2 5-5 5z" fill="#efe1ff" stroke-width="2.4" />
  </Svg>
);
export const Orb = (p: P) => (
  <Svg {...p}>
    <circle cx="24" cy="24" r="16" fill="#9a6be0" />
    <circle cx="24" cy="24" r="10" fill="#c9a8ff" stroke="none" />
    <path d="M24 16c3 3 3 6 0 8s-3 5 0 8" stroke="#fff" stroke-width="2.5" stroke-opacity=".8" />
    {HL('M14 19a11 11 0 0 1 6-6')}
  </Svg>
);

// ---------- elements ----------
export const ElIcon = ({ el, ...p }: P & { el: string }) => {
  switch (el) {
    case 'fire':
      return (
        <Svg {...p}>
          <path d="M24 43c-8 0-13-6-12-13 1-7 7-9 7-17 5 3 7 8 6 12 3-1 5-4 5-8 5 4 8 9 7 15-1 7-6 11-13 11z" fill="#f0643c" />
          <path d="M24 39c-4 0-6-3-5-6s4-4 4-7c3 2 6 5 6 8s-2 5-5 5z" fill="#ffd34d" stroke-width="2.4" />
        </Svg>
      );
    case 'water':
      return (
        <Svg {...p}>
          <path d="M24 6c6 9 13 16 13 24a13 13 0 0 1-26 0c0-8 7-15 13-24z" fill="#3d9be0" />
          {HL('M17 29a8 8 0 0 0 5 8')}
        </Svg>
      );
    case 'wind':
      return (
        <Svg {...p}>
          <path d="M8 34C8 16 22 8 40 8c0 18-10 32-26 32-2 0-4 0-6-6z" fill="#4dbb73" />
          <path d="M12 38c6-10 14-18 24-24" stroke-width="2.6" />
          {HL('M18 20c3-4 8-7 14-8')}
        </Svg>
      );
    case 'earth':
      return (
        <Svg {...p}>
          <path d="M5 38l12-20 7 9 6-12 13 23z" fill="#b98a45" />
          <path d="M26 15l4 6M12 26l5-8 3 4" stroke-width="2.4" stroke="#fff" stroke-opacity=".55" />
        </Svg>
      );
    case 'light':
      return (
        <Svg {...p}>
          <path d="M24 4l4 10 10-4-4 10 10 4-10 4 4 10-10-4-4 10-4-10-10 4 4-10-10-4 10-4-4-10 10 4z" fill="#f2c23b" />
          <circle cx="24" cy="24" r="7" fill="#fff3b0" stroke-width="2.4" />
        </Svg>
      );
    default:
      return (
        <Svg {...p}>
          <path d="M30 6a18 18 0 1 0 12 28A15 15 0 0 1 30 6z" fill="#8b5cc7" />
          <path d="M36 12l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" fill="#efe1ff" stroke-width="2" />
        </Svg>
      );
  }
};

// ---------- roles ----------
export const RoleIcon = ({ role, ...p }: P & { role: string }) => {
  switch (role) {
    case 'blade':
      return <EquipIcon shape="sword:iron" {...p} />;
    case 'archer':
      return <EquipIcon shape="bow:wood" {...p} />;
    case 'mage':
      return <EquipIcon shape="staff:wood" {...p} />;
    default:
      return <EquipIcon shape="shield:iron" {...p} />;
  }
};

// ---------- equipment ----------
const TIER: Record<string, [string, string]> = {
  wood: ['#d39a62', '#a96d3f'],
  iron: ['#c3ccd6', '#8e9aa8'],
  silver: ['#e8f1fb', '#9fc3e6'],
  gold: ['#ffd34d', '#e0a12a'],
  mythic: ['#d6a8ff', '#9a6be0'],
};
export const EquipIcon = ({ shape, ...p }: P & { shape: string }) => {
  const [kind, tier] = shape.split(':');
  const [a, b] = TIER[tier] ?? TIER.iron;
  const grip = '#8a5a3a';
  const sparkle = tier === 'mythic' ? <path d="M38 8l1.5 3.5L43 13l-3.5 1.5L38 18l-1.5-3.5L33 13l3.5-1.5z" fill="#fff" stroke-width="1.8" /> : null;
  switch (kind) {
    case 'sword':
      return (
        <Svg {...p}>
          <path d="M33 6l8 1 1 8-20 20-9-9z" fill={a} />
          <path d="M38 10L19 29" stroke={b} stroke-width="2.4" />
          <path d="M9 28l11 11-3 3-11-11z" fill={b} />
          <path d="M11 35l-5 5 2 2 5-5" fill={grip} />
          {sparkle}
        </Svg>
      );
    case 'dagger':
      return (
        <Svg {...p}>
          <path d="M30 8l8 0 0 8-14 14-8-8z" fill={a} />
          <path d="M12 24l12 12-3 3-12-12z" fill={b} />
          <path d="M13 33l-6 6 2 2 6-6" fill={grip} />
          {sparkle}
        </Svg>
      );
    case 'axe':
      return (
        <Svg {...p}>
          <path d="M14 40L34 12" stroke-width="5" />
          <path d="M14 40L34 12" stroke={grip} stroke-width="2.4" />
          <path d="M27 9c8-3 15 3 14 12l-12-1z" fill={a} />
          <path d="M30 13c4-1 7 1 8 4" stroke="#fff" stroke-opacity=".6" />
          {sparkle}
        </Svg>
      );
    case 'spear':
      return (
        <Svg {...p}>
          <path d="M8 40L32 16" stroke-width="5" />
          <path d="M8 40L32 16" stroke={grip} stroke-width="2.4" />
          <path d="M30 12l12-6-6 12-4 2-4-4z" fill={a} />
          <path d="M26 18l4 4" stroke-width="4" />
          {sparkle}
        </Svg>
      );
    case 'bow':
      return (
        <Svg {...p}>
          <path d="M12 6c18 4 26 14 30 30" fill="none" stroke-width="7" />
          <path d="M12 6c18 4 26 14 30 30" fill="none" stroke={a} stroke-width="3.5" />
          <path d="M12 6l30 30" stroke-width="1.8" />
          <path d="M8 40l20-20M24 18l6 2-2-6" stroke-width="2.4" fill={b} />
          {sparkle}
        </Svg>
      );
    case 'staff':
      return (
        <Svg {...p}>
          <path d="M10 42L30 18" stroke-width="5" />
          <path d="M10 42L30 18" stroke={grip} stroke-width="2.4" />
          <circle cx="33" cy="14" r="8" fill={a} />
          <circle cx="33" cy="14" r="3.5" fill="#fff" stroke="none" />
          {sparkle}
        </Svg>
      );
    case 'armor':
      return (
        <Svg {...p}>
          <path d="M14 8l6 3h8l6-3 8 7-4 7-3-2v20H13V20l-3 2-4-7z" fill={a} />
          <path d="M20 11c0 5 8 5 8 0M24 16v24" stroke={b} stroke-width="2.4" />
          {sparkle}
        </Svg>
      );
    case 'robe':
      return (
        <Svg {...p}>
          <path d="M18 7h12l4 8 6 25H8l6-25z" fill={a} />
          <path d="M18 7c1 5 11 5 12 0M24 15v25" stroke={b} stroke-width="2.4" />
          <path d="M10 33h28" stroke={b} stroke-width="2.4" />
          {sparkle}
        </Svg>
      );
    case 'shield':
      return (
        <Svg {...p}>
          <path d="M24 5l16 6c0 14-5 25-16 32C13 36 8 25 8 11z" fill={a} />
          <path d="M24 11l10 4c0 9-3 16-10 21-7-5-10-12-10-21z" fill={b} stroke-width="2.4" />
          {sparkle}
        </Svg>
      );
    case 'helm':
      return (
        <Svg {...p}>
          <path d="M8 30c0-12 7-20 16-20s16 8 16 20v8H8z" fill={a} />
          <path d="M14 26h20v6H14z" fill={b} stroke-width="2.4" />
          <path d="M24 4v6" stroke-width="5" />
          {sparkle}
        </Svg>
      );
    case 'ring':
      return (
        <Svg {...p}>
          <circle cx="24" cy="29" r="12" fill="none" stroke-width="8" />
          <circle cx="24" cy="29" r="12" fill="none" stroke={b} stroke-width="3.5" />
          <path d="M17 13l7-7 7 7-7 7z" fill={a} />
          {sparkle}
        </Svg>
      );
    case 'amulet':
      return (
        <Svg {...p}>
          <path d="M12 6c0 10 6 14 12 14s12-4 12-14" fill="none" stroke-width="2.6" />
          <path d="M24 18l10 10-10 14-10-14z" fill={a} />
          <path d="M24 24l4 4-4 6-4-6z" fill={b} stroke-width="2" />
          {sparkle}
        </Svg>
      );
    case 'feather':
      return (
        <Svg {...p}>
          <path d="M38 6C22 8 12 20 12 36l4-2C24 30 34 20 38 6z" fill={a} />
          <path d="M8 42l26-30" stroke-width="2.4" />
          <path d="M20 26l8 1M17 31l7 1" stroke={b} stroke-width="2.2" />
          {sparkle}
        </Svg>
      );
    default: // gem
      return (
        <Svg {...p}>
          <path d="M10 18l7-9h14l7 9-14 22z" fill={a} />
          <path d="M10 18h28M17 9l7 9 7-9M24 18v22" stroke={b} stroke-width="2.2" />
          {sparkle}
        </Svg>
      );
  }
};

// ---------- skills ----------
export const SkillIcon = ({ kind, color, ...p }: P & { kind: string; color: string }) => {
  const c = color;
  switch (kind) {
    case 'strike':
      return (
        <Svg {...p}>
          <path d="M24 4l5 12 13-3-9 10 9 10-13-3-5 12-5-12-13 3 9-10-9-10 13 3z" fill={c} />
          <circle cx="24" cy="24" r="6" fill="#fff" stroke-width="2.2" />
        </Svg>
      );
    case 'nova':
      return (
        <Svg {...p}>
          <circle cx="24" cy="24" r="18" fill={c} />
          <circle cx="24" cy="24" r="11" fill="#fff" fill-opacity=".55" stroke-width="2.4" />
          <circle cx="24" cy="24" r="4" fill="#fff" stroke-width="2" />
        </Svg>
      );
    case 'bolt':
      return (
        <Svg {...p}>
          <path d="M28 4L10 27h12l-4 17 20-25H26z" fill={c} />
          {HL('M24 11l-7 11')}
        </Svg>
      );
    case 'heal':
      return (
        <Svg {...p}>
          <path d="M24 41S6 30 6 18c0-6 4-10 9-10 4 0 7 2 9 6 2-4 5-6 9-6 5 0 9 4 9 10 0 12-18 23-18 23z" fill={c} />
          <path d="M24 17v14M17 24h14" stroke="#fff" stroke-width="4" />
        </Svg>
      );
    case 'buff':
      return (
        <Svg {...p}>
          <path d="M24 5l15 17h-9v20H18V22H9z" fill={c} />
          {HL('M24 12l-7 8')}
        </Svg>
      );
    case 'shield':
      return (
        <Svg {...p}>
          <circle cx="24" cy="24" r="18" fill={c} fill-opacity=".85" />
          <path d="M24 13l8 3c0 7-2 12-8 16-6-4-8-9-8-16z" fill="#fff" stroke-width="2.4" />
        </Svg>
      );
    case 'freeze':
      return (
        <Svg {...p}>
          <circle cx="24" cy="24" r="18" fill={c} />
          <path d="M24 10v28M12 17l24 14M12 31l24-14" stroke="#fff" stroke-width="3" />
          <path d="M24 10v28M12 17l24 14M12 31l24-14" stroke-width="1" />
        </Svg>
      );
    case 'drain':
      return (
        <Svg {...p}>
          <path d="M10 10c10 2 18 8 20 18-6-3-12-3-16 2 0-8-2-14-4-20z" fill={c} />
          <path d="M33 25c3 5 7 8 7 12a5 5 0 0 1-10 0c0-4 2-7 3-12z" fill="#ff6b7d" />
        </Svg>
      );
    default: // meteor
      return (
        <Svg {...p}>
          <path d="M6 6l20 12M10 4l16 10M4 12l18 10" stroke={c} stroke-width="4" />
          <circle cx="31" cy="31" r="12" fill={c} />
          <circle cx="28" cy="28" r="4" fill="#fff" stroke-width="2" />
        </Svg>
      );
  }
};

// ---------- tabs & misc ----------
export const TabIcon = ({ name, ...p }: P & { name: string }) => {
  switch (name) {
    case 'train':
      return (
        <Svg {...p}>
          <path d="M10 18h6v12h-6zM32 18h6v12h-6z" fill="#c3ccd6" />
          <path d="M4 21h6v6H4zM38 21h6v6h-6z" fill="#8e9aa8" />
          <path d="M16 24h16" stroke-width="5" />
          <path d="M16 24h16" stroke="#d39a62" stroke-width="2.2" />
        </Svg>
      );
    case 'chars':
      return (
        <Svg {...p}>
          <path d="M10 40c-2-12 4-26 14-26s16 14 14 26z" fill="#ffd1a8" />
          <path d="M14 18l-4-10 10 6M34 18l4-10-10 6" fill="#ffb27a" />
          <circle cx="19" cy="27" r="2.5" fill={O} stroke="none" />
          <circle cx="29" cy="27" r="2.5" fill={O} stroke="none" />
          <path d="M21 33c2 2 4 2 6 0" stroke-width="2.4" />
        </Svg>
      );
    case 'gear':
      return (
        <Svg {...p}>
          <path d="M24 6l14 5c0 12-4 22-14 29C14 33 10 23 10 11z" fill="#9fc3e6" />
          <path d="M31 8l7 1 1 7-15 15-7-7z" fill="#e8f1fb" />
          <path d="M14 26l8 8-3 3-8-8z" fill="#d39a62" />
        </Svg>
      );
    case 'guardian':
      return (
        <Svg {...p}>
          <path d="M10 40V22a14 14 0 0 1 28 0v18l-5-4-5 4-4-4-4 4-5-4z" fill="#d7f5ff" />
          <circle cx="19" cy="22" r="2.6" fill={O} stroke="none" />
          <circle cx="29" cy="22" r="2.6" fill={O} stroke="none" />
          <path d="M20 29c2 2 6 2 8 0" stroke-width="2.4" />
        </Svg>
      );
    case 'gacha':
      return (
        <Svg {...p}>
          <circle cx="24" cy="24" r="18" fill="#9a6be0" />
          <circle cx="24" cy="24" r="12" fill="none" stroke="#efe1ff" stroke-width="2" stroke-dasharray="3 3" />
          <path d="M24 12l3.2 7 7.6.8-5.7 5 1.7 7.4L24 28.5l-6.6 3.7 1.7-7.4-5.7-5 7.6-.8z" fill="#ffd34d" stroke-width="2.2" />
        </Svg>
      );
    case 'more':
      return (
        <Svg {...p}>
          <path d="M8 10h32v28H8z" fill="#fff6dc" />
          <path d="M14 18h20M14 25h20M14 32h12" stroke-width="2.6" />
        </Svg>
      );
    case 'chest':
      return (
        <Svg {...p}>
          <path d="M6 22h36v18H6z" fill="#c97b45" />
          <path d="M6 22c0-8 6-13 18-13s18 5 18 13z" fill="#e39a5a" />
          <path d="M6 22h36M18 10v30M30 10v30" stroke-width="2.2" />
          <path d="M20 20h8v8h-8z" fill="#ffd34d" stroke-width="2.2" />
        </Svg>
      );
    case 'scroll':
      return (
        <Svg {...p}>
          <path d="M12 8h24v32H12z" fill="#fff6dc" />
          <path d="M8 8h8v6H8zM32 34h8v6h-8z" fill="#e3c08e" />
          <path d="M17 17h14M17 23h14M17 29h9" stroke-width="2.4" />
        </Svg>
      );
    case 'speed':
      return (
        <Svg {...p}>
          <path d="M6 10l16 14-16 14zM24 10l16 14-16 14z" fill="#ffd34d" />
        </Svg>
      );
    case 'sword':
      return <EquipIcon shape="sword:iron" {...p} />;
    case 'heart':
      return (
        <Svg {...p}>
          <path d="M24 41S6 30 6 18c0-6 4-10 9-10 4 0 7 2 9 6 2-4 5-6 9-6 5 0 9 4 9 10 0 12-18 23-18 23z" fill="#ff6b7d" />
          {HL('M12 17c0-3 2-5 4-5')}
        </Svg>
      );
    case 'crit':
      return (
        <Svg {...p}>
          <circle cx="24" cy="24" r="17" fill="#fff6dc" />
          <circle cx="24" cy="24" r="10" fill="#ff8a5c" />
          <circle cx="24" cy="24" r="3.5" fill="#fff" stroke-width="2" />
        </Svg>
      );
    case 'critDmg':
      return (
        <Svg {...p}>
          <path d="M24 4l5 12 13-3-9 10 9 10-13-3-5 12-5-12-13 3 9-10-9-10 13 3z" fill="#ff8a5c" />
          <circle cx="24" cy="24" r="5" fill="#fff" stroke-width="2" />
        </Svg>
      );
    case 'lock':
      return (
        <Svg {...p}>
          <path d="M15 22v-6a9 9 0 0 1 18 0v6" fill="none" stroke-width="4" />
          <path d="M11 22h26v18H11z" fill="#d39a62" />
          <circle cx="24" cy="30" r="3" fill={O} stroke="none" />
        </Svg>
      );
    case 'cycle':
      return (
        <Svg {...p}>
          <path d="M38 22A14 14 0 0 0 12 16" fill="none" stroke-width="5" />
          <path d="M10 26a14 14 0 0 0 26 6" fill="none" stroke-width="5" />
          <path d="M38 22A14 14 0 0 0 12 16M10 26a14 14 0 0 0 26 6" fill="none" stroke="#b98cff" stroke-width="2.2" />
          <path d="M8 10l4 7 7-3M40 38l-4-7-7 3" stroke-width="3" />
        </Svg>
      );
    case 'book':
      return (
        <Svg {...p}>
          <path d="M6 10c6-2 12-2 18 2v28c-6-4-12-4-18-2z" fill="#9fc3e6" />
          <path d="M42 10c-6-2-12-2-18 2v28c6-4 12-4 18-2z" fill="#e8f1fb" />
        </Svg>
      );
    case 'settings':
      return (
        <Svg {...p}>
          <path d="M21 5h6l1 5 4 2 4-3 4 4-3 4 2 4 5 1v6l-5 1-2 4 3 4-4 4-4-3-4 2-1 5h-6l-1-5-4-2-4 3-4-4 3-4-2-4-5-1v-6l5-1 2-4-3-4 4-4 4 3 4-2z" fill="#c3ccd6" />
          <circle cx="24" cy="24" r="6" fill="#fff6dc" />
        </Svg>
      );
    case 'star':
      return (
        <Svg {...p}>
          <path d="M24 5l5.5 12 13 1.4-9.8 8.8 2.8 12.8L24 33.4 12.5 40l2.8-12.8-9.8-8.8 13-1.4z" fill="#ffd34d" />
          {HL('M17 20l4-1')}
        </Svg>
      );
    case 'clock':
      return (
        <Svg {...p}>
          <circle cx="24" cy="24" r="17" fill="#fff6dc" />
          <path d="M24 13v12l7 5" stroke-width="3.2" />
        </Svg>
      );
    case 'skull':
      return (
        <Svg {...p}>
          <path d="M10 22c0-9 6-15 14-15s14 6 14 15c0 5-3 8-5 9v7H15v-7c-2-1-5-4-5-9z" fill="#f2ebe0" />
          <circle cx="18" cy="23" r="4" fill={O} stroke="none" />
          <circle cx="30" cy="23" r="4" fill={O} stroke="none" />
          <path d="M20 38v-4M24 38v-4M28 38v-4" stroke-width="2.2" />
        </Svg>
      );
    default:
      return (
        <Svg {...p}>
          <circle cx="24" cy="24" r="16" fill="#fff6dc" />
        </Svg>
      );
  }
};

export const Stars = ({ n, max = 5, size = 12 }: { n: number; max?: number; size?: number }) => (
  <span class="stars">
    {Array.from({ length: max }, (_, i) => (
      <svg width={size} height={size} viewBox="0 0 48 48" class={i < n ? 'on' : 'off'}>
        <path d="M24 5l5.5 12 13 1.4-9.8 8.8 2.8 12.8L24 33.4 12.5 40l2.8-12.8-9.8-8.8 13-1.4z" stroke={O} stroke-width="4" stroke-linejoin="round" />
      </svg>
    ))}
  </span>
);
