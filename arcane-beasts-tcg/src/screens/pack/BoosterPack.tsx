import { memo, useMemo, useRef } from 'react';
import { byName } from '../../engine/cards';
import type { MonsterCard } from '../../engine/types';
import type { Booster } from '../../state/store';
import { artUrl, TYPE_SCENE } from '../../lib/assets';

/** y position (fraction of pack height) of the tear line, just under the top seal */
export const TEAR_Y = 0.07;

// ---------------------------------------------------------------------------
// Clip-path geometry: fine crimped seals top and bottom, jagged tear edge
// ---------------------------------------------------------------------------
const TEETH = 44;
const CRIMP = 0.9; // % of height

function crimpPolygon(): string {
  const pts: string[] = [];
  for (let i = 0; i <= TEETH; i++) pts.push(`${(i / TEETH) * 100}% ${i % 2 ? CRIMP : 0}%`);
  for (let i = TEETH; i >= 0; i--) pts.push(`${(i / TEETH) * 100}% ${100 - (i % 2 ? CRIMP : 0)}%`);
  return `polygon(${pts.join(',')})`;
}
export const CRIMP_CLIP = crimpPolygon();

function tearEdge(): [number, number][] {
  const pts: [number, number][] = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = 48;
  for (let i = 0; i <= n; i++) pts.push([(i / n) * 100, TEAR_Y * 100 + (rnd() - 0.5) * 0.9]);
  return pts;
}
const EDGE = tearEdge();
export const TOP_CLIP = `polygon(0% 0%, 100% 0%, ${[...EDGE].reverse().map(([x, y]) => `${x}% ${y}%`).join(',')})`;
export const BODY_CLIP = `polygon(${EDGE.map(([x, y]) => `${x}% ${y}%`).join(',')}, 100% 100%, 0% 100%)`;

// ---------------------------------------------------------------------------
interface Props {
  booster: Booster;
  className?: string;
  style?: React.CSSProperties;
  part?: 'full' | 'top' | 'body';
  /** follow the pointer with tilt + specular highlight */
  tilt?: boolean;
  /** freeze ambient animations (used for background packs) */
  still?: boolean;
  god?: boolean;
}

export const BoosterPack = memo(function BoosterPack({ booster, className, style, part = 'full', tilt, still, god }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mascot = useMemo(() => byName(booster.mascot) as MonsterCard, [booster.mascot]);
  const move = (e: React.PointerEvent) => {
    if (!tilt || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const s = ref.current.style;
    s.setProperty('--mx', `${x * 100}%`);
    s.setProperty('--my', `${y * 100}%`);
    s.setProperty('--rx', `${(0.5 - y) * 9}deg`);
    s.setProperty('--ry', `${(x - 0.5) * 13}deg`);
  };
  const leave = () => {
    const s = ref.current?.style;
    if (!s) return;
    s.setProperty('--rx', '0deg');
    s.setProperty('--ry', '0deg');
    s.setProperty('--mx', '32%');
    s.setProperty('--my', '22%');
  };
  const clip = part === 'top' ? TOP_CLIP : part === 'body' ? BODY_CLIP : undefined;
  return (
    <div
      ref={ref}
      className={`bp ${booster.premium ? 'premium' : ''} ${tilt ? 'tilt' : ''} ${still ? 'still' : ''} ${god ? 'god' : ''} ${part !== 'full' ? 'part' : ''} ${className ?? ''}`}
      style={{ ['--hue' as string]: booster.hue, ['--hue2' as string]: booster.hue2, ...style }}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      {part === 'full' && <div className="bp-shadow" />}
      <div className="bp-clip" style={clip ? { clipPath: clip } : undefined}>
        <div className="bp-shape" style={{ clipPath: CRIMP_CLIP }}>
          <div className="bp-base" />
          <img className="bp-scene" src={artUrl(mascot.scene ?? TYPE_SCENE[mascot.type])} alt="" draggable={false} />
          <div className="bp-grade" />
          <img className="bp-mascot" src={artUrl(mascot.art)} alt="" draggable={false} />
          <div className="bp-fade" />
          <div className="bp-logo">
            <span className="a">ARCANE BEASTS</span>
            <span className="b">{booster.premium ? 'PREMIUM' : '目覚めの咆哮'}</span>
          </div>
          <div className="bp-foot">
            <span className="line" />
            <span className="t">{booster.premium ? 'PREMIUM PACK' : 'BOOSTER PACK'}</span>
            <span className="line" />
          </div>
          {booster.premium && <div className="bp-frame" />}
          <div className="bp-seal top" />
          <div className="bp-seal bottom" />
          <div className="bp-pillow" />
          <div className="bp-spec" />
          <div className="bp-sheen" />
        </div>
      </div>
    </div>
  );
});
