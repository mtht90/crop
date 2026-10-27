import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { activeDeck, RIVALS, useStore } from '../state/store';
import { expand, ALL_DECKS, deckById, validateDeck } from '../engine/decks';
import { byName, SET_INFO, SETS, TYPE_JP } from '../engine/cards';
import type { SetCode } from '../engine/types';
import type { Difficulty } from '../engine/ai';
import { artUrl } from '../lib/assets';
import { CardFace, EnergySymbol } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { TopBar } from '../ui/TopBar';
import { foley, playMusic, sfx } from '../audio/audio';

const LV: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };

export function Rivals() {
  const save = useStore((s) => s.save);
  const startBattle = useStore((s) => s.startBattle);
  const go = useStore((s) => s.go);
  const setOf = (i: number) => RIVALS[i].set ?? 'AB1';
  const firstOpen = RIVALS.findIndex((r) => !save.beaten.includes(r.id));
  const [sel, setSel] = useState(Math.max(0, firstOpen === -1 ? RIVALS.length - 1 : firstOpen));
  const [rset, setRset] = useState<SetCode>(() => setOf(Math.max(0, firstOpen === -1 ? RIVALS.length - 1 : firstOpen)));
  const shown = RIVALS.map((rv, i) => ({ rv, i })).filter((x) => setOf(x.i) === rset);
  const [freeDeck, setFreeDeck] = useState('fire');
  const [freeLv, setFreeLv] = useState<Difficulty>('normal');
  useEffect(() => playMusic('menu'), []);

  const deck = activeDeck(save);
  const errs = deck ? validateDeck(deck.cards) : ['デッキがありません'];
  // each set is its own ladder: the first rival of a set is always open
  const unlocked = (i: number) => i === 0 || setOf(i - 1) !== setOf(i) || save.beaten.includes(RIVALS[i - 1].id);
  const numInSet = (i: number) => RIVALS.slice(0, i + 1).filter((_, k) => setOf(k) === setOf(i)).length;
  const r = RIVALS[sel];
  const rdeck = deckById(r.deck);
  const keyCards = rdeck.cards
    .map(([n]) => byName(n))
    .filter((c) => c.kind === 'monster' && (c.rarity >= 4 || c.stage === 'stage2'))
    .slice(0, 3);

  const fight = (spectate = false) => {
    if (!deck || errs.length) return;
    sfx('horn-3', 0.7);
    startBattle({
      rival: r,
      playerDeck: deck.cards,
      oppDeck: expand(rdeck.cards),
      oppName: r.name,
      oppPortrait: r.portrait,
      level: r.level,
      scene: r.scene,
      reward: r.reward,
      spectate,
    });
  };

  const fightFree = (spectate = false) => {
    if (!deck || errs.length) return;
    const d = deckById(freeDeck);
    sfx('horn-3', 0.7);
    startBattle({
      rival: null,
      playerDeck: deck.cards,
      oppDeck: expand(d.cards),
      oppName: `CPU（${d.name}）`,
      oppPortrait: 'humans/mage-silver',
      level: freeLv,
      scene: 'story/landscape-battlefield_nohumans',
      reward: freeLv === 'easy' ? 60 : freeLv === 'normal' ? 100 : 150,
      spectate,
    });
  };

  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl(r.scene)})` }} key={r.scene} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="フリー対戦" back="arena" />
        <div className="page-inner rv3">
          {/* the deck you bring */}
          <button className="box arena3-deck" onClick={() => go('deck')}>
            {deck && <CardFace cid={deck.cover} />}
            <span className="arena3-deck-text">
              <small>使用デッキ</small>
              <b>{deck?.name ?? 'デッキがありません'}</b>
              {errs.length > 0 && <span className="warn">{errs[0]}</span>}
            </span>
            <span className="chip-btn">変更</span>
          </button>

          {/* rivals */}
          <h3 className="section-title">強敵に挑む</h3>
          <div className="ms3-tabs">
            {SETS.map((k) => (
              <button
                key={k}
                className={`chip-btn ${rset === k ? 'on' : ''}`}
                onClick={() => {
                  foley.tick();
                  setRset(k);
                  const first = RIVALS.findIndex((rv, i) => setOf(i) === k && !save.beaten.includes(rv.id));
                  setSel(first === -1 ? RIVALS.findIndex((_, i) => setOf(i) === k) : first);
                }}
              >
                {SET_INFO[k].short}の強敵
              </button>
            ))}
          </div>
          <div className="rv3-list">
            {shown.map(({ rv, i }) => {
              const open = unlocked(i);
              return (
                <button
                  key={rv.id}
                  className={`rv3-card ${sel === i ? 'sel' : ''} ${open ? '' : 'locked'}`}
                  onClick={() => {
                    if (!open) return sfx('miss-2', 0.4);
                    foley.flip();
                    setSel(i);
                  }}
                >
                  <img className="scene" src={artUrl(rv.scene)} alt="" />
                  <img className="por" src={artUrl(rv.portrait)} alt="" />
                  <span className="num">{numInSet(i)}</span>
                  {save.beaten.includes(rv.id) && <span className="cleared">CLEAR</span>}
                  {!open && (
                    <span className="lock">
                      <Icon name="lock" />
                    </span>
                  )}
                  <span className="rname">{open ? rv.name : '？？？'}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={r.id} className="box rv3-detail" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <div className="rv3-top">
                <img className="rv3-por" src={artUrl(r.portrait)} alt="" />
                <div className="rv3-info">
                  <small>
                    {SET_INFO[setOf(sel)].short} 第{numInSet(sel)}の強敵 ・ {r.title}
                  </small>
                  <h2>{r.name}</h2>
                  <div className="rv3-meta">
                    <EnergySymbol type={rdeck.type} size="1.2em" />
                    <span>
                      {rdeck.name}（{TYPE_JP[rdeck.type]}）
                    </span>
                  </div>
                  <div className="rv3-meta">
                    <span className="stars">
                      {'★'.repeat(LV[r.level])}
                      {'☆'.repeat(3 - LV[r.level])}
                    </span>
                    <span>
                      報酬 <b>{r.reward}</b>コイン{!save.beaten.includes(r.id) && '（初勝利+200）'}
                    </span>
                  </div>
                </div>
              </div>
              <p className="rv3-intro">「{r.intro}」</p>
              <div className="rv3-keys">
                <small>切り札</small>
                <div>
                  {keyCards.map((c) => (
                    <CardFace key={c.id} cid={c.id} interactive />
                  ))}
                </div>
              </div>
              <button className="btn big red rv3-go" disabled={!!errs.length} onClick={() => fight()}>
                <Icon name="swords" /> 挑戦する
              </button>
            </motion.div>
          </AnimatePresence>

          {/* free play against any recipe */}
          <h3 className="section-title">好きなデッキと対戦</h3>
          <div className="box rv3-free">
            <div className="db3-chips rv3-decks">
              {ALL_DECKS.map((d) => (
                <button key={d.id} className={`chip-btn ${freeDeck === d.id ? 'on' : ''}`} onClick={() => setFreeDeck(d.id)}>
                  <EnergySymbol type={d.type} size="1.1em" /> {d.name}
                </button>
              ))}
            </div>
            <div className="rv3-free-row">
              <div className="db3-chips">
                {(['easy', 'normal', 'hard'] as Difficulty[]).map((l) => (
                  <button key={l} className={`chip-btn ${freeLv === l ? 'on' : ''}`} onClick={() => setFreeLv(l)}>
                    {l === 'easy' ? 'かんたん' : l === 'normal' ? 'ふつう' : 'むずかしい'}
                  </button>
                ))}
              </div>
              <span className="db3-spacer" />
              <button className="btn small ghost" title="自分のデッキとCPUのデッキで、CPU同士が対戦します" disabled={!!errs.length} onClick={() => fightFree(true)}>
                CPU同士を観る
              </button>
              <button className="btn small blue" disabled={!!errs.length} onClick={() => fightFree()}>
                対戦する
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
