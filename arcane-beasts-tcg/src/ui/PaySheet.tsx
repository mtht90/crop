// ============================================================================
// The payment sheet: the price, the balance before and after, and a paying
// moment (the gems fly off, the balance counts down, お支払い完了).
// ============================================================================
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../audio/audio';
import { useStore } from '../state/store';
import { Icon } from './Icon';

export function PaySheet({
  title,
  price,
  ticket,
  onPay,
  onCancel,
  onDone,
  shopLink = true,
  children,
}: {
  /** what is being bought, shown above the price */
  children?: React.ReactNode;
  /** offer a way to the ショップ when short (not in the middle of a battle) */
  shopLink?: boolean;
  title: string;
  price: number;
  /** a ticket pays instead of gems (shows "チケットを使う") */
  ticket?: { have: number };
  onPay: () => boolean;
  onCancel: () => void;
  onDone: () => void;
}) {
  const gems = useStore((s) => s.save.gems);
  const go = useStore((s) => s.go);
  const [phase, setPhase] = useState<'ask' | 'paying' | 'done'>('ask');
  const before = useRef(gems);
  const useTicket = !!ticket && ticket.have > 0;
  const short = !useTicket && gems < price;
  const after = useTicket ? gems : gems - price;
  // the balance shown while paying runs down to what is left
  const [shown, setShown] = useState(gems);
  useEffect(() => {
    if (phase !== 'paying' || useTicket) return;
    const from = before.current;
    const to = from - price;
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / 700);
      setShown(Math.round(from + (to - from) * (1 - (1 - u) ** 3)));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, price, useTicket]);
  const pay = () => {
    before.current = gems;
    setShown(gems);
    if (!onPay()) return;
    setPhase('paying');
    sfx('gold', 0.7);
    setTimeout(() => {
      setPhase('done');
      sfx('checkbox', 0.6);
    }, 900);
    setTimeout(onDone, 1900);
  };
  return (
    <motion.div className="pay-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={phase === 'ask' ? onCancel : undefined}>
      <motion.div className="panel pay-sheet" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} onClick={(e) => e.stopPropagation()}>
        <div className="pay-title">{title}</div>
        {children}
        {phase === 'done' ? (
          <motion.div className="pay-done" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, ease: [0.2, 1.4, 0.3, 1] }}>
            <span className="pay-check">
              <Icon name="check" />
            </span>
            お支払い完了
          </motion.div>
        ) : (
          <>
            <div className="pay-price">
              {useTicket ? (
                <>
                  <Icon name="ticket" /> チケット 1枚
                </>
              ) : (
                <>
                  <Icon name="gem" /> {price.toLocaleString()}
                </>
              )}
            </div>
            <div className="pay-balance">
              {useTicket ? (
                <>
                  チケット {ticket!.have} → {ticket!.have - 1}
                </>
              ) : (
                <>
                  所持 <Icon name="gem" /> {(phase === 'paying' ? before.current : gems).toLocaleString()} → <b className={short ? 'short' : ''}>{(phase === 'paying' ? shown : after).toLocaleString()}</b>
                </>
              )}
            </div>
            {phase === 'paying' && !useTicket && (
              <div className="pay-fly">
                {Array.from({ length: 6 }, (_, i) => (
                  <motion.span key={i} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: 60 + i * 8, y: -120 - i * 10, opacity: 0, scale: 0.5 }} transition={{ delay: i * 0.06, duration: 0.6, ease: 'easeIn' }}>
                    <Icon name="gem" />
                  </motion.span>
                ))}
              </div>
            )}
            {short ? (
              <>
                <div className="pay-short">ジェムが足りません（あと {(price - gems).toLocaleString()}）</div>
                <div className="pay-btns">
                  <button className="btn ghost" onClick={onCancel}>
                    閉じる
                  </button>
                  {shopLink && (
                    <button className="btn" onClick={() => (onCancel(), go('store'))} hidden={!shopLink}>
                      ショップへ
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="pay-btns">
                <button className="btn ghost" disabled={phase !== 'ask'} onClick={onCancel}>
                  キャンセル
                </button>
                <button className="btn gold-btn" disabled={phase !== 'ask'} onClick={pay}>
                  {useTicket ? 'チケットを使う' : '支払う'}
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
