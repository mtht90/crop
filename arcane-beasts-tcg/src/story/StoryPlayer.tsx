// ============================================================================
// Visual-novel player: backgrounds with slow camera moves, standing portraits
// with entrances and moods, weather, letterbox, chapter cards, choices,
// typewriter text, auto / fast-forward and a backlog.
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { artUrl } from '../lib/assets';
import { foley, playMusic, sfx, stopMusic } from '../audio/audio';
import { askConfirm } from '../ui/Confirm';
import { Weather as WeatherLayer } from './Weather';
import type { Beat, Cast, Pan, Slot, Style, Weather } from './types';
import './story.css';

interface CharState {
  id: string;
  at: Slot;
  mood: string;
  nonce: number;
  enter: 'slide' | 'fade' | 'drop' | 'rise';
}
interface SayState {
  who: string | null;
  name: string;
  color: string;
  text: string;
  style: Style;
  nonce: number;
}
interface BgState {
  key: string;
  pan: Pan;
  nonce: number;
  tint?: string;
}

const SLOT_X: Record<Slot, number> = { FL: 12, L: 30, C: 50, R: 72, FR: 88 };
const TYPE_MS = 30;

export interface StoryPlayerProps {
  beats: Beat[];
  cast: Record<string, Cast>;
  /** called once when the scene ends or is skipped */
  onDone: () => void;
  /** keep the music that is already playing at the end (default: yes) */
  label?: string;
  allowSkip?: boolean;
}

export function StoryPlayer({ beats: initial, cast, onDone, label, allowSkip = true }: StoryPlayerProps) {
  const [beats, setBeats] = useState<Beat[]>(initial);
  const [i, setI] = useState(0);
  const [bg, setBg] = useState<BgState | null>(null);
  const [chars, setChars] = useState<CharState[]>([]);
  const [wx, setWx] = useState<Weather>('none');
  const [bars, setBars] = useState(false);
  const [say, setSay] = useState<SayState | null>(null);
  const [typed, setTyped] = useState(false);
  const [card, setCard] = useState<{ main: string; sub?: string; kicker?: string; nonce: number } | null>(null);
  const [pick, setPick] = useState<{ prompt?: string; options: { label: string; then: Beat[] }[] } | null>(null);
  const [flash, setFlash] = useState<{ kind: string; nonce: number } | null>(null);
  const [shake, setShake] = useState(0);
  const [punch, setPunch] = useState(0);
  const [veil, setVeil] = useState<{ color: 'black' | 'white'; on: boolean }>({ color: 'black', on: false });
  const [auto, setAuto] = useState(false);
  const [fast, setFast] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const log = useRef<{ name: string; text: string; color: string }[]>([]);
  const [, bumpLog] = useState(0);
  const nonce = useRef(0);
  const done = useRef(false);
  const typedRef = useRef(false);
  typedRef.current = typed;
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onDone();
  }, [onDone]);

  // ---- apply the current beat ------------------------------------------------
  useEffect(() => {
    if (i >= beats.length) {
      finish();
      return;
    }
    const b = beats[i];
    const next = (ms = 0) => {
      const t = setTimeout(() => setI((n) => n + 1), fast ? Math.min(ms, 60) : ms);
      return () => clearTimeout(t);
    };
    switch (b.t) {
      case 'bg':
        setBg({ key: b.key, pan: b.pan ?? 'in', nonce: ++nonce.current, tint: b.tint });
        return next(fast ? 0 : 120);
      case 'show':
        setChars((cs) => [...cs.filter((c) => c.id !== b.id), { id: b.id, at: b.at, mood: b.mood ?? 'normal', nonce: ++nonce.current, enter: b.enter ?? 'slide' }]);
        return next(fast ? 0 : 320);
      case 'hide':
        setChars((cs) => cs.filter((c) => c.id !== b.id));
        return next(fast ? 0 : 260);
      case 'move':
        setChars((cs) => cs.map((c) => (c.id === b.id ? { ...c, at: b.at } : c)));
        return next(fast ? 0 : 300);
      case 'mood':
        setChars((cs) => cs.map((c) => (c.id === b.id ? { ...c, mood: b.mood } : c)));
        return next(0);
      case 'weather':
        setWx(b.kind);
        return next(0);
      case 'bars':
        setBars(b.on);
        return next(fast ? 0 : 500);
      case 'bgm':
        if (b.key === 'stop') stopMusic();
        else playMusic(b.key);
        return next(0);
      case 'sfx':
        sfx(b.name, b.vol ?? 0.7);
        return next(0);
      case 'wait':
        return next(b.ms);
      case 'fx':
        runFx(b.fx);
        return next(b.fx === 'fadeBlack' || b.fx === 'fadeWhite' ? (fast ? 0 : 700) : b.fx === 'unfade' ? (fast ? 0 : 600) : fast ? 0 : 380);
      case 'title': {
        setSay(null);
        setCard({ main: b.main, sub: b.sub, kicker: b.kicker, nonce: ++nonce.current });
        foley.chime(5);
        const t = setTimeout(() => setI((n) => n + 1), fast ? 300 : 3400);
        return () => clearTimeout(t);
      }
      case 'choice':
        setSay(null);
        setPick({ prompt: b.prompt, options: b.options });
        return;
      case 'say': {
        setCard(null);
        const id = b.who;
        if (id && b.mood) setChars((cs) => cs.map((c) => (c.id === id ? { ...c, mood: b.mood! } : c)));
        const c = id ? cast[id] : null;
        const st: SayState = { who: id, name: b.as ?? c?.name ?? '', color: c?.color ?? '#cfd6ee', text: b.text, style: b.style ?? 'normal', nonce: ++nonce.current };
        setSay(st);
        setTyped(false);
        log.current.push({ name: st.name, text: st.text, color: st.color });
        if (log.current.length > 200) log.current.shift();
        bumpLog((n) => n + 1);
        if (b.style === 'shout') runFx('shake');
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, beats, fast]);

  function runFx(name: string) {
    switch (name) {
      case 'shake':
      case 'quake':
        setShake((n) => n + 1);
        break;
      case 'flash':
        setFlash({ kind: 'white', nonce: ++nonce.current });
        break;
      case 'flashRed':
        setFlash({ kind: 'red', nonce: ++nonce.current });
        break;
      case 'zoomPunch':
        setPunch((n) => n + 1);
        break;
      case 'fadeBlack':
        setVeil({ color: 'black', on: true });
        break;
      case 'fadeWhite':
        setVeil({ color: 'white', on: true });
        break;
      case 'unfade':
        setVeil((v) => ({ ...v, on: false }));
        break;
    }
    if (name === 'flash' || name === 'flashRed') foley.impact();
    if (name === 'shake' || name === 'quake') sfx('rumble', 0.4);
  }

  // ---- input -------------------------------------------------------------------
  const advance = useCallback(() => {
    if (pick) return;
    if (logOpen) return;
    const b = beats[i];
    if (!b) return;
    if (b.t === 'title') return setI((n) => n + 1);
    if (b.t === 'say') {
      if (!typedRef.current) return setTyped(true);
      foley.tick();
      setI((n) => n + 1);
    }
  }, [beats, i, pick, logOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        advance();
      } else if (e.key === 'Escape') setLogOpen(false);
      else if (e.key === 'a' || e.key === 'A') setAuto((v) => !v);
      else if (e.key === 'l' || e.key === 'L') setLogOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  // auto / fast-forward
  useEffect(() => {
    const b = beats[i];
    if (!b || b.t !== 'say' || !typed || pick) return;
    if (fast) {
      const t = setTimeout(() => setI((n) => n + 1), 70);
      return () => clearTimeout(t);
    }
    if (auto) {
      const t = setTimeout(() => setI((n) => n + 1), 900 + b.text.length * 55);
      return () => clearTimeout(t);
    }
  }, [auto, fast, typed, i, beats, pick]);

  const choose = (k: number) => {
    if (!pick) return;
    const o = pick.options[k];
    sfx('button', 0.6);
    log.current.push({ name: 'アルト', text: `▶ ${o.label}`, color: '#8fd0ff' });
    setPick(null);
    setBeats((bs) => [...bs.slice(0, i + 1), ...o.then, ...bs.slice(i + 1)]);
    setI((n) => n + 1);
  };

  const skip = async () => {
    if (allowSkip && (await askConfirm('このシーンをスキップしますか？（あとでストーリー画面から読み返せます）', 'スキップする'))) finish();
  };

  const speaker = say?.who ?? null;
  const shakeKey = `sh${shake}`;
  const bgStyle = useMemo(() => (bg ? { backgroundImage: `url(${artUrl(bg.key)})` } : undefined), [bg]);

  return (
    <div className="story" onClick={advance} data-label={label}>
      <motion.div key={shakeKey} className="story-world" animate={shake ? { x: [0, -10, 9, -7, 5, -3, 0], y: [0, 5, -6, 4, -3, 2, 0] } : undefined} transition={{ duration: 0.55 }}>
        {/* background (cross-fades when the key changes) */}
        <AnimatePresence initial={false}>
          {bg && (
            <motion.div key={bg.nonce} className="story-bg-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }}>
              <div className={`story-bg pan-${bg.pan}`} style={bgStyle} />
              {bg.tint && <div className="story-tint" style={{ background: bg.tint }} />}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div key={`pu${punch}`} className="story-punch" animate={punch ? { scale: [1, 1.07, 1] } : undefined} transition={{ duration: 0.4 }} />
        <WeatherLayer kind={wx} />

        {/* portraits */}
        <div className="story-chars">
          <AnimatePresence>
            {chars.map((c) => {
              const info = cast[c.id];
              if (!info) return null;
              const art = info.look[c.mood] ?? info.look.normal;
              const lit = !speaker || speaker === c.id;
              const flip = (c.at === 'R' || c.at === 'FR' ? info.faces !== 'left' : c.at === 'L' || c.at === 'FL' ? info.faces === 'left' : false) ? -1 : 1;
              const from = c.enter === 'fade' ? { x: 0, y: 0 } : c.enter === 'drop' ? { x: 0, y: -60 } : c.enter === 'rise' ? { x: 0, y: 60 } : { x: c.at === 'L' || c.at === 'FL' ? -80 : c.at === 'C' ? 0 : 80, y: 0 };
              return (
                <motion.div
                  key={c.id + c.nonce}
                  className={`story-char at-${c.at} ${lit ? 'lit' : 'dim'} mood-${c.mood}`}
                  initial={{ opacity: 0, x: from.x, y: from.y }}
                  animate={{ opacity: 1, x: 0, y: 0, left: `${SLOT_X[c.at]}%`, filter: lit ? 'brightness(1) saturate(1)' : 'brightness(0.5) saturate(0.7)', scale: lit ? 1 : 0.965 }}
                  exit={{ opacity: 0, transition: { duration: 0.25 } }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], left: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }}
                >
                  <div className="story-breath">
                    <motion.img
                      key={art}
                      src={artUrl(art)}
                      alt=""
                      draggable={false}
                      style={{ scaleX: flip }}
                      initial={{ opacity: 0.4 }}
                      animate={speaker === c.id && say ? { opacity: 1, y: [0, -7, 0] } : { opacity: 1, y: 0 }}
                      transition={{ duration: 0.28 }}
                      className={speaker === c.id && say?.style === 'shout' ? 'shouting' : ''}
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="story-vignette" />
        <AnimatePresence>{flash && <motion.div key={flash.nonce} className={`story-flash ${flash.kind}`} initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} />}</AnimatePresence>
        <div className={`story-veil ${veil.color} ${veil.on ? 'on' : ''}`} />
      </motion.div>

      {/* letterbox */}
      <div className={`story-bar top ${bars ? 'on' : ''}`} />
      <div className={`story-bar bottom ${bars ? 'on' : ''}`} />

      {/* chapter card */}
      <AnimatePresence>
        {card && (
          <motion.div key={card.nonce} className="story-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
            {card.kicker && (
              <motion.div className="kick" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.7 }}>
                {card.kicker}
              </motion.div>
            )}
            <motion.div className="main" initial={{ opacity: 0, letterSpacing: '0.6em' }} animate={{ opacity: 1, letterSpacing: '0.18em' }} transition={{ delay: 0.5, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}>
              {card.main}
            </motion.div>
            <motion.div className="rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.9, duration: 1 }} />
            {card.sub && (
              <motion.div className="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 0.8 }}>
                {card.sub}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* text box */}
      <AnimatePresence>
        {say && !card && !pick && (
          <motion.div key="box" className={`story-box ${say.style}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            {say.name && (
              <div className="story-name" style={{ ['--nc' as string]: say.color }}>
                {say.name}
              </div>
            )}
            <Typewriter key={say.nonce} text={say.text} style={say.style} fast={fast} finished={typed} onFinish={() => setTyped(true)} />
            <span className={`story-next ${typed ? 'on' : ''}`}>▼</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* choices */}
      <AnimatePresence>
        {pick && (
          <motion.div className="story-choice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.stopPropagation()}>
            {pick.prompt && <div className="q">{pick.prompt}</div>}
            {pick.options.map((o, k) => (
              <motion.button key={k} className="opt" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 * k + 0.1 }} onClick={() => choose(k)}>
                {o.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* controls */}
      <div className="story-ctrl" onClick={(e) => e.stopPropagation()}>
        <button className={auto ? 'on' : ''} onClick={() => (setAuto((v) => !v), setFast(false))}>
          オート
        </button>
        <button className={fast ? 'on' : ''} onClick={() => (setFast((v) => !v), setAuto(false))}>
          早送り
        </button>
        <button onClick={() => setLogOpen(true)}>ログ</button>
        {allowSkip && <button onClick={skip}>スキップ</button>}
      </div>

      <AnimatePresence>
        {logOpen && (
          <motion.div className="story-log" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => (e.stopPropagation(), setLogOpen(false))}>
            <div className="story-log-box" onClick={(e) => e.stopPropagation()}>
              <h3>これまでの会話</h3>
              <div className="lines">
                {log.current.map((l, k) => (
                  <p key={k}>
                    {l.name && <b style={{ color: l.color }}>{l.name}</b>}
                    <span>{l.text}</span>
                  </p>
                ))}
              </div>
              <button className="btn small" onClick={() => setLogOpen(false)}>
                とじる
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Typewriter({ text, style, fast, finished, onFinish }: { text: string; style: Style; fast: boolean; finished: boolean; onFinish: () => void }) {
  const [n, setN] = useState(0);
  const chars = useMemo(() => Array.from(text), [text]);
  useEffect(() => {
    if (finished) {
      setN(chars.length);
      return;
    }
    let k = 0;
    const iv = setInterval(() => {
      k += fast ? 4 : 1;
      setN(Math.min(chars.length, k));
      if (k >= chars.length) {
        clearInterval(iv);
        onFinish();
      }
    }, fast ? 12 : style === 'shout' ? 22 : TYPE_MS);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, chars, fast]);
  return (
    <p className={`story-text ${style}`}>
      {chars.slice(0, n).join('')}
      <span className="ghost">{chars.slice(n).join('')}</span>
    </p>
  );
}
