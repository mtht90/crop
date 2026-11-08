// ============================================================================
// Rank emblems (ランクマッチ): the badge, and the change shown after a game.
// Emblems: "Vector Ranks" by RhosGFX (CC0).
// ============================================================================
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { asset } from '../lib/assets';
import { emblemKey, rankName, stepOf, TIERS, type RankView } from '../online/rank';
import { foley } from '../audio/audio';
import { particles } from '../battle/particles';

export const emblemUrl = (v: { tier: number; div: number } | null | undefined) => asset(`ui/rank/${emblemKey(v)}.webp`);

export function RankEmblem({ v, size = 48, className = '' }: { v: { tier: number; div: number } | null | undefined; size?: number; className?: string }) {
  return <img className={`rank-emblem ${className}`} src={emblemUrl(v)} alt={v ? rankName(v) : '未参加'} style={{ width: size, height: size, ['--rk' as string]: v ? TIERS[v.tier].color : '#7d8aa8' }} />;
}

/** the tier's name in its color, e.g. 「ゴールド II」 */
export function RankLabel({ v }: { v: { tier: number; div: number } }) {
  return (
    <span className="rank-label" style={{ color: TIERS[v.tier].color }}>
      {rankName(v)}
    </span>
  );
}

/** the bar inside the division (no number: only how far along) */
export function RankBar({ v, from }: { v: RankView; from?: number }) {
  return (
    <div className="rank-bar">
      <motion.i initial={{ width: `${(from ?? v.progress) * 100}%` }} animate={{ width: `${v.progress * 100}%` }} transition={{ delay: 0.9, duration: 0.9, ease: [0.16, 1, 0.3, 1] }} style={{ background: TIERS[v.tier].color }} />
    </div>
  );
}

/** the step, in the quiet style of the loading screen: a Latin word and a Japanese line */
const STEP_WORD: Record<string, string> = { 'tier-up': 'PROMOTION', 'div-up': 'RANK UP', 'div-down': 'RANK DOWN', 'tier-down': 'DEMOTION', same: '' };
const stepLine = (step: string, v: RankView) => (step === 'tier-up' || step === 'div-up' ? `${rankName(v)} へ昇格` : step === 'same' ? '' : `${rankName(v)} へ降格`);

/** after a ranked game: the old emblem gives way to the new one */
export function RankChange({ before, after, placement = false }: { before: RankView; after: RankView; placement?: boolean }) {
  const step = placement ? (after.tier >= 2 ? 'tier-up' : 'div-up') : stepOf(before, after);
  const up = step === 'tier-up' || step === 'div-up';
  const big = step === 'tier-up';
  const moved = step !== 'same';
  const [swap, setSwap] = useState(!moved);
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => {
      setSwap(true);
      if (big) {
        foley.rarity(5);
        particles.shower('glint', 26);
      } else if (up) foley.rarity(3);
      else foley.boom(0.45);
    }, 1400);
    return () => clearTimeout(t);
  }, [moved, up, big]);
  const shown = swap ? after : before;
  const word = placement ? 'PLACEMENT' : STEP_WORD[step];
  const line = placement ? `${rankName(after)} からスタート` : stepLine(step, shown);
  return (
    <motion.div className={`rank-change ${swap && up ? 'up' : ''} ${swap && moved && !up ? 'down' : ''} ${big ? 'big' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
      <i className="rc-corner tl" />
      <i className="rc-corner br" />
      <div className="rc-emblem">
        {swap && up && <motion.i className="rc-halo" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 1, 0.55], scale: [0.6, 1.15, 1] }} transition={{ duration: 1.6, ease: 'easeOut' }} />}
        <motion.div
          key={swap ? 'after' : 'before'}
          initial={swap && moved ? { opacity: 0, scale: up ? 1.12 : 0.94, filter: 'brightness(2.2) blur(3px)' } : false}
          animate={{ opacity: 1, scale: 1, filter: 'brightness(1) blur(0px)' }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <RankEmblem v={placement && !swap ? null : shown} size={76} />
        </motion.div>
        {swap && up && <motion.i className="rc-sweep" initial={{ x: '-100%', opacity: 0 }} animate={{ x: '360%', opacity: [0, 1, 1, 0] }} transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1], delay: 0.15 }} />}
      </div>
      <div className="rc-text">
        <small>{placement ? 'RANKED ・ 認定戦' : `RANKED ・ ${Number(after.season.slice(5))}月シーズン`}</small>
        {swap && moved ? (
          <motion.div className="rc-step" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
            <span>{word}</span>
          </motion.div>
        ) : null}
        <div className="rc-name">{swap && moved ? line : placement ? '判定中…' : rankName(shown)}</div>
        {(!placement || swap) && <RankBar v={shown} from={swap && moved ? (up ? 0 : 1) : before.progress} />}
        <small className="rc-rec">
          今シーズン {after.wins}勝 {after.losses}敗
        </small>
      </div>
    </motion.div>
  );
}
