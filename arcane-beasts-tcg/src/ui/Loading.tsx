// ============================================================================
// The loading screen (start-up and before a battle): the key art, a tip that
// changes every few seconds, and a bar that fills with what has loaded.
// ============================================================================
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { asset } from '../lib/assets';

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

export function Loading({ progress, label = 'NOW LOADING' }: { progress: number; label?: string }) {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const iv = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 3800);
    return () => clearInterval(iv);
  }, []);
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  // drawn on the page itself, so a transformed parent (the battle stage) cannot shrink it
  return createPortal(
    <motion.div className="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <div className="loading-bg" style={{ backgroundImage: `url(${asset('ui/keyart.webp')})` }} />
      <div className="loading-shade" />
      <motion.img className="loading-art" src={asset('ui/keyart.webp')} alt="" initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
      <div className="loading-foot">
        <motion.div key={tip} className="loading-tip" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <b>TIPS</b>
          <span>{TIPS[tip]}</span>
        </motion.div>
        <div className="loading-bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="loading-row">
          <span className="loading-label">
            {label}
            <em>.</em>
            <em>.</em>
            <em>.</em>
          </span>
          <span className="loading-pct">{pct}%</span>
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
