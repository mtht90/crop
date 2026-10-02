import { memo, useMemo, useRef } from 'react';
import { byName, SET_INFO } from '../../engine/cards';
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

/** band (fraction of pack height) in which the player may trace the tear */
export const TEAR_BAND: [number, number] = [0.025, 0.2];

/**
 * Turns a traced path (percent coordinates, any direction) into a full-width
 * tear edge: ends extended flat to the sides, with a fine paper-fibre jitter.
 */
export function tearEdgeFrom(path: [number, number][]): [number, number][] {
  if (path.length === 0) return EDGE;
  const pts = [...path].sort((a, b) => a[0] - b[0]);
  const full: [number, number][] = [[0, pts[0][1]], ...pts, [100, pts[pts.length - 1][1]]];
  const out: [number, number][] = [];
  const jitter = (x: number) => {
    const v = Math.sin(x * 12.9898) * 43758.5453;
    return (v - Math.floor(v) - 0.5) * 0.7;
  };
  for (let i = 0; i < full.length - 1; i++) {
    const [x0, y0] = full[i];
    const [x1, y1] = full[i + 1];
    const steps = Math.max(1, Math.ceil((x1 - x0) / 1.6));
    for (let k = 0; k < steps; k++) {
      const x = x0 + ((x1 - x0) * k) / steps;
      out.push([x, y0 + ((y1 - y0) * k) / steps + (x > 0 && x < 100 ? jitter(x) : 0)]);
    }
  }
  out.push(full[full.length - 1]);
  return out;
}
export function tearClips(edge: [number, number][]) {
  const pts = edge.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`);
  return { top: `polygon(0% 0%, 100% 0%, ${[...pts].reverse().join(',')})`, body: `polygon(${pts.join(',')}, 100% 100%, 0% 100%)` };
}

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
  /** custom clip for part="top" / "body" (a traced tear) */
  clip?: string;
}

export const BoosterPack = memo(function BoosterPack({ booster, className, style, part = 'full', tilt, still, god, clip: customClip }: Props) {
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
  const clip = part === 'full' ? undefined : (customClip ?? (part === 'top' ? TOP_CLIP : BODY_CLIP));
  return (
    <div
      ref={ref}
      className={`bp ${booster.theme ? 'theme' : `set-${booster.set}`} ${booster.premium ? 'premium' : ''} ${tilt ? 'tilt' : ''} ${still ? 'still' : ''} ${god ? 'god' : ''} ${part !== 'full' ? 'part' : ''} ${className ?? ''}`}
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
            <span className="b">{booster.premium ? 'PREMIUM' : (booster.title ?? SET_INFO[booster.set].name)}</span>
          </div>
          <div className="bp-foot">
            <span className="line" />
            <span className="t">{booster.premium ? 'PREMIUM PACK' : booster.theme ? 'THEME PACK' : 'BOOSTER PACK'}</span>
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
