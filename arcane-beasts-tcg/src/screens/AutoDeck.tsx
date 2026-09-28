// おすすめ編成: pick an ace, get a 60-card deck built from your collection
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { aceCandidates, buildDeck, type AutoDeck } from '../engine/autodeck';
import { card, TYPE_JP } from '../engine/cards';
import { owned, useStore } from '../state/store';
import { CardFace, EnergySymbol } from '../ui/Card';
import { foley, sfx } from '../audio/audio';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function AutoDeckModal({ onClose, onBuild }: { onClose: () => void; onBuild: (d: AutoDeck, mode: 'new' | 'replace') => void }) {
  const save = useStore((s) => s.save);
  const own = (id: string) => owned(save, id);
  const aces = useMemo(() => aceCandidates(own).slice(0, 30), [save]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ace, setAce] = useState<string | null>(null);
  const deck = useMemo(() => (ace ? buildDeck(ace, own) : null), [ace, save]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!deck) return [];
    const m = new Map<string, number>();
    for (const id of deck.cards) m.set(id, (m.get(id) ?? 0) + 1);
    return [...m].map(([id, n]) => ({ c: card(id), n }));
  }, [deck]);
  const count = (k: string) => rows.filter((r) => r.c.kind === k).reduce((a, r) => a + r.n, 0);

  return (
    <motion.div className="zoom-back ad-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="panel ad" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.45, ease: EASE_OUT }} onClick={(e) => e.stopPropagation()}>
        <div className="ad-head">
          <h2>おすすめ編成</h2>
          <p>エースにしたいモンスターを選ぶと、持っているカードで60枚のデッキを組みます。</p>
        </div>
        <div className="ad-body">
          <div className="ad-aces">
            {aces.map((m) => (
              <button
                key={m.id}
                className={`ad-ace ${ace === m.name ? 'on' : ''}`}
                onClick={() => {
                  foley.tick();
                  setAce(m.name);
                }}
              >
                <CardFace cid={m.id} />
              </button>
            ))}
            {!aces.length && <div className="ms-empty">エースにできるモンスターを持っていません。パックを開けてみよう。</div>}
          </div>
          <AnimatePresence mode="wait">
            {deck ? (
              <motion.div key={deck.ace} className="ad-preview" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
                <div className="ad-title">
                  <EnergySymbol type={deck.type} size="1.4em" />
                  <b>{deck.ace}</b>のデッキ
                  <span>{TYPE_JP[deck.type]}タイプ</span>
                </div>
                <div className="ad-mix">
                  モンスター {count('monster')} ・ トレーナーズ {count('trainer')} ・ エネルギー {count('energy')}
                </div>
                <div className="ad-list">
                  {rows.map(({ c, n }) => (
                    <div key={c.id} className="ad-row">
                      <span className="n">{n}</span>
                      <span className="nm">{c.name}</span>
                    </div>
                  ))}
                </div>
                {deck.notes.map((t) => (
                  <div key={t} className="ad-note">
                    {t}
                  </div>
                ))}
                <div className="ad-actions">
                  <button className="btn small ghost" onClick={() => { sfx('button'); onBuild(deck, 'replace'); }}>
                    編集中のデッキに上書き
                  </button>
                  <button className="btn small blue" onClick={() => { sfx('button'); onBuild(deck, 'new'); }}>
                    新しいデッキとして作る
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="ad-preview empty">← エースを選んでください</div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
