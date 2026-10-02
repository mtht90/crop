// ストーリー: the chapter book. A spread per act — the table of chapters on the
// left page, the chosen chapter on the right — with a page that really turns.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import './story-map.css';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const LV = { easy: 1, normal: 2, hard: 3 } as const;
const KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function StoryMap() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  const update = useStore((s) => s.update);
  useEffect(() => playMusic('menu'), []);
  const [sel, setSel] = useState(() => nextChapterIndex(save));
  const [actNo, setActNo] = useState(() => CHAPTERS[nextChapterIndex(save)].act);
  const [turn, setTurn] = useState<{ dir: 1 | -1; nonce: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const ch = CHAPTERS[sel];
  const rival = RIVALS.find((r) => r.id === ch.rival)!;
  const state = chapterState(save, sel);
  const deck = activeDeck(save);
  const errs = deck ? validateDeck(deck.cards) : ['デッキがありません'];
  const rdeck = deckById(rival.deck);
  const done = CHAPTERS.filter((c) => isCleared(save, c)).length;
  const seen = (id: string) => save.story.seen.includes(id);
  const bgKey = state === 'locked' ? 'story/p-fog' : rival.scene;
  const act = ACTS[actNo - 1];
  const items = useMemo(() => CHAPTERS.map((c, i) => ({ c, i })).filter((x) => x.c.act === actNo), [actNo]);
  const unlockedAct = (n: number) => CHAPTERS.some((c, i) => c.act === n && chapterState(save, i) !== 'locked');

  /** turn the page to another act; the content swaps while the leaf is mid-air */
  const goAct = (n: number) => {
    if (n === actNo || turn || n < 1 || n > ACTS.length || !unlockedAct(n)) return;
    const dir: 1 | -1 = n > actNo ? 1 : -1;
    foley.whoosh();
    setTurn({ dir, nonce: Date.now() });
    timers.current.push(
      setTimeout(() => {
        setActNo(n);
        const first = CHAPTERS.findIndex((c, i) => c.act === n && chapterState(save, i) === 'open');
        setSel(first !== -1 ? first : CHAPTERS.findIndex((c) => c.act === n));
      }, 330),
      setTimeout(() => setTurn(null), 760),
    );
  };

  return (
    <div className="screen">
      <AnimatePresence mode="sync">
        <motion.div key={bgKey} className="screen-bg" style={{ backgroundImage: `url(${artUrl(bgKey)})`, filter: 'blur(3px) brightness(0.55) sepia(0.25)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} />
      </AnimatePresence>
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="旅の書" />

        <motion.div className="bk" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: EASE_OUT }}>
          <div className="bk-cover">
            <div className="bk-spread">
              {/* ------------------------------ left page ------------------------------ */}
              <section className="bk-page left">
                <header className="bk-act">
                  <small>ACT {ROMAN[act.no]}</small>
                  <b>第{KANJI[act.no]}幕</b>
                  <h2>{act.title}</h2>
                  <i>{act.sub}</i>
                  <span className="bk-orn" />
                </header>
                <ol className="bk-list">
                  {items.map(({ c, i }) => {
                    const st = chapterState(save, i);
                    const r = RIVALS.find((x) => x.id === c.rival)!;
                    return (
                      <li key={c.id}>
                        <button
                          className={`bk-row ${st} ${sel === i ? 'sel' : ''} ${i === nextChapterIndex(save) && st === 'open' ? 'next' : ''}`}
                          onClick={() => {
                            foley.tick();
                            setSel(i);
                          }}
                        >
                          <span className="seal">{i + 1}</span>
                          <span className="txt">
                            <b>{st === 'locked' ? '？？？' : c.title}</b>
                            <small>{st === 'locked' ? '前の章を読み終えると開きます' : `${r.title}　${r.name}`}</small>
                          </span>
                          {st === 'cleared' && <span className="stamp">済</span>}
                          {st === 'open' && <span className="quill" />}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <div className="bk-folio">— {actNo * 2 - 1} —</div>
              </section>

              <div className="bk-spine" />

              {/* ------------------------------ right page ------------------------------ */}
              <section className="bk-page right">
                <AnimatePresence mode="wait">
                  <motion.div key={ch.id} className="bk-detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
                    <div className="bk-kick">
                      第{KANJI[ch.act]}幕　第{sel + 1}章
                    </div>
                    <h3>{state === 'locked' ? '？？？' : ch.title}</h3>
                    <div className="bk-pic">
                      <div className="bk-scene" style={{ backgroundImage: `url(${artUrl(bgKey)})` }} />
                      {state === 'locked' ? <div className="bk-q">？</div> : <img src={artUrl(rival.portrait)} alt="" />}
                      {state !== 'locked' && (
                        <div className="bk-who">
                          <small>{rival.title}</small>
                          <b>{rival.name}</b>
                        </div>
                      )}
                    </div>
                    {state === 'locked' ? (
                      <p className="bk-sum dim">前の章を読み終えると、この頁が開きます。</p>
                    ) : (
                      <>
                        <p className="bk-sum">{ch.summary}</p>
                        <div className="bk-meta">
                          <span>
                            強さ <span className="stars">{'★'.repeat(LV[rival.level])}{'☆'.repeat(3 - LV[rival.level])}</span>
                          </span>
                          <span className="ty">
                            <EnergySymbol type={rdeck.type} size="1.2em" /> {TYPE_JP[rdeck.type]}・{rdeck.name}
                          </span>
                          <span>
                            報酬 <b>{rival.reward}</b>
                          </span>
                        </div>
                        <div className="bk-deck">
                          <div>
                            <small>使用デッキ</small>
                            <b>{deck?.name ?? 'なし'}</b>
                            {errs.length > 0 && <em>{errs[0]}</em>}
                          </div>
                          <button className="bk-btn ghost" onClick={() => go('deck')}>
                            デッキ変更
                          </button>
                        </div>
                        <div className="bk-cta">
                          <button
                            className="bk-go"
                            disabled={!!errs.length}
                            onClick={() => {
                              sfx('horn-3', 0.7);
                              startChapter(ch);
                            }}
                          >
                            <Icon name="swords" /> {state === 'cleared' ? 'もう一度挑む' : save.story.started ? 'この章をはじめる' : '物語をはじめる'}
                          </button>
                          <div className="bk-read">
                            <button className="bk-btn ghost" disabled={!seen(`${ch.id}:before`)} onClick={() => replayScene(ch.id + 'b', 'before', ch)}>
                              戦いの前を読む
                            </button>
                            <button className="bk-btn ghost" disabled={!seen(`${ch.id}:after`)} onClick={() => replayScene(ch.id + 'a', 'after', ch)}>
                              戦いのあとを読む
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
                <div className="bk-folio">— {actNo * 2} —</div>
              </section>

              {/* the page that turns */}
              {turn && (
                <motion.div
                  key={turn.nonce}
                  className={`bk-leaf ${turn.dir > 0 ? 'fwd' : 'back'}`}
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: turn.dir > 0 ? -180 : 180 }}
                  transition={{ duration: 0.72, ease: [0.45, 0.05, 0.25, 1] }}
                >
                  <div className="face front" />
                  <div className="face rear" />
                </motion.div>
              )}
            </div>

            {/* bookmarks */}
            <nav className="bk-marks">
              {ACTS.map((a) => {
                const open = unlockedAct(a.no);
                return (
                  <button key={a.no} className={`${a.no === actNo ? 'on' : ''} ${open ? '' : 'off'}`} disabled={!open} onClick={() => goAct(a.no)} title={open ? a.title : '？？？'}>
                    {ROMAN[a.no]}
                  </button>
                );
              })}
            </nav>
            <button className="bk-turn prev" disabled={actNo <= 1} onClick={() => goAct(actNo - 1)} aria-label="前の幕">
              ‹
            </button>
            <button className="bk-turn next" disabled={actNo >= ACTS.length || !unlockedAct(actNo + 1)} onClick={() => goAct(actNo + 1)} aria-label="次の幕">
              ›
            </button>
          </div>
        </motion.div>

        {/* ------------------------------ foot ------------------------------ */}
        <div className="bk-foot">
          <button
            className="bk-btn"
            onClick={() => {
              sfx('expand', 0.5);
              replayScene('prologue', 'prologue');
            }}
          >
            プロローグ{save.story.started ? 'を読み返す' : 'を読む'}
          </button>
          <button className="bk-btn" onClick={() => go('rivals')}>
            フリー対戦（強敵一覧）
          </button>
          <label className="bk-toggle" title="オフにすると会話を飛ばして、すぐ対戦に入ります">
            <input type="checkbox" checked={save.story.scenes} onChange={(e) => update((s) => void (s.story.scenes = e.target.checked))} />
            会話シーン
          </label>
          <div className="bk-prog">
            <span>
              {done} / {CHAPTERS.length} 章
            </span>
            <div>
              <i style={{ width: `${(done / CHAPTERS.length) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
