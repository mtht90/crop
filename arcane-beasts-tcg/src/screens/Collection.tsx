import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { ALL_CARDS, card, RARITIES, RARITY_SYMBOL, SET_INFO, SETS } from '../engine/cards';
import type { EType, Rarity, SetCode } from '../engine/types';
import { ENERGY_TYPES } from '../engine/types';
import { collectionPct, owned, useStore } from '../state/store';
import { artUrl } from '../lib/assets';
import { CardFace, EnergySymbol } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { RarityBadge } from '../ui/RarityBadge';
import { foley, playMusic, sfx } from '../audio/audio';


export function Collection() {
  const save = useStore((s) => s.save);
  const update = useStore((s) => s.update);
  const go = useStore((s) => s.go);
  const [set, setSet] = useState<SetCode | 'all'>('all');
  const [types, setTypes] = useState<EType[]>([]);
  const [rar, setRar] = useState<Rarity[]>([]);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [newSet] = useState(() => new Set(save.newCards));
  useEffect(() => {
    playMusic('menu');
    // clear NEW flags once viewed
    if (save.newCards.length) update((s) => void (s.newCards = []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(
    () =>
      ALL_CARDS.filter((c) => set === 'all' || c.set === set)
        .filter((c) => !types.length || (c.kind === 'monster' && types.includes(c.type)) || (c.kind === 'energy' && types.includes(c.energyType)))
        .filter((c) => !rar.length || rar.includes(c.rarity))
        .filter((c) => !ownedOnly || owned(save, c.id) > 0),
    [set, types, rar, ownedOnly, save],
  );
  const scope = ALL_CARDS.filter((c) => set === 'all' || c.set === set);
  const have = scope.filter((c) => owned(save, c.id) > 0).length;
  const pct = collectionPct(save, set === 'all' ? undefined : set);

  const nFilters = types.length + rar.length + (ownedOnly ? 1 : 0);

  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-mountains-01')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="コレクション" back="more" />
        <div className="page-inner col3">
          <div className="box col3-progress">
            <div className="col3-pct">
              <b>{pct.toFixed(0)}%</b>
              <small>
                {have} / {scope.length} 種類
              </small>
            </div>
            <div className="ms3-bar">
              <div style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
          </div>

          <div className="ms3-tabs">
            {(['all', ...SETS] as const).map((k) => (
              <button key={k} className={`chip-btn ${set === k ? 'on' : ''}`} onClick={() => (foley.tick(), setSet(k))}>
                {k === 'all' ? '全章' : SET_INFO[k].short}
              </button>
            ))}
            <button className={`chip-btn ${showFilter || nFilters ? 'on' : ''}`} onClick={() => setShowFilter(!showFilter)}>
              <Icon name="filter" /> 絞り込み{nFilters ? ` ${nFilters}` : ''}
            </button>
          </div>

          <AnimatePresence initial={false}>
            {showFilter && (
              <motion.div className="box col3-filter" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                <div className="col3-frow">
                  <span>タイプ</span>
                  <div className="db3-types">
                    {[...ENERGY_TYPES, 'colorless' as EType].map((t) => (
                      <button key={t} className={types.includes(t) ? 'on' : ''} onClick={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}>
                        <EnergySymbol type={t} size="100%" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col3-frow">
                  <span>レア度</span>
                  <div className="db3-chips">
                    {RARITIES.map((r) => (
                      <button key={r} className={`chip-btn rb-${r} ${rar.includes(r) ? 'on' : ''}`} onClick={() => setRar(rar.includes(r) ? rar.filter((x) => x !== r) : [...rar, r])}>
                        {RARITY_SYMBOL[r]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col3-frow">
                  <span>表示</span>
                  <div className="db3-chips">
                    <button className={`chip-btn ${ownedOnly ? 'on' : ''}`} onClick={() => setOwnedOnly(!ownedOnly)}>
                      持っているカードだけ
                    </button>
                    {nFilters > 0 && (
                      <button
                        className="chip-btn"
                        onClick={() => {
                          setTypes([]);
                          setRar([]);
                          setOwnedOnly(false);
                        }}
                      >
                        リセット
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="col3-grid">
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
            {!list.length && <div className="empty-note" style={{ gridColumn: '1 / -1' }}>該当するカードはありません</div>}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {zoom && (
          <motion.div className="zoom-back db3-zoom" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setZoom(null)}>
            <motion.div className="zoom-card" initial={{ scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} onClick={(e) => e.stopPropagation()}>
              <CardFace cid={zoom} interactive />
              <div className="zoom-label">
                <RarityBadge r={card(zoom).rarity} named />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
