import { memo, useMemo, useRef } from 'react';
import { byName } from '../../engine/cards';
import type { MonsterCard } from '../../engine/types';
import type { Booster } from '../../state/store';
import { artUrl, TYPE_SCENE } from '../../lib/assets';

/** y position (fraction of pack height) of the tear line */
export const TEAR_Y = 0.082;

// ---------------------------------------------------------------------------
// Clip-path geometry
// ---------------------------------------------------------------------------
const TEETH = 26;
const CRIMP = 1.6; // % of height

function crimpPolygon(): string {
  const pts: string[] = [];
  for (let i = 0; i <= TEETH; i++) {
    const x = (i / TEETH) * 100;
    pts.push(`${x}% ${i % 2 ? CRIMP : 0}%`);
  }
  for (let i = TEETH; i >= 0; i--) {
    const x = (i / TEETH) * 100;
    pts.push(`${x}% ${100 - (i % 2 ? CRIMP : 0)}%`);
  }
  return `polygon(${pts.join(',')})`;
}
export const CRIMP_CLIP = crimpPolygon();

/** jagged tear edge, deterministic so both halves match */
function tearEdge(): [number, number][] {
  const pts: [number, number][] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 34;
  for (let i = 0; i <= n; i++) pts.push([(i / n) * 100, TEAR_Y * 100 + (rnd() - 0.5) * 1.6]);
  return pts;
}
const EDGE = tearEdge();
export const TOP_CLIP = `polygon(0% 0%, 100% 0%, ${[...EDGE].reverse().map(([x, y]) => `${x}% ${y}%`).join(',')})`;
export const BODY_CLIP = `polygon(${EDGE.map(([x, y]) => `${x}% ${y}%`).join(',')}, 100% 100%, 0% 100%)`;

// ---------------------------------------------------------------------------
// Pack
// ---------------------------------------------------------------------------
interface Props {
  booster: Booster;
  className?: string;
  style?: React.CSSProperties;
  part?: 'full' | 'top' | 'body';
  tilt?: boolean;
  god?: boolean;
  still?: boolean;
  onClick?: () => void;
}

export const BoosterPack = memo(function BoosterPack({ booster, className, style, part = 'full', tilt, god, still, onClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mascot = useMemo(() => byName(booster.mascot) as MonsterCard, [booster.mascot]);
  const move = (e: React.PointerEvent) => {
    if (!tilt || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty('--mx', `${x * 100}%`);
    ref.current.style.setProperty('--my', `${y * 100}%`);
    ref.current.style.setProperty('--rx', `${(0.5 - y) * 14}deg`);
    ref.current.style.setProperty('--ry', `${(x - 0.5) * 18}deg`);
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  const clip = part === 'top' ? TOP_CLIP : part === 'body' ? BODY_CLIP : undefined;
  return (
    <div
      ref={ref}
      className={`bp ${tilt ? 'tilt' : ''} ${god ? 'god' : ''} ${still ? 'still' : ''} ${className ?? ''}`}
      style={{ ['--hue' as string]: booster.hue, ['--hue2' as string]: booster.hue2, ...style }}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={onClick}
    >
      <div className="bp-clip" style={clip ? { clipPath: clip } : undefined}>
        <div className="bp-shape" style={{ clipPath: CRIMP_CLIP }}>
          <div className="bp-bg" />
          <img className="bp-scene" src={artUrl(mascot.scene ?? TYPE_SCENE[mascot.type])} alt="" draggable={false} />
          <div className="bp-burst" />
          <img className="bp-mascot" src={artUrl(mascot.art)} alt="" draggable={false} />
          <div className="bp-crimp top" />
          <div className="bp-crimp bottom" />
          <div className="bp-logo">
            <span className="a">ARCANE BEASTS</span>
            <span className="b">TRADING CARD GAME</span>
          </div>
          <div className="bp-label">
            <span className="set">拡張パック 第1弾「目覚めの咆哮」</span>
            <span className="name">{booster.name}</span>
            <span className="count">5枚入り</span>
          </div>
          <div className="bp-foil" />
          <div className="bp-gloss" />
          <div className="bp-wrap" />
        </div>
      </div>
    </div>
  );
});
