// Before the prologue: the player names their character and picks a look.
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { artUrl } from '../lib/assets';
import { foley, sfx } from '../audio/audio';
import { HERO_LOOKS } from './cast';
import './hero.css';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function HeroCreate({ initial, onDone, onCancel }: { initial?: { name: string; look: string }; onDone: (h: { name: string; look: string }) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [look, setLook] = useState(initial?.look ?? HERO_LOOKS[0].id);
  const sel = HERO_LOOKS.find((h) => h.id === look) ?? HERO_LOOKS[0];
  const ok = name.trim().length > 0;
  return (
    <motion.div className="hc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <div className="hc-bg" style={{ backgroundImage: `url(${artUrl('story/p-sunset-town')})` }} />
      <div className="hc-shade" />
      <div className="stage">
        {/* the chosen look, large */}
        <div className="hc-hero">
          <AnimatePresence mode="popLayout">
            <motion.img
              key={look}
              src={artUrl(sel.look.normal)}
              alt=""
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            />
          </AnimatePresence>
          <div className="hc-plate">
            <small>{sel.label}</small>
            <b>{name.trim() || '？？？'}</b>
          </div>
        </div>

        <motion.div className="hc-form" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.6, ease: EASE_OUT }}>
          <div className="hc-kick">PROLOGUE</div>
          <h2>あなたは、だれ？</h2>
          <p>物語の主人公の名前と姿を決めてください。あとから変えることもできます。</p>
          <label className="hc-label">なまえ</label>
          <input
            className="hc-name"
            value={name}
            maxLength={8}
            placeholder="8文字まで"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ok && onDone({ name: name.trim(), look })}
            autoFocus
          />
          <label className="hc-label">すがた</label>
          <div className="hc-grid">
            {HERO_LOOKS.map((h, i) => (
              <motion.button
                key={h.id}
                className={`hc-look ${h.id === look ? 'on' : ''}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.05, duration: 0.4, ease: EASE_OUT }}
                onClick={() => {
                  foley.tick();
                  setLook(h.id);
                }}
              >
                <img src={artUrl(h.look.normal)} alt="" />
                <span>{h.label}</span>
              </motion.button>
            ))}
          </div>
          <div className="hc-actions">
            <button className="btn ghost" onClick={onCancel}>
              もどる
            </button>
            <button
              className="btn big red"
              disabled={!ok}
              onClick={() => {
                sfx('fanfare-short', 0.5);
                onDone({ name: name.trim(), look });
              }}
            >
              この姿で旅立つ
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
