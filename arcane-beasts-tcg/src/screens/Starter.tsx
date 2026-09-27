import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { STARTER_DECKS } from '../engine/decks';
import { byName } from '../engine/cards';
import { CardFace } from '../ui/Card';
import { artUrl, TYPE_COLOR } from '../lib/assets';
import { foley, sfx, playMusic } from '../audio/audio';

const CHOICES = ['fire', 'water', 'grass'];

export function Starter() {
  const choose = useStore((s) => s.chooseStarter);
  const go = useStore((s) => s.go);
  const [sel, setSel] = useState('fire');
  const [done, setDone] = useState(false);
  useEffect(() => playMusic('menu'), []);
  const d = STARTER_DECKS.find((x) => x.id === sel)!;
  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-castle')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <div className="starter-head">
          <h1 className="title-display">最初の相棒デッキを選ぼう</h1>
          <p>選んだデッキはそのまま使えます。ほかのカードはパックやバトルの報酬で集めよう！</p>
        </div>
        <div className="starter-row">
          {CHOICES.map((id, i) => {
            const deck = STARTER_DECKS.find((x) => x.id === id)!;
            const cover = byName(deck.cover);
            return (
              <motion.div
                key={id}
                className={`starter-opt ${sel === id ? 'sel' : ''}`}
                style={{ ['--glow' as string]: TYPE_COLOR[deck.type].a }}
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: sel === id ? -10 : 0, opacity: 1, scale: sel === id ? 1.04 : 1 }}
                transition={{ delay: i * 0.12, type: 'spring', stiffness: 200, damping: 20 }}
                onClick={() => {
                  setSel(id);
                  foley.flip();
                  sfx('select', 0.5);
                }}
              >
                <CardFace cid={cover.id} interactive />
                <h3 style={{ color: TYPE_COLOR[deck.type].c }}>{deck.name}</h3>
                <p>{deck.description}</p>
              </motion.div>
            );
          })}
        </div>
        <div className="starter-go">
          <button
            className="btn big"
            disabled={done}
            onClick={() => {
              setDone(true);
              sfx('fanfare-short', 0.8);
              foley.rarity(4);
              choose(sel);
              setTimeout(() => go('home'), 900);
            }}
          >
            「{d.name}」で冒険をはじめる
          </button>
        </div>
      </div>
    </div>
  );
}
