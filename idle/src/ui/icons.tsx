// Icon components. Every icon is an external image: game-icons.net glyphs (recolored and outlined in
// the Cozy UI style at build time) or CraftPix coins / crystals. See src/data/assets.ts.
import type { CSSProperties } from 'preact';
import { iconUrl, itemUrl, uiUrl } from '../render/sprites';

type P = { size?: number; class?: string; style?: CSSProperties };

const Img = ({ src, size = 24, class: cls, style, alt = '' }: P & { src: string; alt?: string }) => (
  <img class={'ico ' + (cls ?? '')} src={src} width={size} height={size} style={style} alt={alt} draggable={false} />
);

export const Coin = (p: P) => <Img {...p} src={itemUrl('coin')} alt="コイン" />;
export const Gem = (p: P) => <Img {...p} src={itemUrl('gem')} alt="霊晶" />;
export const Soul = (p: P) => <Img {...p} src={itemUrl('soul')} alt="魂石" />;
export const Orb = (p: P) => <Img {...p} src={itemUrl('orb')} alt="霊珠" />;
export const StarIcon = (p: P) => <Img {...p} src={itemUrl('star')} alt="★" />;

export const ElIcon = ({ el, ...p }: P & { el: string }) => <Img {...p} src={itemUrl('el_' + el)} />;
export const RoleIcon = ({ role, ...p }: P & { role: string }) => <Img {...p} src={iconUrl(role)} />;

/** shape is "sword:iron" etc. (see data/items.ts) */
export const EquipIcon = ({ shape, ...p }: P & { shape: string }) => {
  const [s, tier] = shape.split(':');
  return <Img {...p} src={iconUrl(`eq_${s}_${tier}`)} />;
};
export const SkillIcon = ({ kind, el, ...p }: P & { kind: string; el: string }) => <Img {...p} src={iconUrl(`sk_${kind}_${el}`)} />;

const TAB_MAP: Record<string, string> = { sword: 'power' };
export const TabIcon = ({ name, ...p }: P & { name: string }) => {
  if (name === 'star') return <StarIcon {...p} />;
  return <Img {...p} src={iconUrl(TAB_MAP[name] ?? name)} />;
};

/** Cozy UI arrow piece (brown outline, cream fill) */
export const Arrow = ({ dir = 'right', size = 14, ...p }: P & { dir?: 'right' | 'left' }) => {
  const f = dir === 'right' ? 'ArrowBrownOuline23.png' : 'ArrowBrownOuline22.png';
  return <img class={'ico arrow ' + (p.class ?? '')} src={uiUrl(f)} style={{ height: size + 'px', width: 'auto', ...(p.style as object) }} alt="" draggable={false} />;
};

export const Stars = ({ n, max = 5, size = 12 }: { n: number; max?: number; size?: number }) => (
  <span class="stars">
    {Array.from({ length: max }, (_, i) => (
      <img src={itemUrl('star')} width={size} height={size} class={i < n ? 'on' : 'off'} alt="" draggable={false} />
    ))}
  </span>
);
