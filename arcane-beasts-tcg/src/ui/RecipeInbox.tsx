// ============================================================================
// A デッキレシピ just won: shown once, between screens (never over a battle).
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { foley } from '../audio/audio';
import { recipeById } from '../state/recipes';
import { useStore } from '../state/store';
import { CardFace } from './Card';

const QUIET = ['battle', 'scene', 'title', 'starter'];

export function RecipeInbox() {
  const inbox = useStore((s) => s.save.recipeInbox);
  const screen = useStore((s) => s.screen);
  const id = inbox?.[0];
  // a moment after it is won, so whatever paid it out (a stamp, a result) is seen first
  const [ready, setReady] = useState(false);
  const quiet = QUIET.includes(screen);
  useEffect(() => {
    setReady(false);
    if (!id || quiet) return;
    const t = setTimeout(() => setReady(true), 1800);
    return () => clearTimeout(t);
  }, [id, quiet]);
  const r = id && ready ? recipeById(id) : null;
  useEffect(() => {
    if (r) foley.rarity(3);
  }, [r]);
  const next = () => useStore.getState().update((s) => void (s.recipeInbox = (s.recipeInbox ?? []).slice(1)));
  return (
    <AnimatePresence>
      {r && (
        <motion.div key={r.id} className="recipe-got-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={next}>
          <motion.div className="panel recipe-got" initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} onClick={(e) => e.stopPropagation()}>
            <small>デッキレシピを手に入れた</small>
            <motion.div className="recipe-got-card" initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
              <CardFace cid={r.cover} />
            </motion.div>
            <b>{r.name}</b>
            <div className="recipe-got-btns">
              <button
                className="btn small ghost"
                onClick={() => {
                  next();
                  useStore.getState().go('deck');
                }}
              >
                デッキで見る
              </button>
              <button className="btn small" onClick={next}>
                OK
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
