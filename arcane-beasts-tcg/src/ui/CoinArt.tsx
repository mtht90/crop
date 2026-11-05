// The coin of the coin toss: a struck gold (heads, crown) or silver (tails,
// dragon) piece. The field is flat, as a real coin's is: the light sits on the
// raised rim, the lettering and the emblem, never as a dome in the middle.
import { useId } from 'react';
import icons from '../assets/icons.json';

const ICONS = icons as Record<string, string>;

const METAL = {
  heads: { hi: '#fff1b0', field: '#e3b046', fieldLo: '#cf9a32', lo: '#9a6512', dk: '#4a2c05', relief: '#c48a24' },
  tails: { hi: '#ffffff', field: '#c9ced6', fieldLo: '#b3b9c3', lo: '#7c828d', dk: '#2e323a', relief: '#a3a9b4' },
};

export function CoinArt({ side }: { side: 'heads' | 'tails' }) {
  const id = useId().replace(/:/g, '');
  const m = METAL[side];
  const glyph = ICONS[side === 'heads' ? 'crown' : 'dragon'] ?? '';
  const text = side === 'heads' ? 'ARCANE ✦ BEASTS ✦ REX ✦ FORTUNA ✦' : 'ARCANE ✦ BEASTS ✦ DRACO ✦ FATUM ✦';
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" aria-hidden>
      <defs>
        {/* flat field: an even sheen across, darker toward one edge */}
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={m.field} />
          <stop offset="1" stopColor={m.fieldLo} />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={m.hi} />
          <stop offset=".45" stopColor={m.lo} />
          <stop offset="1" stopColor={m.dk} />
        </linearGradient>
        <filter id={`${id}e`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b" />
          <feSpecularLighting in="b" surfaceScale="3" specularConstant=".45" specularExponent="30" lightingColor="#fff" result="s">
            <fePointLight x="120" y="60" z="220" />
          </feSpecularLighting>
          <feComposite in="s" in2="SourceAlpha" operator="in" result="s2" />
          <feOffset in="SourceAlpha" dx="3" dy="5" result="o" />
          <feGaussianBlur in="o" stdDeviation="2" result="ob" />
          <feFlood floodColor={m.dk} floodOpacity=".7" />
          <feComposite in2="ob" operator="in" result="sh" />
          <feMerge>
            <feMergeNode in="sh" />
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="s2" />
          </feMerge>
        </filter>
        <path id={`${id}t`} d="M256,256 m-176,0 a176,176 0 1,1 352,0 a176,176 0 1,1 -352,0" />
      </defs>
      <circle cx="256" cy="256" r="252" fill={`url(#${id}r)`} />
      {Array.from({ length: 120 }, (_, i) => (
        <rect key={i} x="254" y="6" width="4" height="16" rx="1" fill={m.lo} transform={`rotate(${i * 3} 256 256)`} />
      ))}
      <circle cx="256" cy="256" r="226" fill={`url(#${id}f)`} stroke={m.dk} strokeOpacity=".5" strokeWidth="3" />
      {/* the raised inner rim catches the light on its upper left */}
      <circle cx="256" cy="256" r="222" fill="none" stroke={m.hi} strokeOpacity=".55" strokeWidth="3" strokeDasharray="520 900" transform="rotate(170 256 256)" />
      <circle cx="256" cy="256" r="206" fill="none" stroke={m.lo} strokeWidth="4" strokeDasharray="2 8" />
      <circle cx="256" cy="256" r="150" fill="none" stroke={m.dk} strokeOpacity=".45" strokeWidth="3" />
      <text fontFamily="Cinzel, 'Times New Roman', serif" fontSize="30" fontWeight="700" fill={m.dk} fillOpacity=".7" letterSpacing="6">
        <textPath href={`#${id}t`}>{text}</textPath>
      </text>
      <g filter={`url(#${id}e)`}>
        <g transform="translate(146 146) scale(.43)" style={{ color: m.relief }} dangerouslySetInnerHTML={{ __html: glyph.replace(/fill="#fff"/g, 'fill="currentColor"') }} />
      </g>
    </svg>
  );
}
