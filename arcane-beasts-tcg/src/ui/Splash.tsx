// ============================================================================
// Start-up: the studio mark fades in and out, then the title screen.
// ============================================================================
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { asset } from '../lib/assets';

/** how long the mark is on screen */
const SHOW_MS = 2600;

export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const t0 = useRef(performance.now());
  const done = useRef(onDone);
  done.current = onDone;
  const [out, setOut] = useState(false);
  // the mark starts fading in once its picture is here (never a half-drawn logo)
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSeen(true), 1500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (seen) t0.current = performance.now();
  }, [seen]);
  useEffect(() => {
    if (!ready || !seen) return;
    const left = Math.max(0, SHOW_MS - (performance.now() - t0.current));
    // the mark fades away, then the title screen
    const a = setTimeout(() => setOut(true), left);
    const b = setTimeout(() => done.current(), left + 700);
    return () => (clearTimeout(a), clearTimeout(b));
  }, [ready, seen]);
  return (
    <div className="splash">
      <motion.div
        className="splash-mark"
        initial={{ opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
        animate={out ? { opacity: 0, scale: 1.02, filter: 'blur(4px)' } : seen ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : { opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
        transition={out ? { duration: 0.6, ease: 'easeIn' } : { duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      >
        <img src={asset('ui/mosh.webp')} alt="mosh" onLoad={() => setSeen(true)} />
      </motion.div>
    </div>
  );
}
