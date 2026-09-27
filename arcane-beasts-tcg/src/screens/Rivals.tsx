import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { activeDeck, RIVALS, useStore } from '../state/store';
import { expand, STARTER_DECKS, validateDeck } from '../engine/decks';
import { byName, TYPE_JP } from '../engine/cards';
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
  const firstOpen = RIVALS.findIndex((r) => !save.beaten.includes(r.id));
  const [sel, setSel] = useState(Math.max(0, firstOpen === -1 ? RIVALS.length - 1 : firstOpen));
  const [freeDeck, setFreeDeck] = useState('fire');
  const [freeLv, setFreeLv] = useState<Difficulty>('normal');
  useEffect(() => playMusic('menu'), []);

  const deck = activeDeck(save);
  const errs = deck ? validateDeck(deck.cards) : ['デッキがありません'];
  const unlocked = (i: number) => i === 0 || save.beaten.includes(RIVALS[i - 1].id);
  const r = RIVALS[sel];
  const rdeck = STARTER_DECKS.find((d) => d.id === r.deck)!;
  const keyCards = rdeck.cards
    .map(([n]) => byName(n))
    .filter((c) => c.kind === 'monster' && (c.omega || c.stage === 'stage2'))
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
    const d = STARTER_DECKS.find((x) => x.id === freeDeck)!;
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
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl(r.scene)})` }} key={r.scene} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="バトル" />
        <div className="rival-list">
          {RIVALS.map((rv, i) => {
            const open = unlocked(i);
            return (
              <motion.div
                key={rv.id}
                className={`rival-card ${sel === i ? 'sel' : ''} ${open ? '' : 'locked'}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => {
                  if (!open) return sfx('miss-2', 0.4);
                  foley.flip();
                  setSel(i);
                }}
              >
                <img className="scene" src={artUrl(rv.scene)} alt="" />
                <img className="por" src={artUrl(rv.portrait)} alt="" />
                <div className="num">{i + 1}</div>
                {save.beaten.includes(rv.id) && <div className="cleared">CLEAR</div>}
                {!open && (
                  <div className="lock">
                    <Icon name="lock" />
                  </div>
                )}
                <div className="rname">
                  {open ? rv.name : '？？？'}
                  <small>{open ? rv.title : '前の相手を倒すと解放'}</small>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="panel free-box">
          <h3>フリー対戦</h3>
          <div className="seg">
            {STARTER_DECKS.map((d) => (
              <button key={d.id} className={freeDeck === d.id ? 'on' : ''} onClick={() => setFreeDeck(d.id)}>
                {d.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="seg">
              {(['easy', 'normal', 'hard'] as Difficulty[]).map((l) => (
                <button key={l} className={freeLv === l ? 'on' : ''} onClick={() => setFreeLv(l)}>
                  {l === 'easy' ? 'かんたん' : l === 'normal' ? 'ふつう' : 'むずかしい'}
                </button>
              ))}
            </div>
            <button className="btn small blue" style={{ marginLeft: 'auto' }} disabled={!!errs.length} onClick={() => fightFree()}>
              対戦する
            </button>
            <button className="btn small ghost" title="CPU同士の対戦を観戦" disabled={!!errs.length} onClick={() => fightFree(true)}>
              観戦
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={r.id} className="panel rival-detail" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
            <div className="rd-top">
              <img className="rd-por" src={artUrl(r.portrait)} alt="" />
              <div>
                <div className="rtitle">
                  第{sel + 1}の強敵 ・ {r.title}
                </div>
                <h2>{r.name}</h2>
                <div className="rd-meta">
                  <span>
                    デッキ <b>{rdeck.name}</b>
                  </span>
                  <EnergySymbol type={rdeck.type} size="1.4em" />
                  <span>{TYPE_JP[rdeck.type]}</span>
                </div>
                <div className="rd-meta">
                  <span>
                    強さ <span className="stars">{'★'.repeat(LV[r.level])}{'☆'.repeat(3 - LV[r.level])}</span>
                  </span>
                  <span>
                    報酬 <b>{r.reward}</b> コイン{!save.beaten.includes(r.id) && '（初勝利+200）'}
                  </span>
                </div>
              </div>
            </div>
            <div className="bubble" style={{ alignSelf: 'stretch' }}>
              <b>{r.name}</b>
              <p>「{r.intro}」</p>
            </div>
            <div style={{ fontWeight: 800, color: 'var(--ink-dim)', fontSize: 'calc(var(--u) * 1)' }}>切り札</div>
            <div className="rd-cards">
              {keyCards.map((c) => (
                <CardFace key={c.id} cid={c.id} interactive />
              ))}
            </div>
            <div className="rd-actions">
              <div>
                <div style={{ fontSize: 'calc(var(--u) * 0.9)', color: 'var(--ink-dim)' }}>使用デッキ</div>
                <div style={{ fontWeight: 900 }}>{deck?.name ?? 'なし'}</div>
                {errs.length > 0 && <div className="warn">{errs[0]}</div>}
              </div>
              <button className="btn ghost small" onClick={() => go('deck')}>
                デッキ変更
              </button>
              <button className="btn big red" style={{ marginLeft: 'auto' }} disabled={!!errs.length} onClick={() => fight()}>
                <Icon name="swords" /> 挑戦する
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
