import { motion } from 'motion/react';
import { useEffect } from 'react';
import { activeDeck, useStore, RIVALS } from '../state/store';
import { ALL_CARDS } from '../engine/cards';
import { artUrl } from '../lib/assets';
import { CardFace } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { foley, playMusic, sfx } from '../audio/audio';
import type { Screen } from '../state/store';

interface TileDef {
  to: Screen;
  title: string;
  sub: string;
  bg: string;
  fig: string;
  icon: string;
  big?: boolean;
  badge?: string;
}

export function Home() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  useEffect(() => playMusic('menu'), []);
  const deck = activeDeck(save);
  const ownedKinds = ALL_CARDS.filter((c) => (c.kind === 'energy' && c.basic) || (save.collection[c.id] ?? 0) > 0).length;
  const pct = Math.round((ownedKinds / ALL_CARDS.length) * 100);
  const next = RIVALS.find((r) => !save.beaten.includes(r.id));
  const tiles: TileDef[] = [
    { to: 'rivals', title: 'バトル', sub: next ? `次の相手：${next.title} ${next.name}` : '全ての強敵を撃破！フリー対戦で腕を磨こう', bg: 'story/landscape-lava', fig: 'monsters/fire-dragon', icon: 'swords', big: true },
    { to: 'deck', title: 'デッキ編集', sub: '60枚のデッキを組もう', bg: 'story/grim-altar', fig: 'woses/ancient-wose', icon: 'deck' },
    { to: 'shop', title: 'パック開封', sub: '1パック150コイン', bg: 'story/swamp-02', fig: 'monsters/jinn', icon: 'chest', badge: save.coins >= 150 ? 'OPEN!' : undefined },
    { to: 'collection', title: 'コレクション', sub: `収集率 ${pct}%`, bg: 'story/landscape-mountains-01', fig: 'monsters/sea-serpent', icon: 'cards', badge: save.newCards.length ? `NEW ${save.newCards.length}` : undefined },
    { to: 'rules', title: 'あそびかた', sub: 'ルールと操作を確認', bg: 'story/landscape-castle', fig: 'humans/mage-white+female', icon: 'book' },
  ];

  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-hills-02')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <div className="home-logo">
          <div className="l1 title-display" style={{ fontFamily: 'var(--font-latin)' }}>
            ARCANE BEASTS
          </div>
          <div className="l2">TRADING CARD GAME</div>
        </div>
        <div className="home-top-right">
          <span className="coin-chip">
            <Icon name="coin" /> {save.coins.toLocaleString()}
          </span>
          <button className="icon-btn" title="設定" onClick={() => go('settings')}>
            <Icon name="gear" />
          </button>
        </div>

        <div className="home-grid">
          {tiles.map((t, i) => (
            <motion.div
              key={t.to}
              className={`tile ${t.big ? 'big' : ''}`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, type: 'spring', stiffness: 220, damping: 24 }}
              onMouseEnter={() => foley.hover()}
              onClick={() => {
                sfx('expand', 0.5);
                go(t.to);
              }}
            >
              <img className="bg" src={artUrl(t.bg)} alt="" />
              <div className="shade" />
              <img className="fig" src={artUrl(t.fig)} alt="" />
              <div className="label">
                <div className="ico">
                  <Icon name={t.icon} />
                </div>
                <h2>{t.title}</h2>
                <p>{t.sub}</p>
              </div>
              {t.badge && <div className="badge">{t.badge}</div>}
            </motion.div>
          ))}
        </div>

        <div className="home-side">
          <motion.div className="panel deck-box" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}>
            {deck && <CardFace cid={deck.cover} />}
            <div>
              <h3>使用中のデッキ</h3>
              <div className="dname">{deck?.name ?? '―'}</div>
              <div style={{ marginTop: 8 }}>
                <button className="btn small" onClick={() => go('deck')}>
                  編集する
                </button>
              </div>
            </div>
          </motion.div>
          <motion.div className="panel stat-box" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <div>
              <b>{save.wins}</b>
              <span>勝利</span>
            </div>
            <div>
              <b>{save.beaten.length}/{RIVALS.length}</b>
              <span>撃破した強敵</span>
            </div>
            <div>
              <b>{pct}%</b>
              <span>コレクション</span>
            </div>
          </motion.div>
          <div className="home-links">
            <button className="btn ghost small" onClick={() => go('settings')}>
              <Icon name="gear" /> 設定
            </button>
            <button className="btn ghost small" onClick={() => go('credits')}>
              <Icon name="info" /> クレジット
            </button>
            <button className="btn ghost small" onClick={() => go('title')}>
              <Icon name="back" /> タイトルへ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
