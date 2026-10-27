import { CHAPTERS } from '../story';
import { nextChapterIndex } from '../story/flow';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { activeDeck, collectionPct, extCtx, useStore, RIVALS } from '../state/store';
import { canClaimLogin, claimableCount, expToNext } from '../state/progress';
import { LoginTrack } from './Missions';
import { artUrl } from '../lib/assets';
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
  badge?: string;
}

let loginShown = false;

export function Home() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  useEffect(() => playMusic('menu'), []);
  const deck = activeDeck(save);
  const pct = Math.floor(collectionPct(save));
  const nextIdx = nextChapterIndex(save);
  const nextCh = CHAPTERS[nextIdx];
  const missionN = claimableCount(save.progress, extCtx(save));
  const p = save.progress;
  const [loginOpen, setLoginOpen] = useState(() => {
    // pop the login bonus once per session; afterwards it lives in ミッション
    const open = canClaimLogin(save.progress) && !loginShown;
    loginShown = true;
    return open;
  });
  const tiles: TileDef[] = [
    { to: 'shop', title: 'パック', sub: '通常・プレミアム', bg: 'story/swamp-02', fig: 'monsters/jinn', icon: 'chest' },
    { to: 'missions', title: 'ミッション', sub: missionN ? '報酬を受け取れます' : 'デイリー・実績', bg: 'story/landscape-castle', fig: 'humans/mage-white+female', icon: 'trophy', badge: missionN ? `${missionN}` : undefined },
    { to: 'collection', title: 'コレクション', sub: `収集率 ${pct}%`, bg: 'story/landscape-mountains-01', fig: 'monsters/sea-serpent', icon: 'cards', badge: save.newCards.length ? `NEW ${save.newCards.length}` : undefined },
    { to: 'deck', title: 'デッキ', sub: deck ? deck.name : 'デッキを組もう', bg: 'story/grim-altar', fig: 'woses/ancient-wose', icon: 'deck' },
  ];
  const tap = (to: Screen) => {
    sfx('expand', 0.5);
    go(to);
  };

  return (
    <div className="screen home3">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-hills-02')})` }} />
      <div className="page-shade" />
      <div className="page">
        <header className="page-head home3-head">
          <div className="home3-logo">
            <b>ARCANE BEASTS</b>
            <small>TRADING CARD GAME</small>
          </div>
          <div className="page-head-right">
            <div className="lv-chip2" title="プレイヤーレベル">
              <b>Lv.{p.level}</b>
              <div className="xb">
                <div style={{ transform: `scaleX(${p.exp / expToNext(p.level)})` }} />
              </div>
            </div>
            <span className="coin-chip">
              <Icon name="coin" /> {save.coins.toLocaleString()}
            </span>
          </div>
        </header>

        <div className="page-inner home3-grid">
          <motion.div className="tile2 big home3-hero" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} onMouseEnter={() => foley.hover()} onClick={() => tap('arena')}>
            <img className="bg" src={artUrl('story/landscape-lava')} alt="" />
            <div className="shade" />
            <img className="fig" src={artUrl('monsters/fire-dragon')} alt="" />
            <div className="label">
              <div className="ico">
                <Icon name="swords" />
              </div>
              <h2>バトル</h2>
              <p>{save.story.started ? `ストーリー 第${nextIdx + 1}章「${nextCh.title}」` : 'ストーリー・強敵・オンライン対戦'}</p>
            </div>
          </motion.div>

          <div className="home3-tiles">
            {tiles.map((t, i) => (
              <motion.div
                key={t.to}
                className="tile2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 + 0.05 * i, duration: 0.45 }}
                onMouseEnter={() => foley.hover()}
                onClick={() => tap(t.to)}
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

          <motion.div className="box home3-stats" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.45 }}>
            <div>
              <b>{save.wins}</b>
              <span>勝利</span>
            </div>
            <div>
              <b>
                {save.beaten.length}/{RIVALS.length}
              </b>
              <span>強敵撃破</span>
            </div>
            <div>
              <b>
                {save.story.cleared.length}/{CHAPTERS.length}
              </b>
              <span>ストーリー</span>
            </div>
            <div>
              <b>{pct}%</b>
              <span>コレクション</span>
            </div>
          </motion.div>
        </div>
      </div>
      <AnimatePresence>{loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}</AnimatePresence>
    </div>
  );
}

function LoginModal({ onClose }: { onClose: () => void }) {
  const [got, setGot] = useState(0);
  return (
    <motion.div className="login-modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <motion.div
        className="panel login-modal"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative' }}
      >
        <button className="icon-btn close" title="閉じる" onClick={onClose}>
          <Icon name="close" />
        </button>
        <h2>ログインボーナス</h2>
        <div className="sub">{got ? `${got} コインを受け取りました` : '7日目は大きな報酬がもらえます'}</div>
        <LoginTrack
          compact
          onClaim={(c) => {
            if (!c) return;
            setGot(c);
            foley.chime(6);
            sfx('gold', 0.6);
            setTimeout(onClose, 1100);
          }}
        />
      </motion.div>
    </motion.div>
  );
}
