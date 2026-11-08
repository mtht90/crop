// ============================================================================
// The loading screen (start-up and before a battle): the key art, a tip that
// changes every few seconds, and a bar that fills with what has loaded.
// ============================================================================
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { asset } from '../lib/assets';
import { Embers, Logo } from './Logo';

export const TIPS = [
  '弱点をつくとダメージは2倍。相手のタイプを見てアタッカーを選ぼう',
  '通常パックは毎日2回まで無料。2回目は4時間後から',
  'エネルギーは1ターンに1枚だけ。どのモンスターに付けるかが勝負の分かれ目',
  'サポーターは1ターンに1枚まで。大賢者の研究で手札を一気に入れ替えよう',
  '回復の特性は、何匹並べても1ターンに1回だけ',
  'デッキ画面の「コードで組む」で、人のデッキをそのまま組める',
  'ボスレイドは不定期開催。倒すと大量のジェムがもらえる',
  'イベントは2週間ごと。ステージに勝つたびにジェムとかけらが手に入る',
  'スタジアムはタイプの強さを変える。自分のタイプに合ったものを置こう',
  'ベンチを空にすると、バトル場が倒れたとき負けてしまう。たねは早めに並べよう',
  '進化したばかりのモンスターや、出したばかりのモンスターは進化できない',
  'カードを長押しすると拡大して効果を読める',
  '負けたときと降参したときは報酬なし。最後まであきらめずに',
];

/** the shortest time the bar takes to fill */
/** the shortest a loading screen stays (ms) */
export const MIN_MS = 1100;

/**
 * how far a natural-looking bar has got after `u` (0–1) of its time: quick at
 * first, a short pause somewhere in the middle (as if a big file is coming),
 * then on to the end. `pause` moves the pause, so no two loads look the same.
 */
function curve(u: number, pause: number): number {
  const e = (x: number) => 1 - (1 - x) ** 3; // ease out
  const p0 = pause; // where the pause starts (time and amount roughly equal)
  if (u < p0) return e(u / p0) * (p0 + 0.08);
  if (u < p0 + 0.18) return p0 + 0.08 + ((u - p0) / 0.18) * 0.04; // the pause: barely moves
  return p0 + 0.12 + e((u - p0 - 0.18) / (1 - p0 - 0.18)) * (1 - p0 - 0.12);
}


function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg className={`lt-spark ${className}`} viewBox="0 0 20 20" aria-hidden>
      <path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" />
    </svg>
  );
}

export function Loading({ progress, label = 'Now Loading', minMs = MIN_MS, onDone }: { progress: number; label?: string; minMs?: number; onDone?: () => void }) {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const iv = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 6000);
    return () => clearInterval(iv);
  }, []);
  // the bar follows a natural curve over at least minMs, and never runs ahead of
  // what has really loaded (that only lets it reach 90% until everything is in)
  const [shown, setShown] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t0 = performance.now();
    const pause = 0.3 + Math.random() * 0.3;
    let raf = 0;
    let finished = false;
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / minMs);
      const real = progressRef.current >= 1 ? 1 : 0.1 + progressRef.current * 0.8;
      const v = Math.min(curve(u, pause), real);
      setShown((old) => Math.max(old, v));
      if (u >= 1 && real >= 1) {
        if (!finished) {
          finished = true;
          // a beat at 100% before moving on
          setTimeout(() => doneRef.current?.(), 220);
        }
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [minMs]);
  const pct = Math.round(Math.max(0, Math.min(1, shown)) * 100);
  // drawn on the page itself, so a transformed parent (the battle stage) cannot shrink it
  return createPortal(
    <motion.div className="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <div className="loading-bg" style={{ backgroundImage: `url(${asset('ui/dragon.webp')})` }} />
      <div className="loading-shade" />
      <Embers />
      <motion.div className="loading-logo" initial={{ opacity: 0, y: -10, scale: 1.04 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
        <Logo />
      </motion.div>
      <div className="loading-foot">
        <div className="lt-head">
          <i className="lt-line l" />
          <Sparkle />
          <b>TIPS</b>
          <Sparkle />
          <i className="lt-line r" />
        </div>
        <motion.p key={tip} className="lt-text" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {TIPS[tip]}
        </motion.p>
        <div className="lb-row">
          <div className="lb-bar">
            <Sparkle className="lb-cap l" />
            <div className="lb-track">
              <i style={{ width: `${pct}%` }} />
            </div>
            <Sparkle className="lb-cap r" />
          </div>
          <div className="lb-label">
            <span>
              {label}
              <em>.</em>
              <em>.</em>
              <em>.</em>
            </span>
            <small>{pct}%</small>
          </div>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}

/** load pictures one by one, reporting how far it got (0–1) */
export function preloadWithProgress(urls: string[], onProgress: (p: number) => void): Promise<void> {
  const list = [...new Set(urls)];
  if (!list.length) {
    onProgress(1);
    return Promise.resolve();
  }
  let done = 0;
  return Promise.all(
    list.map(
      (u) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = img.onerror = () => {
            done++;
            onProgress(done / list.length);
            res();
          };
          img.src = u;
        }),
    ),
  ).then(() => undefined);
}
