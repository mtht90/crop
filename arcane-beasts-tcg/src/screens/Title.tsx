import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { artUrl, asset } from '../lib/assets';
import { playMusic, sfx, unlockAudio, foley } from '../audio/audio';

/** shown on the title screen */
const APP_VERSION = '1.1.0';

export function Title() {
  const go = useStore((s) => s.go);
  const started = useStore((s) => s.save.started);
  const [m, setM] = useState({ x: 0, y: 0 });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    playMusic('title');
  }, []);

  const start = () => {
    if (leaving) return;
    unlockAudio();
    playMusic('title');
    sfx('gamestart', 0.9);
    foley.sparkle();
    setLeaving(true);
    setTimeout(() => go(started ? 'home' : 'starter'), 650);
  };

  return (
    <div
      className="screen title-screen"
      onClick={start}
      onPointerMove={(e) => setM({ x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 })}
    >
      <div className="title-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-bridge_sun')})`, transform: `translate(${m.x * -24}px, ${m.y * -16}px) scale(1.05)` }} />
      <div className="title-glow" />
      <div className="title-rays" />
      <motion.div className="title-emblem" initial={{ opacity: 0, scale: 1.25, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
        <img src={asset('ui/keyart.webp')} alt="ARCANE BEASTS" draggable={false} />
        <i className="title-shine" />
      </motion.div>
      <motion.div className="title-press" initial={{ opacity: 0 }} animate={leaving ? { scale: 1.25, opacity: 0 } : { opacity: 1 }} transition={{ delay: leaving ? 0 : 0.9 }}>
        <span>TAP TO START</span>
      </motion.div>
      <div className="title-meta">
        <span>Ver.{APP_VERSION}</span>
        <span>© ARCANE BEASTS</span>
      </div>
      {leaving && <motion.div style={{ position: 'absolute', inset: 0, background: '#fff' }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} transition={{ duration: 0.65 }} />}
    </div>
  );
}
