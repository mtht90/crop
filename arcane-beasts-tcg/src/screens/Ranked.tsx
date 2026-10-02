// ============================================================================
// ランクマッチ: climb 10級 → 名人 against CPU players of your level
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { expand, ALL_DECKS, validateDeck } from '../engine/decks';
import { RARITY_SYMBOL } from '../engine/cards';
import type { Rarity } from '../engine/types';
import { activeDeck, useStore } from '../state/store';
import { DAN, MEIJIN, msUntilSeasonEnd, PROMOTE_AT, rankOpponent, RANKS, rankReward, seasonLabel } from '../state/ranked';
import { fmtRemain } from '../state/progress';
import { artUrl } from '../lib/assets';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { RankEmblem } from '../ui/RankEmblem';
import { foley, playMusic, sfx } from '../audio/audio';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SCENES = ['story/landscape-battlefield_nohumans', 'story/p-mountains', 'story/p-summer', 'story/landscape-castle', 'story/p-winter', 'story/p-great-tree'];

export function Ranked() {
  const save = useStore((s) => s.save);
  const startBattle = useStore((s) => s.startBattle);
  const go = useStore((s) => s.go);
  useEffect(() => playMusic('menu'), []);
  const r = save.ranked;
  const deck = activeDeck(save);
  const errs = deck ? validateDeck(deck.cards) : ['デッキがありません'];
  const [seed, setSeed] = useState(() => Math.random());
  const opp = useMemo(() => rankOpponent(r.rank, seed), [r.rank, seed]);
  const oppDeck = useMemo(() => ALL_DECKS[Math.floor(seed * 1000) % ALL_DECKS.length], [seed]);
  const pct = r.rank >= MEIJIN ? 1 : r.pts / PROMOTE_AT;
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current?.querySelector('.rt-item.cur') as HTMLElement | null;
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, []);

  const fight = () => {
    if (!deck || errs.length) return;
    sfx('horn-3', 0.7);
    startBattle({
      rival: null,
      playerDeck: deck.cards,
      oppDeck: expand(oppDeck.cards),
      oppName: `${opp.name}（${RANKS[opp.rank]}）`,
      oppPortrait: opp.portrait,
      level: opp.level,
      scene: SCENES[Math.floor(seed * 97) % SCENES.length],
      reward: opp.reward,
      ranked: { oppRank: opp.rank },
    });
  };

  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/p-mountains')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="ランクマッチ" back="arena" />

        <motion.div className="rk-main panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }}>
          <div className="rk-season">
            {seasonLabel(r.season)}
            <span>
              <Icon name="hourglass" /> 残り {fmtRemain(msUntilSeasonEnd())}
            </span>
          </div>
          <motion.div className={`rk-crest ${r.rank >= MEIJIN ? 'meijin' : r.rank >= DAN ? 'dan' : ''}`} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.1 }}>
            <RankEmblem rank={r.rank} size="calc(var(--u) * 15)" />
          </motion.div>
          <div className="rk-name">{RANKS[r.rank]}</div>
          <div className="rk-bar">
            <motion.div className="rk-fill" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.3 }} />
          </div>
          <div className="rk-pts">{r.rank >= MEIJIN ? `名人ポイント ${r.pts}` : `昇格まで ${PROMOTE_AT - r.pts}pt（${r.pts} / ${PROMOTE_AT}）`}</div>
          <div className="rk-rec">
            今シーズン <b>{r.wins}</b>勝 <b>{r.losses}</b>敗{r.streak >= 2 && <span className="rk-streak">{r.streak}連勝中</span>}
            <span className="rk-best">最高 {RANKS[r.best]}</span>
          </div>
          <div className="rk-rules">級は負けても下がりません。初段からは負けるとポイントが減り、0を下回ると降段します。</div>
        </motion.div>

        <motion.div className="rk-opp panel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.1 }}>
          <h3>対戦相手</h3>
          <AnimatePresence mode="wait">
            <motion.div key={seed} className="rk-opp-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
              <img src={artUrl(opp.portrait)} alt="" />
              <div>
                <div className="nm">{opp.name}</div>
                <div className="rk-opp-rank">
                  <RankEmblem rank={opp.rank} size="calc(var(--u) * 2.6)" />
                  {RANKS[opp.rank]}
                </div>
                <div className="rk-opp-deck">使用デッキ：？？？</div>
                <div className="rk-opp-reward">
                  <Icon name="coin" /> 勝利 {opp.reward}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="rk-actions">
            <button
              className="btn small ghost"
              onClick={() => {
                foley.flip();
                setSeed(Math.random());
              }}
            >
              相手を変える
            </button>
            <button className="btn big red" disabled={!!errs.length} onClick={fight}>
              <Icon name="swords" /> 対戦する
            </button>
          </div>
          <div className="rk-deck">
            使用デッキ：<b>{deck?.name ?? '―'}</b>
            <button className="btn small ghost" onClick={() => go('deck')}>
              デッキ変更
            </button>
          </div>
          {errs.length > 0 && <div className="warn">{errs[0]}</div>}
        </motion.div>

        <div className="rk-track panel" ref={track}>
          {RANKS.map((name, i) => {
            const rw = rankReward(i);
            const got = r.claimed.includes(i) || (i <= r.rank && i === 0);
            return (
              <div key={i} className={`rt-item ${i === r.rank ? 'cur' : ''} ${i < r.rank ? 'past' : ''}`}>
                <RankEmblem rank={i} size="calc(var(--u) * 3.6)" />
                <span className="rt-name">{name}</span>
                {i > 0 && (
                  <span className={`rt-reward ${got ? 'got' : ''}`}>
                    <Icon name="coin" />
                    {rw.coins}
                    {Object.entries(rw.shards ?? {}).map(([k, n]) => (
                      <em key={k}>
                        {RARITY_SYMBOL[k as Rarity]}×{n}
                      </em>
                    ))}
                  </span>
                )}
                {got && i > 0 && (
                  <span className="rt-check">
                    <Icon name="check" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
