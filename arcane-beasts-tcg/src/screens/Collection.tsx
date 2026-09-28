import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { ALL_CARDS, card, MODEL_NAME, modelOf, RARITY_SYMBOL, SET_INFO, SETS, type Model } from '../engine/cards';
import type { EType, Rarity, SetCode } from '../engine/types';
import { ENERGY_TYPES } from '../engine/types';
import { collectionPct, owned, SHARD_RARITIES, useStore } from '../state/store';
import { artUrl } from '../lib/assets';
import { CardFace, EnergySymbol } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { RarityBadge } from '../ui/RarityBadge';
import { foley, playMusic, sfx } from '../audio/audio';

type Kind = 'all' | Model;
const KINDS: [Kind, string][] = [['all', 'すべて'], ...(Object.entries(MODEL_NAME) as [Model, string][])];

export function Collection() {
  const save = useStore((s) => s.save);
  const update = useStore((s) => s.update);
  const go = useStore((s) => s.go);
  const [set, setSet] = useState<SetCode | 'all'>('all');
  const [kind, setKind] = useState<Kind>('all');
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

  const list = useMemo(
    () =>
      ALL_CARDS.filter((c) => set === 'all' || c.set === set)
        .filter((c) => kind === 'all' || modelOf(c) === kind)
        .filter((c) => !types.length || (c.kind === 'monster' && types.includes(c.type)) || (c.kind === 'energy' && types.includes(c.energyType)))
        .filter((c) => !rar.length || rar.includes(c.rarity))
        .filter((c) => !ownedOnly || owned(save, c.id) > 0),
    [set, kind, types, rar, ownedOnly, save],
  );
  const scope = ALL_CARDS.filter((c) => set === 'all' || c.set === set);
  const have = scope.filter((c) => owned(save, c.id) > 0).length;
  const pct = collectionPct(save, set === 'all' ? undefined : set);
  const shardTotal = SHARD_RARITIES.reduce((n, r) => n + (save.shards[r] ?? 0), 0);

  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-mountains-01')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar
          title="コレクション"
          right={
            <>
              <button
                className="shard-btn"
                onClick={() => {
                  sfx('button');
                  go('exchange');
                }}
              >
                <Icon name="shard" /> かけら {shardTotal}
                <span>交換所へ</span>
              </button>
              <div className="col-progress">
                {have}/{scope.length}
                <div className="bar">
                  <div style={{ width: `${pct}%` }} />
                </div>
                {pct.toFixed(0)}%
              </div>
            </>
          }
        />
        <div className="db-right" style={{ left: 'calc(var(--u) * 1)' }}>
          <div className="filters">
            <div className="seg">
              {(['all', ...SETS] as const).map((k) => (
                <button key={k} className={set === k ? 'on' : ''} onClick={() => setSet(k)}>
                  {k === 'all' ? '全弾' : SET_INFO[k].short}
                </button>
              ))}
            </div>
            <div className="seg">
              {KINDS.map(([k, label]) => (
                <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="type-filter">
              {[...ENERGY_TYPES, 'colorless' as EType].map((t) => (
                <button key={t} className={types.includes(t) ? 'on' : ''} onClick={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}>
                  <EnergySymbol type={t} size="100%" />
                </button>
              ))}
            </div>
            <div className="seg rar">
              {SHARD_RARITIES.map((r) => (
                <button key={r} className={rar.includes(r) ? 'on' : ''} onClick={() => setRar(rar.includes(r) ? rar.filter((x) => x !== r) : [...rar, r])}>
                  {RARITY_SYMBOL[r]}
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
            {!list.length && <div className="ms-empty" style={{ gridColumn: '1 / -1' }}>該当するカードはありません</div>}
          </div>
        </div>
        <AnimatePresence>
          {zoom && (
            <motion.div className="zoom-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setZoom(null)}>
              <motion.div className="zoom-card" initial={{ scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} onClick={(e) => e.stopPropagation()}>
                <CardFace cid={zoom} interactive />
                <div className="zoom-label">
                  <RarityBadge r={card(zoom).rarity} named />
                  <span>{MODEL_NAME[modelOf(card(zoom))]}モデル</span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
