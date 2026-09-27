import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ALL_CARDS } from '../engine/cards';
import type { EType, Rarity } from '../engine/types';
import { ENERGY_TYPES } from '../engine/types';
import { owned, useStore } from '../state/store';
import { artUrl } from '../lib/assets';
import { CardFace, EnergySymbol } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { foley, playMusic } from '../audio/audio';

const RARITIES: Rarity[] = ['C', 'U', 'R', 'RR', 'SR', 'UR'];

export function Collection() {
  const save = useStore((s) => s.save);
  const update = useStore((s) => s.update);
  const [types, setTypes] = useState<EType[]>([]);
  const [rar, setRar] = useState<Rarity[]>([]);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [newSet] = useState(() => new Set(save.newCards));
  useEffect(() => {
    playMusic('menu');
    // clear NEW flags once viewed
    if (save.newCards.length) update((s) => void (s.newCards = []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = ALL_CARDS.filter((c) => !types.length || (c.kind === 'monster' && types.includes(c.type)) || (c.kind === 'energy' && types.includes(c.energyType)))
    .filter((c) => !rar.length || rar.includes(c.rarity))
    .filter((c) => !ownedOnly || owned(save, c.id) > 0);
  const have = ALL_CARDS.filter((c) => owned(save, c.id) > 0).length;
  const pct = (have / ALL_CARDS.length) * 100;

  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-mountains-01')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar
          title="コレクション"
          right={
            <div className="col-progress">
              {have}/{ALL_CARDS.length}
              <div className="bar">
                <div style={{ width: `${pct}%` }} />
              </div>
              {pct.toFixed(0)}%
            </div>
          }
        />
        <div className="db-right" style={{ left: 'calc(var(--u) * 1)' }}>
          <div className="filters">
            <div className="type-filter">
              {[...ENERGY_TYPES, 'colorless' as EType].map((t) => (
                <button key={t} className={types.includes(t) ? 'on' : ''} onClick={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}>
                  <EnergySymbol type={t} size="100%" />
                </button>
              ))}
            </div>
            <div className="seg">
              {RARITIES.map((r) => (
                <button key={r} className={rar.includes(r) ? 'on' : ''} onClick={() => setRar(rar.includes(r) ? rar.filter((x) => x !== r) : [...rar, r])}>
                  {r}
                </button>
              ))}
            </div>
            <div className="seg">
              <button className={ownedOnly ? 'on' : ''} onClick={() => setOwnedOnly(!ownedOnly)}>
                所持のみ
              </button>
            </div>
          </div>
          <div className="col-grid panel" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(calc(var(--u) * 10.4), 1fr))' }}>
            {list.map((c, i) => {
              const n = owned(save, c.id);
              const isBasicE = c.kind === 'energy' && c.basic;
              return (
                <motion.div
                  key={c.id}
                  className={`col-item ${n ? '' : 'unowned'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 30) * 0.01 }}
                  onClick={() => {
                    if (!n) return;
                    foley.flip();
                    setZoom(c.id);
                  }}
                >
                  <CardFace cid={c.id} />
                  {!n && <div className="q">?</div>}
                  {n > 0 && <div className="cnt">{isBasicE ? '∞' : `×${n}`}</div>}
                  {newSet.has(c.id) && <div className="new">NEW</div>}
                </motion.div>
              );
            })}
          </div>
        </div>
        {zoom && (
          <div className="zoom-back" onClick={() => setZoom(null)}>
            <motion.div className="zoom-card" initial={{ scale: 0.6, rotateY: 90 }} animate={{ scale: 1, rotateY: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }} onClick={(e) => e.stopPropagation()}>
              <CardFace cid={zoom} interactive />
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
