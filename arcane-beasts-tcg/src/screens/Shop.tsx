import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { CardDef } from '../engine/types';
import { openPack, PACK_PRICE, RARITY_ORDER, useStore } from '../state/store';
import { artUrl } from '../lib/assets';
import { CardBack, CardFace } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { foley, playMusic, sfx } from '../audio/audio';
import { particles } from '../battle/particles';

type Phase = 'idle' | 'tear' | 'reveal' | 'summary';

export function Shop() {
  const save = useStore((s) => s.save);
  const update = useStore((s) => s.update);
  const addCards = useStore((s) => s.addCards);
  const [phase, setPhase] = useState<Phase>('idle');
  const [cards, setCards] = useState<CardDef[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => playMusic('shop'), []);
  useEffect(() => {
    particles.attach(canvas.current);
    return () => particles.attach(null);
  }, [phase]);

  const buy = () => {
    if (save.coins < PACK_PRICE) return sfx('miss-2', 0.5);
    const got = openPack().sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
    const fresh = new Set(got.filter((c) => !(save.collection[c.id] ?? 0)).map((c) => c.id));
    update((s) => {
      s.coins -= PACK_PRICE;
      s.packsOpened++;
    });
    addCards(got.map((c) => c.id));
    setNewIds(fresh);
    setCards(got);
    setIdx(0);
    setFlipped(false);
    setPhase('tear');
    sfx('open-chest', 0.7);
  };

  const tear = () => {
    foley.whoosh();
    sfx('throw-1', 0.6);
    setTimeout(() => setPhase('reveal'), 550);
  };

  const cur = cards[idx];
  const rank = cur ? RARITY_ORDER[cur.rarity] : 0;

  const flip = () => {
    if (!cur) return;
    if (!flipped) {
      setFlipped(true);
      foley.flip();
      if (rank >= 2) {
        setTimeout(() => {
          foley.rarity(rank);
          const c = canvas.current?.getBoundingClientRect();
          if (c) particles.burst(c.width / 2, c.height / 2, rank >= 4 ? 'rainbow' : rank >= 3 ? 'sparkle' : 'gold', 40 + rank * 25, 1.6);
          if (rank >= 4) {
            sfx('fanfare-short', 0.8);
            const iv = setInterval(() => particles.shower('rainbow', 10), 100);
            setTimeout(() => clearInterval(iv), 1500);
          } else if (rank >= 3) sfx('magic-holy-1', 0.7);
        }, 380);
      }
      return;
    }
    // next card
    foley.slide();
    if (idx + 1 >= cards.length) {
      setPhase('summary');
      return;
    }
    setIdx(idx + 1);
    setFlipped(false);
  };

  const skip = () => {
    foley.shuffle();
    setPhase('summary');
  };

  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/swamp-02')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="パック開封" />
        <div className="shop-main">
          <motion.div className="pack" whileHover={{ rotate: -2, scale: 1.04, y: -6 }} onClick={buy} animate={{ y: [0, -8, 0] }} transition={{ y: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}>
            <img className="fig" src={artUrl('monsters/fire-dragon')} alt="" />
            <div className="pack-logo">
              ARCANE BEASTS
              <small>BOOSTER PACK</small>
            </div>
            <div className="pack-name">第1弾「目覚めの咆哮」</div>
            <div className="foil" />
          </motion.div>
          <div className="panel shop-info">
            <h2 className="title-display">目覚めの咆哮</h2>
            <p>全{`${cardsTotal()}`}種のカードが収録された拡張パック。1パック10枚入り、レア以上が必ず1枚入っています。フルアートのSRや、黄金に輝くURを狙え！</p>
            <div className="odds">
              <b>R</b>
              <span>レア（1枚確定）</span>
              <b>RR</b>
              <span>Ωモンスター 約22%</span>
              <b>SR</b>
              <span>フルアート 約7%</span>
              <b>UR</b>
              <span>ゴールド 約3%</span>
            </div>
            <button className="btn big" disabled={save.coins < PACK_PRICE} onClick={buy}>
              <Icon name="coin" /> {PACK_PRICE} で1パック開ける
            </button>
            {save.coins < PACK_PRICE && <div className="warn">コインが足りません。バトルで勝利してコインを集めよう！</div>}
            <div style={{ color: 'var(--ink-dim)', fontSize: 'calc(var(--u) * 0.9)' }}>これまでに開けたパック：{save.packsOpened}</div>
          </div>
        </div>

        <AnimatePresence>
          {phase !== 'idle' && (
            <motion.div className="opening" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="rays" />
              <canvas ref={canvas} className="fx-canvas" style={{ zIndex: 5, pointerEvents: 'none' }} />

              {phase === 'tear' && (
                <motion.div
                  className="pack"
                  style={{ width: 'calc(var(--u) * 22)' }}
                  initial={{ scale: 0.4, rotate: -20, y: 200 }}
                  animate={{ scale: 1, rotate: [0, -3, 3, -3, 0], y: 0 }}
                  transition={{ type: 'spring', stiffness: 160, damping: 14, rotate: { delay: 0.6, duration: 0.5, repeat: Infinity, repeatDelay: 0.8 } }}
                  onClick={tear}
                  exit={{ scale: 1.4, opacity: 0 }}
                >
                  <img className="fig" src={artUrl('monsters/fire-dragon')} alt="" />
                  <div className="pack-logo">
                    ARCANE BEASTS
                    <small>BOOSTER PACK</small>
                  </div>
                  <div className="pack-tear" />
                  <div className="pack-name">クリックして開封！</div>
                  <div className="foil" />
                </motion.div>
              )}

              {phase === 'reveal' && cur && (
                <>
                  {flipped && rank >= 2 && (
                    <motion.div className={`reveal-rarity`} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35 }} style={{ color: rank >= 4 ? '#ffe08a' : rank >= 3 ? '#ff9ad8' : '#ffe7a0', zIndex: 6 }}>
                      {cur.rarity === 'UR' ? 'ULTRA RARE' : cur.rarity === 'SR' ? 'SECRET RARE' : cur.rarity === 'RR' ? 'DOUBLE RARE' : 'RARE'}
                    </motion.div>
                  )}
                  <div className="reveal-stack">
                    {cards.slice(idx + 1, idx + 4).map((c, i) => (
                      <div key={`s${idx + 1 + i}`} style={{ position: 'absolute', inset: 0, transform: `translate(${(i + 1) * 6}px, ${(i + 1) * 6}px)`, zIndex: -i - 1 }}>
                        <CardBack />
                      </div>
                    ))}
                    {flipped && rank >= 2 && <motion.div className={`rarity-burst ${cur.rarity}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3, duration: 0.6 }} />}
                    <motion.div
                      key={idx}
                      className="reveal-card"
                      initial={{ x: -300, opacity: 0, rotateY: 0 }}
                      animate={{ x: 0, opacity: 1, rotateY: flipped ? 180 : 0, scale: flipped && rank >= 4 ? [1, 1.12, 1] : 1 }}
                      transition={{ x: { type: 'spring', stiffness: 260, damping: 26 }, rotateY: { duration: rank >= 4 ? 0.9 : 0.5, ease: 'easeInOut' } }}
                      onClick={flip}
                    >
                      <div className="reveal-back">
                        <CardBack />
                      </div>
                      <div className="reveal-face">
                        <CardFace cid={cur.id} interactive={flipped} />
                        {newIds.has(cur.id) && <div className="new" style={{ position: 'absolute', left: -8, top: -8, background: '#e03131', color: '#fff', fontWeight: 900, padding: '2px 10px', borderRadius: 6 }}>NEW</div>}
                      </div>
                    </motion.div>
                  </div>
                  <div className="reveal-hint">
                    {flipped ? 'クリックで次へ' : 'クリックでめくる'}　{idx + 1}/{cards.length}
                    <button className="btn small ghost" style={{ marginLeft: 16 }} onClick={skip}>
                      すべて表示
                    </button>
                  </div>
                </>
              )}

              {phase === 'summary' && (
                <motion.div className="summary" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                  <div className="modal-title" style={{ fontSize: 'calc(var(--u) * 2.4)' }}>
                    開封結果
                  </div>
                  <div className="summary-grid">
                    {cards.map((c, i) => (
                      <motion.div key={i} className="item" initial={{ opacity: 0, y: 30, rotateY: 90 }} animate={{ opacity: 1, y: 0, rotateY: 0 }} transition={{ delay: i * 0.06 }}>
                        <CardFace cid={c.id} interactive />
                        {newIds.has(c.id) && <div className="new">NEW</div>}
                      </motion.div>
                    ))}
                  </div>
                  <div className="modal-actions">
                    <button className="btn ghost big" onClick={() => setPhase('idle')}>
                      閉じる
                    </button>
                    <button className="btn big" disabled={save.coins < PACK_PRICE} onClick={buy}>
                      もう1パック（{PACK_PRICE}）
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

import { ALL_CARDS } from '../engine/cards';
function cardsTotal() {
  return ALL_CARDS.length;
}
