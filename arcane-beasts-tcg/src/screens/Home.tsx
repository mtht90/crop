import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { activeDeck, extCtx, useStore, RIVALS, PACK_PRICE, PREMIUM_PRICE } from '../state/store';
import { canClaimLogin, claimableCount, currentPickup, expToNext } from '../state/progress';
import { LoginTrack } from './Missions';
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

let loginShown = false;

export function Home() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  useEffect(() => playMusic('menu'), []);
  const deck = activeDeck(save);
  const ownedKinds = ALL_CARDS.filter((c) => (c.kind === 'energy' && c.basic) || (save.collection[c.id] ?? 0) > 0).length;
  const pct = Math.round((ownedKinds / ALL_CARDS.length) * 100);
  const next = RIVALS.find((r) => !save.beaten.includes(r.id));
  const missionN = claimableCount(save.progress, extCtx(save));
  const pickup = currentPickup();
  const p = save.progress;
  const [loginOpen, setLoginOpen] = useState(() => {
    // pop the login bonus once per session; afterwards it lives in ミッション
    const open = canClaimLogin(save.progress) && !loginShown;
    loginShown = true;
    return open;
  });
  const tiles: TileDef[] = [
    { to: 'rivals', title: 'バトル', sub: next ? `次の相手：${next.title} ${next.name}` : '全ての強敵を撃破！フリー対戦で腕を磨こう', bg: 'story/landscape-lava', fig: 'monsters/fire-dragon', icon: 'swords', big: true },
    { to: 'deck', title: 'デッキ編集', sub: '60枚のデッキを組もう', bg: 'story/grim-altar', fig: 'woses/ancient-wose', icon: 'deck' },
    { to: 'shop', title: 'パック開封', sub: pickup ? `ピックアップ開催中！` : `通常${PACK_PRICE}・プレミアム${PREMIUM_PRICE}コイン`, bg: 'story/swamp-02', fig: 'monsters/jinn', icon: 'chest', badge: pickup ? 'PICK UP' : save.coins >= PACK_PRICE ? 'OPEN!' : undefined },
    { to: 'collection', title: 'コレクション', sub: `収集率 ${pct}%`, bg: 'story/landscape-mountains-01', fig: 'monsters/sea-serpent', icon: 'cards', badge: save.newCards.length ? `NEW ${save.newCards.length}` : undefined },
    { to: 'missions', title: 'ミッション', sub: missionN ? `報酬を受け取れます` : 'デイリー・ウィークリー・実績', bg: 'story/landscape-castle', fig: 'humans/mage-white+female', icon: 'trophy', badge: missionN ? `${missionN}` : undefined },
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
          <div className="lv-chip" title="プレイヤーレベル">
            <div className="lv">{p.level}</div>
            <div className="meta">
              <small>
                Lv.{p.level}　EXP {p.exp}/{expToNext(p.level)}
              </small>
              <div className="xb">
                <div style={{ transform: `scaleX(${p.exp / expToNext(p.level)})` }} />
              </div>
            </div>
          </div>
          <button className="icon-btn" title="ミッション" onClick={() => go('missions')}>
            <Icon name="trophy" />
            {missionN > 0 && <i className="dot">{missionN}</i>}
          </button>
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
            <button className="btn ghost small" onClick={() => go('rules')}>
              <Icon name="book" /> あそびかた
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
      <AnimatePresence>
        {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      </AnimatePresence>
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
