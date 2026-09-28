// Rank crest: bronze (10–6級), silver (5–1級), gold with wings (段), prismatic crown (名人)
import { useId } from 'react';
import { DAN, MEIJIN, RANKS, rankTier } from '../state/ranked';

const TIER_STOPS = {
  bronze: ['#f4c9a0', '#c98a55', '#7a4520', '#e9b184'],
  silver: ['#ffffff', '#cfd6e2', '#7f889a', '#eef2f8'],
  gold: ['#fff6cf', '#f1c75a', '#a8741a', '#ffe7a0'],
  meijin: ['#ffd6f0', '#b9a2ff', '#58c7ff', '#fff3b0'],
} as const;

export function RankEmblem({ rank, size = '6em', className }: { rank: number; size?: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const tier = rankTier(rank);
  const [a, b, c, d] = TIER_STOPS[tier];
  const dan = rank >= DAN && rank < MEIJIN;
  const label = RANKS[rank];
  const big = rank >= MEIJIN ? '名人' : dan ? label.slice(0, 1) : String(10 - rank);
  const small = rank >= MEIJIN ? '' : dan ? '段' : '級';
  return (
    <svg className={`rank-emblem ${tier} ${className ?? ''}`} viewBox="0 0 120 120" style={{ width: size, height: size }} aria-label={label}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="0.45" stopColor={b} />
          <stop offset="0.75" stopColor={c} />
          <stop offset="1" stopColor={d} />
        </linearGradient>
        <linearGradient id={`i${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2350" />
          <stop offset="1" stopColor="#070a1c" />
        </linearGradient>
        <radialGradient id={`h${id}`} cx="0.5" cy="0.3" r="0.7">
          <stop offset="0" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      {/* wings for 段 and 名人 */}
      {rank >= DAN && (
        <g fill={`url(#g${id})`} opacity="0.95">
          <path d="M26 58 C8 52 2 38 4 24 C14 34 22 38 32 40 C22 30 18 20 20 10 C30 22 36 30 40 36 Z" />
          <path d="M94 58 C112 52 118 38 116 24 C106 34 98 38 88 40 C98 30 102 20 100 10 C90 22 84 30 80 36 Z" />
        </g>
      )}
      {/* crown for 名人 */}
      {rank >= MEIJIN && <path d="M40 22 L48 8 L60 18 L72 8 L80 22 Z" fill={`url(#g${id})`} stroke="#2a1840" strokeWidth="1.5" />}
      {/* hexagonal shield */}
      <path d="M60 18 L96 32 L96 72 Q96 96 60 112 Q24 96 24 72 L24 32 Z" fill={`url(#g${id})`} stroke="#1a1208" strokeWidth="2" />
      <path d="M60 26 L89 37 L89 71 Q89 90 60 103 Q31 90 31 71 L31 37 Z" fill={`url(#i${id})`} />
      <path d="M60 26 L89 37 L89 71 Q89 90 60 103 Q31 90 31 71 L31 37 Z" fill={`url(#h${id})`} />
      <text x="60" y={small ? 72 : 74} textAnchor="middle" fontFamily="'Dela Gothic One', sans-serif" fontSize={rank >= MEIJIN ? 22 : 30} fill={`url(#g${id})`} stroke="#000" strokeWidth="0.6" paintOrder="stroke">
        {big}
      </text>
      {small && (
        <text x="60" y="92" textAnchor="middle" fontFamily="'M PLUS 1p', sans-serif" fontWeight="900" fontSize="13" fill={a}>
          {small}
        </text>
      )}
    </svg>
  );
}
