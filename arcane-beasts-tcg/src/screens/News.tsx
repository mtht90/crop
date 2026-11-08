// お知らせ: a modal with tabs, opened when the game starts and from the menus.
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { NEWS, NEWS_KIND_JP, type NewsItem, type NewsKind } from '../state/news';
import { dayKey, fmtRemain } from '../state/progress';
import { currentStageEvent } from '../state/stages';
import { card } from '../engine/cards';
import { useStore } from '../state/store';
import { artUrl } from '../lib/assets';
import { Icon } from '../ui/Icon';
import { foley, sfx } from '../audio/audio';

export const useNews = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export const LATEST_NEWS = NEWS[0].id;
/** unread news (the newest entry has not been opened yet) */
export const hasUnreadNews = (seen?: string) => seen !== LATEST_NEWS;
/** should the news open by itself at start (not hidden for today) */
export const newsAtStart = (hideDay?: string) => hideDay !== dayKey();

type Tab = 'all' | NewsKind;
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'update', label: 'アップデート' },
  { id: 'event', label: 'イベント' },
  { id: 'fix', label: '不具合修正' },
];

function eventNews(_progress?: unknown): NewsItem & { art: string } {
  const { ev, key, ends } = currentStageEvent();
  return {
    id: `stage-${key}`,
    kind: 'event',
    title: `イベント「${ev.title.join('')}」開催中`,
    art: ev.bg,
    body: [
      ev.blurb,
      '・全15ステージのマップを進むイベントです。ステージごとに変則ルールがあり、1-5・2-5・3-5はボス',
      '・はじめてクリアしたステージはジェム。勝つたびに「イベントのかけら」がときどき手に入り、交換所で限定カードやジェムと交換できます',
      `・3-5 のボスに勝つと、まれに限定カード「${card(ev.card).name}」が手に入ります`,
      `・終了まで あと${fmtRemain(ends.getTime() - Date.now())}`,
      '・バトル →「イベント」から遊べます',
    ],
  };
}

export function NewsModal() {
  const open = useNews((s) => s.open);
  const hide = useNews((s) => s.hide);
  const progress = useStore((s) => s.save.progress);
  const hideDay = useStore((s) => s.save.newsHideDay);
  const update = useStore((s) => s.update);
  const go = useStore((s) => s.go);
  const [tab, setTab] = useState<Tab>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useMemo(() => {
    const all: (NewsItem & { art?: string })[] = [eventNews(progress), ...NEWS];
    return tab === 'all' ? all : all.filter((n) => n.kind === tab);
  }, [progress, tab]);
  const today = dayKey();
  const close = () => {
    update((s) => void (s.newsSeen = LATEST_NEWS));
    hide();
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="login-modal-back news-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={close}>
          <motion.div
            className="panel news-modal"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="icon-btn close" title="閉じる" onClick={close}>
              <Icon name="close" />
            </button>
            <h2>お知らせ</h2>
            <div className="news-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`chip-btn ${tab === t.id ? 'on' : ''}`}
                  onClick={() => {
                    foley.tick();
                    setTab(t.id);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="news-list">
              {list.map((n, i) => {
                const isOpen = openId === n.id || (openId === null && i === 0);
                return (
                  <div key={n.id} className={`news-item k-${n.kind} ${isOpen ? 'open' : ''}`}>
                    <button
                      className="news-head"
                      onClick={(e) => {
                        foley.tick();
                        setOpenId(isOpen ? '' : n.id);
                        // the item above may close and shrink: keep the one just opened in view
                        const el = e.currentTarget.parentElement;
                        if (!isOpen && el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
                      }}
                    >
                      <span className="news-kind">{NEWS_KIND_JP[n.kind]}</span>
                      <b>{n.title}</b>
                      {n.date && <small>{n.date}</small>}
                      <span className="news-caret">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div className="news-body">
                        {n.art && <div className="news-art" style={{ backgroundImage: `url(${artUrl(n.art)})` }} />}
                        {n.body.map((line, j) =>
                          line.startsWith('・') ? (
                            <p key={j} className="news-bullet">
                              {line.slice(1)}
                            </p>
                          ) : (
                            <p key={j}>{line}</p>
                          ),
                        )}
                        {n.kind === 'event' && (
                          <button
                            className="btn small"
                            onClick={() => {
                              sfx('expand', 0.4);
                              close();
                              go('stage');
                            }}
                          >
                            イベントを見る
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <label className="news-hide">
              <input type="checkbox" checked={hideDay === today} onChange={(e) => update((s) => void (s.newsHideDay = e.target.checked ? today : ''))} />
              今日は起動時に表示しない
            </label>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
