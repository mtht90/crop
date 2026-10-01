import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Prompt } from '../engine/types';
import { CardFace } from '../ui/Card';
import { sfx } from '../audio/audio';
import { HUMAN, useBattle, type BattleDriver } from './controller';

export function PromptLayer({ ctrl }: { ctrl: BattleDriver | null }) {
  const prompt = useBattle((s) => s.prompt);
  if (!prompt || prompt.player !== HUMAN || !ctrl) return null;
  if (prompt.type === 'cards') return <CardsPrompt key={JSON.stringify(prompt.selectable) + prompt.title} prompt={prompt} ctrl={ctrl} />;
  if (prompt.type === 'choice') return <ChoicePrompt prompt={prompt} ctrl={ctrl} />;
  return null;
}

function CardsPrompt({ prompt, ctrl }: { prompt: Extract<Prompt, { type: 'cards' }>; ctrl: BattleDriver }) {
  const [sel, setSel] = useState<number[]>([]);
  const [hidden, setHidden] = useState(false);
  useEffect(() => setSel([]), [prompt]);
  const selectable = new Set(prompt.selectable);
  const toggle = (uid: number) => {
    if (!selectable.has(uid)) return;
    sfx('select', 0.5);
    if (sel.includes(uid)) setSel(sel.filter((u) => u !== uid));
    else if (prompt.max === 1) setSel([uid]);
    else if (sel.length < prompt.max) setSel([...sel, uid]);
  };
  const ok = sel.length >= prompt.min && sel.length <= prompt.max;
  // sort: selectable first
  const cards = [...prompt.cards].sort((a, b) => Number(selectable.has(b.uid)) - Number(selectable.has(a.uid)));
  if (hidden)
    return (
      <button className="btn peek-back" onClick={() => setHidden(false)}>
        選択にもどる
      </button>
    );
  return (
    <div className="modal-back prompt-back">
      <motion.div className="modal panel prompt-modal" initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
        <div className="modal-title">{prompt.title}</div>
        <div className="modal-sub">
          {prompt.max === 0 ? '選べるカードがありません' : `${sel.length} / ${prompt.max}枚選択${prompt.min > 0 ? `（最低${prompt.min}枚）` : ''}`}
        </div>
        <div className="modal-grid">
          {cards.map((c) => {
            const can = selectable.has(c.uid);
            const on = sel.includes(c.uid);
            return (
              <div key={c.uid} className={`pick ${can ? 'can' : 'no'} ${on ? 'on' : ''}`} onClick={() => toggle(c.uid)}>
                <CardFace cid={c.cid} className="grid-card" dim={!can} />
                {on && <div className="pick-mark">{prompt.max > 1 ? sel.indexOf(c.uid) + 1 : '✓'}</div>}
              </div>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn ghost small" onClick={() => setHidden(true)}>
            盤面を見る
          </button>
          <button
            className="btn blue"
            disabled={!ok}
            onClick={() => {
              sfx('button', 0.6);
              ctrl.answer({ type: 'cards', uids: sel });
            }}
          >
            {prompt.max === 0 ? 'OK' : sel.length === 0 && prompt.min === 0 ? '選ばない' : '決定'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ChoicePrompt({ prompt, ctrl }: { prompt: Extract<Prompt, { type: 'choice' }>; ctrl: BattleDriver }) {
  return (
    <div className="modal-back prompt-back">
      <motion.div className="modal panel choice-modal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="modal-title">{prompt.title}</div>
        <div className="choice-row">
          {prompt.options.map((o, i) => (
            <button
              key={i}
              className={`btn big ${i === 0 ? '' : 'blue'}`}
              onClick={() => {
                sfx('button', 0.6);
                ctrl.answer({ type: 'choice', index: i });
              }}
            >
              {o}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
