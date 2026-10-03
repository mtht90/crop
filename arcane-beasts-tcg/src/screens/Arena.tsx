// バトル: the battle menu opened from the home screen. Laid out like home —
// four tall mode cards in a row (story, free battles, online play, deck) and a
// band underneath with the deck in use and the player's record.
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { onlineSupported } from '../online/client';
import { CHAPTERS } from '../story';
import { nextChapterIndex, isCleared } from '../story/flow';
import { activeDeck, useStore, RIVALS } from '../state/store';
import { artUrl } from '../lib/assets';
import { CardFace } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { TopBar } from '../ui/TopBar';
import { foley, playMusic, sfx } from '../audio/audio';
import type { Screen } from '../state/store';

interface Tile {
  to: Screen;
  title: string;
  sub: string;
  bg: string;
  fig: string;
  icon: string;
  badge?: string;
  off?: boolean;
}

export function Arena() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  useEffect(() => playMusic('menu'), []);
  const deck = activeDeck(save);
  const nextIdx = nextChapterIndex(save);
  const nextCh = CHAPTERS[nextIdx];
  const storyDone = CHAPTERS.every((c) => isCleared(save, c));
  const online = onlineSupported();
  const tiles: Tile[] = [
    {
      to: 'story',
      title: 'ストーリー',
      sub: storyDone ? '第一部 完 ── 好きな章を読み返せます' : save.story.started ? `第${nextIdx + 1}章「${nextCh.title}」` : '十二枚の伝説をめぐる旅',
      bg: 'story/landscape-lava',
      fig: 'monsters/fire-dragon',
      icon: 'book',
      badge: save.story.started ? undefined : 'NEW',
    },
    { to: 'rivals', title: 'フリー対戦', sub: `強敵とバトル（${save.beaten.length}/${RIVALS.length} 撃破）`, bg: 'story/p-mountains', fig: 'humans/duelist', icon: 'swords' },
    {
      to: 'lobby',
      title: 'フレンド対戦',
      sub: online ? 'フレンド・ランダム・ランク'  : 'オンライン版でのみ遊べます',
      bg: 'story/p-summer',
      fig: 'humans/cavalier',
      icon: 'person',
      off: !online,
    },
    { to: 'deck', title: 'デッキ編集', sub: deck ? `使用中「${deck.name}」` : 'デッキを組もう', bg: 'story/grim-altar', fig: 'woses/ancient-wose', icon: 'deck' },
  ];

  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-battlefield_nohumans')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="バトル" />
        <div className="arena-cards">
          {tiles.map((t, i) => (
            <motion.div
              key={t.to}
              className={`tile ${t.off ? 'off' : ''}`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, type: 'spring', stiffness: 220, damping: 24 }}
              onMouseEnter={() => foley.hover()}
              onClick={() => {
                if (t.off) return;
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

        {/* the bottom band: your deck in the middle, your record either side */}
        <motion.div className="panel arena-band" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
          <div className="ab-stat">
            <b>{save.wins}</b>
            <span>勝利</span>
          </div>
          <div className="ab-stat">
            <b>{save.losses}</b>
            <span>敗北</span>
          </div>
          <div className="ab-deck" onClick={() => go('deck')}>
            {deck && <CardFace cid={deck.cover} />}
            <div>
              <small>使用中のデッキ</small>
              <b>{deck?.name ?? '―'}</b>
            </div>
            <span className="btn small">変更</span>
          </div>
          <div className="ab-stat">
            <b>
              {save.story.cleared.length}/{CHAPTERS.length}
            </b>
            <span>ストーリー</span>
          </div>
          <div className="ab-stat">
            <b>
              {save.beaten.length}/{RIVALS.length}
            </b>
            <span>強敵撃破</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
