// バトル: the battle menu opened from the home screen. Laid out like home —
// four tall mode cards in a row (story, free battles, online play, deck) and a
// band underneath with the deck in use and the player's record.
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { onlineSupported } from '../online/client';
import { CHAPTERS, episodeLabel } from '../story';
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
      sub: storyDone ? '第一章 完 ── 好きな話を読み返せます' : save.story.started ? `${episodeLabel(nextCh)}「${nextCh.title}」` : '十二枚の伝説をめぐる旅',
      bg: 'story/landscape-lava',
      fig: 'monsters/fire-dragon',
      icon: 'book',
      badge: save.story.started ? undefined : 'NEW',
    },
    { to: 'rivals', title: 'フリー対戦', sub: `強敵とバトル（${save.beaten.length}/${RIVALS.length} 撃破）`, bg: 'story/p-mountains', fig: 'humans/duelist', icon: 'swords' },
    {
      to: 'lobby',
      title: 'オンライン対戦',
      sub: online ? 'フレンド対戦・ランダムマッチ' : 'オンライン版でのみ遊べます',
      bg: 'story/p-summer',
      fig: 'humans/cavalier',
      icon: 'person',
      off: !online,
    },
  ];

  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-battlefield_nohumans')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="バトル" />
        <div className="page-inner arena3">
          {tiles.map((t, i) => (
            <motion.div
              key={t.to}
              className={`tile2 ${i === 0 ? 'big arena3-story' : ''} ${t.off ? 'off' : ''}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.45 }}
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
          <motion.button className="box arena3-deck" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.45 }} onClick={() => go('deck')}>
            {deck && <CardFace cid={deck.cover} />}
            <span className="arena3-deck-text">
              <small>使用中のデッキ</small>
              <b>{deck?.name ?? 'デッキがありません'}</b>
            </span>
            <span className="chip-btn">変更</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
