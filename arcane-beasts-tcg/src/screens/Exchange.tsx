// ============================================================================
// かけら交換所: duplicates past the 10th copy become shards of their rarity;
// shards buy any card of the same rarity.
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { ALL_CARDS, RARITY_NAME, SET_INFO, SETS } from '../engine/cards';
import { RarityBadge } from '../ui/RarityBadge';
import type { Rarity, SetCode } from '../engine/types';
import { MAX_COPIES, owned, SHARD_COST, SHARD_RARITIES, useStore } from '../state/store';
import { artUrl } from '../lib/assets';
import { CardFace } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { foley, playMusic, sfx } from '../audio/audio';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const RARITY_LABEL = RARITY_NAME;

export function Exchange() {
  const save = useStore((s) => s.save);
  const exchange = useStore((s) => s.exchange);
  useEffect(() => playMusic('shop'), []);
  const firstWithShards = SHARD_RARITIES.find((r) => (save.shards[r] ?? 0) > 0) ?? 'C';
  const [rar, setRar] = useState<Rarity>(firstWithShards);
  const [set, setSet] = useState<SetCode | 'all'>('all');
  const [missingOnly, setMissingOnly] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [got, setGot] = useState<string | null>(null);

  const have = save.shards[rar] ?? 0;
  const cost = SHARD_COST[rar];
  const list = useMemo(
    () =>
      ALL_CARDS.filter((c) => c.rarity === rar && !(c.kind === 'energy' && c.basic))
        .filter((c) => set === 'all' || c.set === set)
        .filter((c) => !missingOnly || owned(save, c.id) === 0),
    [rar, set, missingOnly, save],
  );

  const doExchange = () => {
    if (!pick) return;
    if (exchange(pick)) {
      foley.rarity(3);
      sfx('magic-holy-2', 0.5);
      setGot(pick);
      setPick(null);
    } else sfx('miss-2', 0.5);
  };

  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/grim-altar')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="かけら交換所" back="home" />
        <div className="ex-side">
          <div className="ex-note">
            <Icon name="shard" />
            <p>
              同じカードの<b>{MAX_COPIES + 1}枚目</b>以降は、自動でそのレアリティの<b>かけら</b>になります。かけらを集めると、同じレアリティの好きなカードと交換できます。
            </p>
          </div>
          <div className="ex-rars">
            {SHARD_RARITIES.map((r) => {
              const n = save.shards[r] ?? 0;
              const c = SHARD_COST[r];
              return (
                <button
                  key={r}
                  className={`ex-rar ${rar === r ? 'on' : ''} ${n >= c ? 'ready' : ''}`}
                  onClick={() => {
                    foley.tick();
                    setRar(r);
                  }}
                >
                  <RarityBadge r={r} />
                  <span className="nm">{RARITY_LABEL[r]}</span>
                  <span className="ct">
                    {n}
                    <small>/{c}</small>
                  </span>
                  <span className="xb">
                    <i style={{ transform: `scaleX(${Math.min(1, n / c)})` }} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="ex-main panel">
          <div className="ex-head">
            <RarityBadge r={rar} />
            <h2>{RARITY_LABEL[rar]}</h2>
            <span className="ex-have">
              <Icon name="shard" /> {have} <small>/ 交換に{cost}個</small>
            </span>
            <div className="seg" style={{ marginLeft: 'auto' }}>
              {(['all', ...SETS] as const).map((k) => (
                <button key={k} className={set === k ? 'on' : ''} onClick={() => setSet(k)}>
                  {k === 'all' ? '全弾' : SET_INFO[k].short}
                </button>
              ))}
            </div>
            <div className="seg">
              <button className={missingOnly ? 'on' : ''} onClick={() => setMissingOnly(!missingOnly)}>
                未所持のみ
              </button>
            </div>
          </div>
          <div className="col-grid ex-grid">
            {list.map((c, i) => {
              const n = owned(save, c.id);
              const full = n >= MAX_COPIES;
              return (
                <motion.div
                  key={c.id}
                  className={`col-item ex-item ${full ? 'maxed' : ''} ${have >= cost && !full ? 'can' : ''}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 24) * 0.012, duration: 0.4, ease: EASE_OUT }}
                  onClick={() => {
                    if (full) return;
                    foley.flip();
                    setPick(c.id);
                  }}
                >
                  <CardFace cid={c.id} />
                  <div className={`cnt ${n ? '' : 'zero'}`}>{full ? '上限' : n ? `×${n}` : '未所持'}</div>
                </motion.div>
              );
            })}
            {!list.length && <div className="ms-empty" style={{ gridColumn: '1 / -1' }}>交換できるカードはありません</div>}
          </div>
        </div>

        <AnimatePresence>
          {pick && (
            <motion.div className="zoom-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPick(null)}>
              <motion.div className="ex-confirm" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }} onClick={(e) => e.stopPropagation()}>
                <div className="zoom-card">
                  <CardFace cid={pick} interactive />
                </div>
                <div className="ex-confirm-side">
                  <RarityBadge r={rar} />
                  <h3>このカードと交換しますか？</h3>
                  <div className="ex-cost">
                    <Icon name="shard" /> {RARITY_LABEL[rar]}のかけら <b>{cost}</b> 個
                  </div>
                  <div className="ex-after">
                    かけら {have} → <b className={have < cost ? 'ng' : ''}>{have - cost}</b>
                  </div>
                  <div className="ex-actions">
                    <button className="pill ghost" onClick={() => setPick(null)}>
                      やめる
                    </button>
                    <button className="pill gold" disabled={have < cost} onClick={doExchange}>
                      交換する
                    </button>
                  </div>
                  {have < cost && <div className="ex-need">かけらがあと {cost - have} 個必要です</div>}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {got && (
            <motion.div className="zoom-back ex-got" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setGot(null)}>
              <motion.div className="ex-got-ring" initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 1.1, ease: EASE_OUT }} />
              <motion.div className="zoom-card" initial={{ rotateY: 180, scale: 0.8 }} animate={{ rotateY: 0, scale: 1 }} transition={{ duration: 0.9, ease: EASE_OUT }} onClick={(e) => e.stopPropagation()}>
                <CardFace cid={got} interactive />
              </motion.div>
              <motion.div className="ex-got-label" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                入手しました
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
