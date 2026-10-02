// ストーリー: the chapter map (4 acts × 4 chapters) and a chapter's details.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
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

export function StoryMap() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  const update = useStore((s) => s.update);
  useEffect(() => playMusic('menu'), []);
  const [sel, setSel] = useState(() => nextChapterIndex(save));
  const ch = CHAPTERS[sel];
  const rival = RIVALS.find((r) => r.id === ch.rival)!;
  const state = chapterState(save, sel);
  const deck = activeDeck(save);
  const errs = deck ? validateDeck(deck.cards) : ['デッキがありません'];
  const rdeck = deckById(rival.deck);
  const act = ACTS[ch.act - 1];
  const done = CHAPTERS.filter((c) => isCleared(save, c)).length;
  const seen = (id: string) => save.story.seen.includes(id);
  const bgKey = state === 'locked' ? 'story/p-fog' : rival.scene;
  const rows = useMemo(() => ACTS.map((a) => ({ act: a, items: CHAPTERS.map((c, i) => ({ c, i })).filter((x) => x.c.act === a.no) })), []);

  return (
    <div className="screen">
      <AnimatePresence mode="sync">
        <motion.div key={bgKey} className="screen-bg" style={{ backgroundImage: `url(${artUrl(bgKey)})` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} />
      </AnimatePresence>
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="ストーリー" />

        {/* ------------------------------ map ------------------------------ */}
        <motion.div className="sm-map panel" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }}>
          <div className="sm-head">
            <b>契約の旅</b>
            <span>
              {done} / {CHAPTERS.length} 章
            </span>
            <div className="sm-bar">
              <i style={{ width: `${(done / CHAPTERS.length) * 100}%` }} />
            </div>
          </div>
          {rows.map(({ act: a, items }) => (
            <div key={a.no} className={`sm-act ${items.every((x) => chapterState(save, x.i) === 'locked') ? 'locked' : ''}`}>
              <div className="sm-act-title">
                <small>第{a.no}幕</small>
                <b>{a.title}</b>
              </div>
              <div className="sm-nodes">
                {items.map(({ c, i }, k) => {
                  const st = chapterState(save, i);
                  const r = RIVALS.find((x) => x.id === c.rival)!;
                  return (
                    <div key={c.id} className="sm-cell">
                      {k > 0 && <span className={`sm-line ${st === 'locked' ? 'off' : ''}`} />}
                      <button
                        className={`sm-node ${st} ${sel === i ? 'sel' : ''} ${i === nextChapterIndex(save) && st === 'open' ? 'next' : ''}`}
                        onClick={() => {
                          foley.tick();
                          setSel(i);
                        }}
                        title={st === 'locked' ? '？？？' : c.title}
                      >
                        {st === 'locked' ? <span className="q">？</span> : <img src={artUrl(r.portrait)} alt="" />}
                        <i className="no">{i + 1}</i>
                        {st === 'cleared' && (
                          <i className="ck">
                            <Icon name="check" />
                          </i>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="sm-foot">
            <button
              className={`btn small ${save.story.started ? 'ghost' : 'gold-btn'}`}
              onClick={() => {
                sfx('expand', 0.5);
                replayScene('prologue', 'prologue');
              }}
            >
              プロローグ{save.story.started ? 'を読み返す' : 'を見る'}
            </button>
            <button className="btn small ghost" onClick={() => go('rivals')}>
              フリー対戦（強敵一覧）
            </button>
            <label className="sm-toggle" title="オフにすると会話を飛ばして、すぐ対戦に入ります">
              <input type="checkbox" checked={save.story.scenes} onChange={(e) => update((s) => void (s.story.scenes = e.target.checked))} />
              会話シーン
            </label>
          </div>
        </motion.div>

        {/* ----------------------------- details ---------------------------- */}
        <AnimatePresence mode="wait">
          <motion.div key={ch.id} className="sm-detail panel" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
            <div className="sm-d-top">
              {state === 'locked' ? <div className="sm-sil">？</div> : <img className="sm-por" src={artUrl(rival.portrait)} alt="" />}
              <div>
                <div className="sm-kick">
                  第{act.no}幕 ・ 第{sel + 1}章
                </div>
                <h2>{state === 'locked' ? '？？？' : ch.title}</h2>
                {state !== 'locked' && (
                  <div className="sm-who">
                    {rival.title} <b>{rival.name}</b>
                  </div>
                )}
              </div>
            </div>
            {state === 'locked' ? (
              <p className="sm-sum dim">前の章をクリアすると解放されます。</p>
            ) : (
              <>
                <p className="sm-sum">{ch.summary}</p>
                <div className="sm-meta">
                  <span>
                    強さ <span className="stars">{'★'.repeat(LV[rival.level])}{'☆'.repeat(3 - LV[rival.level])}</span>
                  </span>
                  <span className="sm-type">
                    <EnergySymbol type={rdeck.type} size="1.3em" /> {TYPE_JP[rdeck.type]}・{rdeck.name}
                  </span>
                  <span>
                    報酬 <b>{rival.reward}</b>
                  </span>
                </div>
                <div className="sm-actions">
                  <div>
                    <div className="sm-dim">使用デッキ</div>
                    <b>{deck?.name ?? 'なし'}</b>
                    {errs.length > 0 && <div className="warn">{errs[0]}</div>}
                  </div>
                  <button className="btn ghost small" onClick={() => go('deck')}>
                    デッキ変更
                  </button>
                </div>
                <div className="sm-buttons">
                  <button
                    className="btn big red"
                    disabled={!!errs.length}
                    onClick={() => {
                      sfx('horn-3', 0.7);
                      startChapter(ch);
                    }}
                  >
                    <Icon name="swords" /> {state === 'cleared' ? 'もう一度挑む' : save.story.started ? 'この章をはじめる' : '物語をはじめる'}
                  </button>
                  <div className="sm-read">
                    <button className="btn small ghost" disabled={!seen(`${ch.id}:before`)} onClick={() => replayScene(ch.id + 'b', 'before', ch)}>
                      バトル前の会話
                    </button>
                    <button className="btn small ghost" disabled={!seen(`${ch.id}:after`)} onClick={() => replayScene(ch.id + 'a', 'after', ch)}>
                      バトル後の会話
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
