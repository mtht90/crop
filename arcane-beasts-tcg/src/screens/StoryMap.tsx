// ストーリー: chapter select. One painting per chapter fills the screen; a
// filmstrip along the bottom moves between chapters.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { activeDeck, useStore } from '../state/store';
import { validateDeck, deckById, RIVALS } from '../engine/decks';
import { TYPE_JP } from '../engine/cards';
import { artUrl } from '../lib/assets';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { EnergySymbol } from '../ui/Card';
import { ACTS, CHAPTERS } from '../story';
import { chapterState, isCleared, nextChapterIndex, replayScene, startChapter } from '../story/flow';
import { foley, playMusic, sfx } from '../audio/audio';
import { HeroCreate } from '../story/HeroCreate';
import './story-map.css';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const LV = { easy: 1, normal: 2, hard: 3 } as const;
/** index -1 is the prologue */
const PROLOGUE_ART = 'story/p-great-tree';

export function StoryMap() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  const update = useStore((s) => s.update);
  useEffect(() => playMusic('menu'), []);
  const [sel, setSel] = useState(() => (save.story.started ? nextChapterIndex(save) : -1));
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  /** naming the hero; holds what to do afterwards */
  const [creating, setCreating] = useState<null | { then: () => void }>(null);

  const isPro = sel < 0;
  const ch = isPro ? null : CHAPTERS[sel];
  const rival = ch ? RIVALS.find((r) => r.id === ch.rival)! : null;
  const state = ch ? chapterState(save, sel) : 'cleared';
  const locked = state === 'locked';
  const deck = activeDeck(save);
  const errs = deck ? validateDeck(deck.cards) : ['デッキがありません'];
  const rdeck = rival ? deckById(rival.deck) : null;
  const done = CHAPTERS.filter((c) => isCleared(save, c)).length;
  const seen = (id: string) => save.story.seen.includes(id);
  const art = isPro ? PROLOGUE_ART : (ch!.art ?? rival!.scene);
  const act = ch ? ACTS[ch.act - 1] : null;

  const move = (d: number) => {
    const n = Math.max(-1, Math.min(CHAPTERS.length - 1, sel + d));
    if (n === sel) return;
    foley.slide();
    setSel(n);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (creating || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const start = () => {
    if (!save.story.hero) {
      setCreating({ then: start2 });
      return;
    }
    start2();
  };
  const start2 = () => {
    if (isPro) {
      sfx('expand', 0.5);
      if (!save.story.started) update((s) => void (s.story.started = true));
      replayScene('prologue', 'prologue');
      return;
    }
    sfx('horn-3', 0.7);
    startChapter(ch!);
  };

  return (
    <div
      className="screen sc-screen"
      onPointerDown={(e) => (drag.current = { x: e.clientX, moved: false })}
      onPointerUp={(e) => {
        if (creating) return;
        const d = drag.current;
        drag.current = null;
        if (d && Math.abs(e.clientX - d.x) > 60) move(e.clientX < d.x ? 1 : -1);
      }}
    >
      {/* the painting */}
      <AnimatePresence initial={false}>
        <motion.div key={`${sel}`} className="sc-art" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
          <div className={`sc-img ${locked ? 'locked' : ''}`} style={{ backgroundImage: `url(${artUrl(art)})` }} />
        </motion.div>
      </AnimatePresence>
      <div className="sc-shade" />

      <div className="stage">
        <TopBar title="ストーリー" back="arena" />
        <div className="sc-tools">
          <span className="sc-deck">
            使用デッキ <b>{deck?.name ?? 'なし'}</b>
          </span>
          <button className="btn small ghost" onClick={() => go('deck')}>
            デッキ変更
          </button>
          <button className="btn small ghost" onClick={() => go('rivals')}>
            フリー対戦
          </button>
          <button className="btn small ghost" onClick={() => setCreating({ then: () => {} })}>
            主人公
          </button>
          <label className="sc-toggle" title="オフにすると会話を飛ばして、すぐ対戦に入ります">
            <input type="checkbox" checked={save.story.scenes} onChange={(e) => update((s) => void (s.story.scenes = e.target.checked))} />
            会話シーン
          </label>
        </div>

        {/* chapter text */}
        <AnimatePresence mode="wait">
          <motion.div key={sel} className="sc-info" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: EASE_OUT }}>
            <div className="sc-kick">{isPro ? 'PROLOGUE' : `第${ch!.act}幕 ${act!.title}　・　第${sel + 1}章`}</div>
            <h1 className="gold-title">{isPro ? 'プロローグ' : locked ? '？？？' : ch!.title}</h1>
            {isPro ? (
              <p className="sc-sum">すべての始まり。</p>
            ) : locked ? (
              <p className="sc-sum">前の章をクリアすると解放されます。</p>
            ) : (
              <>
                <div className="sc-who">
                  <img src={artUrl(rival!.portrait)} alt="" />
                  <div>
                    <b>{rival!.name}</b>
                    <small>{rival!.title}</small>
                  </div>
                </div>
                <p className="sc-sum">{ch!.summary}</p>
                <div className="sc-meta">
                  <span>
                    強さ <span className="stars">{'★'.repeat(LV[rival!.level])}{'☆'.repeat(3 - LV[rival!.level])}</span>
                  </span>
                  <span className="ty">
                    <EnergySymbol type={rdeck!.type} size="1.2em" /> {TYPE_JP[rdeck!.type]}・{rdeck!.name}
                  </span>
                  <span>
                    報酬 <b>{rival!.reward}</b>
                  </span>
                  {state === 'cleared' && <span className="clear">CLEAR</span>}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* actions */}
        <div className="sc-act">
          {!locked && (
            <button className="btn big red" disabled={!isPro && !!errs.length} onClick={start}>
              {isPro ? (
                <>{save.story.started ? '読み返す' : '読む'}</>
              ) : (
                <>
                  <Icon name="swords" /> {state === 'cleared' ? 'もう一度挑む' : save.story.started ? 'はじめる' : '物語をはじめる'}
                </>
              )}
            </button>
          )}
          {!isPro && !locked && errs.length > 0 && <div className="warn">{errs[0]}</div>}
          {!isPro && !locked && (
            <div className="sc-read">
              <button className="textbtn" disabled={!seen(`${ch!.id}:before`)} onClick={() => replayScene(ch!.id + 'b', 'before', ch!)}>
                戦いの前を読む
              </button>
              <button className="textbtn" disabled={!seen(`${ch!.id}:after`)} onClick={() => replayScene(ch!.id + 'a', 'after', ch!)}>
                戦いのあとを読む
              </button>
            </div>
          )}
        </div>

        {/* filmstrip */}
        <div className="sc-strip">
          <button className="sc-arrow" disabled={sel <= -1} onClick={() => move(-1)} aria-label="前の章">
            ‹
          </button>
          <div className="sc-reel">
            <div className="sc-row" style={{ transform: `translateX(calc(var(--u) * ${-(sel + 1) * 11.2}))` }}>
              {[-1, ...CHAPTERS.map((_, i) => i)].map((i) => {
                const st = i < 0 ? 'cleared' : chapterState(save, i);
                const c = i < 0 ? null : CHAPTERS[i];
                const a = i < 0 ? PROLOGUE_ART : (c!.art ?? RIVALS.find((r) => r.id === c!.rival)!.scene);
                return (
                  <button
                    key={i}
                    className={`sc-thumb ${st} ${i === sel ? 'on' : ''} ${i >= 0 && i === nextChapterIndex(save) && st === 'open' ? 'next' : ''}`}
                    onClick={() => {
                      if (i === sel) return;
                      foley.tick();
                      setSel(i);
                    }}
                  >
                    <span className="im" style={{ backgroundImage: `url(${artUrl(a)})` }} />
                    <span className="n">{i < 0 ? '序' : i + 1}</span>
                    {st === 'cleared' && i >= 0 && <span className="ck"><Icon name="check" /></span>}
                    {st === 'locked' && <span className="lk"><Icon name="lock" /></span>}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="sc-arrow" disabled={sel >= CHAPTERS.length - 1} onClick={() => move(1)} aria-label="次の章">
            ›
          </button>
          <div className="sc-prog">
            {done} / {CHAPTERS.length} 章クリア
          </div>
        </div>
      </div>
      <AnimatePresence>
        {creating && (
          <HeroCreate
            initial={save.story.hero}
            onCancel={() => setCreating(null)}
            onDone={(h) => {
              update((x) => void (x.story.hero = h));
              const then = creating.then;
              setCreating(null);
              setTimeout(then, 50);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
