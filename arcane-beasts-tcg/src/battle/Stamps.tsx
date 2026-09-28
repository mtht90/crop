// ============================================================================
// Stamps: short messages both players can send during a battle. The CPU
// answers yours and also reacts to what happens on the board.
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useBattle } from './controller';
import { foley } from '../audio/audio';

export interface Stamp {
  id: string;
  text: string;
  mark: string;
  tone: 'warm' | 'cool' | 'hot' | 'calm';
}

export const STAMPS: Stamp[] = [
  { id: 'hi', text: 'よろしく！', mark: '♪', tone: 'warm' },
  { id: 'nice', text: 'ナイス！', mark: '★', tone: 'hot' },
  { id: 'wow', text: 'やるな…！', mark: '!?', tone: 'cool' },
  { id: 'go', text: 'いくぞ！', mark: 'GO', tone: 'hot' },
  { id: 'notyet', text: 'まだまだ！', mark: '!!', tone: 'hot' },
  { id: 'thx', text: 'ありがとう', mark: '♡', tone: 'warm' },
  { id: 'sorry', text: 'ごめん！', mark: '＞＜', tone: 'calm' },
  { id: 'think', text: 'うーん…', mark: '…', tone: 'calm' },
  { id: 'gg', text: 'いい勝負だった！', mark: 'GG', tone: 'warm' },
];
const byId = (id: string) => STAMPS.find((s) => s.id === id)!;

/** how the CPU answers a stamp (ids, picked at random) */
const REPLY: Record<string, string[]> = {
  hi: ['hi'],
  nice: ['thx'],
  wow: ['notyet', 'thx'],
  go: ['go', 'notyet'],
  notyet: ['go', 'wow'],
  thx: ['hi', 'nice'],
  sorry: ['think', 'nice'],
  think: ['go'],
  gg: ['gg', 'thx'],
};
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

interface Shown {
  key: number;
  stamp: Stamp;
}

export function Stamps({ oppName }: { oppName: string }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Shown | null>(null);
  const [theirs, setTheirs] = useState<Shown | null>(null);
  const cool = useRef(0);
  const cpuCool = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const cpuSay = (id: string, delay = 900) => {
    const now = performance.now();
    if (now - cpuCool.current < 4000) return;
    cpuCool.current = now + delay;
    later(delay, () => {
      foley.pop();
      setTheirs({ key: Date.now(), stamp: byId(id) });
      later(2600, () => setTheirs(null));
    });
  };

  const send = (s: Stamp) => {
    const now = performance.now();
    if (now - cool.current < 1500) return;
    cool.current = now;
    setOpen(false);
    foley.pop();
    setMine({ key: Date.now(), stamp: s });
    later(2600, () => setMine(null));
    if (Math.random() < 0.75) cpuSay(pick(REPLY[s.id] ?? ['think']), 900 + Math.random() * 900);
  };

  // the CPU reacts to the game: greets, cheers its KOs, grumbles at losses
  useEffect(
    () =>
      useBattle.subscribe((st, prev) => {
        const ev = st.lastEvent;
        if (!ev || ev === prev.lastEvent) return;
        if (ev.e === 'setupDone') cpuSay('hi', 700);
        else if (ev.e === 'ko') {
          if (Math.random() < 0.55) cpuSay(ev.pos.p === 1 ? pick(['wow', 'notyet']) : pick(['go', 'nice']), 1100);
        } else if (ev.e === 'gameover') cpuSay('gg', 1400);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.stamp-ui')) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  return (
    <>
      <div className="stamp-ui">
        <button className={`stamp-btn ${open ? 'on' : ''}`} title="スタンプ" onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="currentColor" />
            <circle cx="8" cy="11" r="1.4" fill="#0b1333" />
            <circle cx="12" cy="11" r="1.4" fill="#0b1333" />
            <circle cx="16" cy="11" r="1.4" fill="#0b1333" />
          </svg>
        </button>
        <AnimatePresence>
          {open && (
            <motion.div className="stamp-palette" initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.97 }} transition={{ duration: 0.18 }}>
              {STAMPS.map((s) => (
                <button key={s.id} className={`stamp-chip ${s.tone}`} onClick={() => send(s)}>
                  <i>{s.mark}</i>
                  {s.text}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {mine && <Bubble key={mine.key} stamp={mine.stamp} side="me" />}
        {theirs && <Bubble key={theirs.key} stamp={theirs.stamp} side="opp" who={oppName} />}
      </AnimatePresence>
    </>
  );
}

function Bubble({ stamp, side, who }: { stamp: Stamp; side: 'me' | 'opp'; who?: string }) {
  return (
    <motion.div
      className={`stamp-bubble ${side} ${stamp.tone}`}
      initial={{ opacity: 0, scale: 0.6, y: side === 'me' ? 10 : -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
    >
      <i>{stamp.mark}</i>
      <span>{stamp.text}</span>
      {who && <small>{who}</small>}
    </motion.div>
  );
}
