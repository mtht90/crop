import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { artUrl } from '../lib/assets';
import { CardFace } from '../ui/Card';
import { playMusic, sfx, unlockAudio, foley } from '../audio/audio';
import { ALL_CARDS } from '../engine/cards';

const SHOWCASE = ['ヴォルカリオン', 'リヴァイアサーペント', 'エンシェントウッド'];

export function Title() {
  const go = useStore((s) => s.go);
  const started = useStore((s) => s.save.started);
  const [m, setM] = useState({ x: 0, y: 0 });
  const [leaving, setLeaving] = useState(false);
  const cards = SHOWCASE.map((n) => ALL_CARDS.find((c) => c.name === n && c.rarity === 'SR')!);

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
      <div className="stage">
        <div className="title-cards" style={{ transform: `translate(${m.x * 18}px, ${m.y * 12}px)` }}>
          {cards.map((c, i) => (
            <motion.div
              key={c.id}
              className="title-card"
              initial={{ y: 200, opacity: 0, rotate: 0 }}
              animate={{ y: [0, -10, 0], opacity: 1, rotate: (i - 1) * 14, x: `calc(var(--u) * ${(i - 1) * 13})` }}
              transition={{ y: { duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: 0.6 + i * 0.3 }, opacity: { duration: 0.8, delay: 0.2 + i * 0.15 }, rotate: { duration: 0.8, delay: 0.2 + i * 0.15 }, x: { duration: 0.8, delay: 0.2 + i * 0.15 } }}
              style={{ zIndex: i === 1 ? 2 : 1 }}
            >
              <CardFace cid={c.id} />
            </motion.div>
          ))}
        </div>
        <motion.div className="title-logo" initial={{ opacity: 0, scale: 1.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, ease: 'easeOut' }}>
          <div className="l1">ARCANE BEASTS</div>
          <div className="l2">アルケイン・ビースト</div>
          <div className="l3">TRADING CARD GAME</div>
        </motion.div>
        <motion.div className="press" animate={leaving ? { scale: 1.3, opacity: 0 } : {}}>
          クリックしてはじめる
        </motion.div>
        <div className="title-foot">Art & audio: Battle for Wesnoth (GPL) · Icons: game-icons.net (CC BY 3.0)</div>
      </div>
      {leaving && <motion.div style={{ position: 'absolute', inset: 0, background: '#fff' }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} transition={{ duration: 0.65 }} />}
    </div>
  );
}
