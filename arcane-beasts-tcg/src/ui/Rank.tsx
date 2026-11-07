// ============================================================================
// Rank emblems (ランクマッチ): the badge, and the change shown after a game.
// Emblems: "Vector Ranks" by RhosGFX (CC0).
// ============================================================================
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { asset } from '../lib/assets';
import { emblemKey, rankName, stepOf, TIERS, type RankView } from '../online/rank';
import { foley, sfx } from '../audio/audio';
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

const STEP_TEXT: Record<string, string> = { 'tier-up': '昇格！', 'div-up': 'ランクアップ！', same: '', 'div-down': 'ランクダウン', 'tier-down': 'ランクダウン' };

/** after a ranked game: the old emblem gives way to the new one */
export function RankChange({ before, after }: { before: RankView; after: RankView }) {
  const step = stepOf(before, after);
  const up = step === 'tier-up' || step === 'div-up';
  const moved = step !== 'same';
  const [swap, setSwap] = useState(!moved);
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => {
      setSwap(true);
      if (up) {
        foley.rarity(step === 'tier-up' ? 5 : 3);
        sfx('fanfare-short', 0.5);
        particles.shower('glint', step === 'tier-up' ? 40 : 18);
      } else foley.boom(0.6);
    }, 1300);
    return () => clearTimeout(t);
  }, [moved, up, step]);
  const shown = swap ? after : before;
  return (
    <motion.div className={`rank-change ${up ? 'up' : moved ? 'down' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.45 }}>
      <motion.div key={swap ? 'a' : 'b'} className="rc-emblem" initial={swap && moved ? { scale: up ? 1.8 : 0.7, opacity: 0, rotate: up ? -10 : 0 } : false} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: 0.6, ease: [0.2, 1.4, 0.3, 1] }}>
        {up && swap && <i className="rc-burst" />}
        <RankEmblem v={shown} size={72} />
      </motion.div>
      <div className="rc-text">
        <small>ランクマッチ・{Number(after.season.slice(5))}月シーズン</small>
        <RankLabel v={shown} />
        {swap && moved && (
          <motion.b className="rc-step" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
            {STEP_TEXT[step]}
          </motion.b>
        )}
        <RankBar v={shown} from={swap && moved ? (up ? 0 : 1) : before.progress} />
        <small className="rc-rec">
          今シーズン {after.wins}勝 {after.losses}敗
        </small>
      </div>
    </motion.div>
  );
}
