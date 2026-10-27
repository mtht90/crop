// その他: everything that is not one of the main tabs
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { claimableCount } from '../state/progress';
import { collectionPct, extCtx, useStore, type Screen } from '../state/store';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { artUrl } from '../lib/assets';
import { foley, playMusic, sfx } from '../audio/audio';

export function More() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  useEffect(() => playMusic('menu'), []);
  const missions = claimableCount(save.progress, extCtx(save));
  const items: { to: Screen; icon: string; title: string; sub: string; badge?: string }[] = [
    { to: 'missions', icon: 'trophy', title: 'ミッション', sub: 'デイリー・ウィークリー・実績・ログインボーナス', badge: missions ? String(missions) : undefined },
    { to: 'collection', icon: 'cards', title: 'コレクション', sub: `集めたカード（収集率 ${Math.floor(collectionPct(save))}%）`, badge: save.newCards.length ? `NEW ${save.newCards.length}` : undefined },
    { to: 'settings', icon: 'gear', title: '設定', sub: '音量・演出・引き継ぎ' },
    { to: 'rules', icon: 'book', title: 'あそびかた', sub: 'ルールと用語' },
    { to: 'credits', icon: 'info', title: 'クレジット', sub: '素材と制作' },
    { to: 'title', icon: 'back', title: 'タイトルへ', sub: 'タイトル画面に戻る' },
  ];
  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/p-study')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="その他" />
        <div className="page-inner more-list">
          {items.map((it, i) => (
            <motion.button
              key={it.to}
              className="box more-item"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.35 }}
              onMouseEnter={() => foley.hover()}
              onClick={() => {
                sfx('expand', 0.4);
                go(it.to);
              }}
            >
              <span className="more-ico">
                <Icon name={it.icon} />
              </span>
              <span className="more-text">
                <b>{it.title}</b>
                <small>{it.sub}</small>
              </span>
              {it.badge && <span className="more-badge">{it.badge}</span>}
              <span className="more-go">›</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
