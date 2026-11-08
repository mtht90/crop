// ステージイベント: a winding map of 15 stages over the event's painting, in
// the manner of a stage-select map. Pick a stage (the next one is picked for
// you), see its rule and rewards, and fight. Shards trade at the exchange.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { activeDeck, useStore } from '../state/store';
import { validateDeck } from '../engine/decks';
import { card } from '../engine/cards';
import { CardFace } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { TopBar } from '../ui/TopBar';
import { askConfirm } from '../ui/Confirm';
import { artUrl, asset } from '../lib/assets';
import { foley, playMusic, sfx } from '../audio/audio';
import { fmtRemain } from '../state/progress';
import { currentStageEvent, EVENT_CARD_DROP, shopOf, STAGE_COUNT, stageNow, stagesOf, type Stage as StageT } from '../state/stages';

/** each event's accent (r, g, b) */
const TINT: Record<string, string> = { water: '90, 170, 255', grass: '110, 210, 120', dark: '170, 110, 255', psychic: '215, 120, 255' };

type Sheet = 'shop' | 'rewards' | 'help' | null;

const Shard = ({ size = '1.1em' }: { size?: string }) => <img className="shard-ico" src={asset('ui/shard.svg')} alt="" style={{ width: size, height: size }} />;

/**
 * where node i sits on the winding path. `along` is the map's long side; the
 * first and last stages keep clear of the title and the bottom panel.
 */
/** each stage's picture: the islands in order, the three bosses their own */
const ART = ['s0', 's1', 's2', 's3', 'boss1', 's9', 's5', 's6', 's7', 'boss2', 's8', 's4', 's10', 's11', 'boss3'];
const nodeArt = (i: number) => ART[i] ?? 's0';

const PAD = { portrait: [300, 230], landscape: [150, 130], fit: [90, 90] } as const;
function nodePos(i: number, along: number, across: number, portrait: boolean, fit = false) {
  const [pa, pb] = fit ? PAD.fit : portrait ? PAD.portrait : PAD.landscape;
  const step = (along - pa - pb) / (STAGE_COUNT - 1);
  const a = pa + step * i;
  const wave = Math.sin(i * 0.95 + 0.4);
  // sideways the path keeps to the middle band (title above, panel below)
  const b = portrait ? across * (0.5 + wave * 0.3) : across * (fit ? 0.5 + wave * 0.12 : 0.52 + wave * 0.17);
  return portrait ? { x: b, y: along - a } : { x: a, y: b };
}

export function Stage() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  const startStage = useStore((s) => s.startStage);
  const tradeStage = useStore((s) => s.tradeStage);
  useEffect(() => playMusic('legends'), []);
  const { ev, ends } = currentStageEvent();
  const sv = stageNow(save.stages);
  const stages = useMemo(() => stagesOf(ev), [ev]);
  const next = Math.min(sv.cleared, STAGE_COUNT - 1);
  const [sel, setSel] = useState(next);
  const [sheet, setSheet] = useState<Sheet>(null);
  const st = stages[sel];
  const deck = activeDeck(save);
  const deckOk = !!deck && validateDeck(deck.cards).length === 0;
  const cardDef = card(ev.card);

  // the map's size follows the screen; it scrolls along its long side
  const scroller = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLDivElement>(null);
  const shards = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 390, h: 600 });
  const [portrait, setPortrait] = useState(() => window.innerHeight >= window.innerWidth);
  // on a phone the map lives between the title and the bottom panel, so no
  // stage ever hides behind them (a big screen has room for the map to wind under)
  const fitBand = portrait || window.innerHeight < 520;
  const [band, setBand] = useState<{ top: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const isPortrait = window.innerHeight >= window.innerWidth;
      setPortrait(isPortrait);
      const b = body.current?.getBoundingClientRect();
      if (b && (isPortrait || window.innerHeight < 520)) {
        const top = Math.max(logo.current?.getBoundingClientRect().bottom ?? b.top, shards.current?.getBoundingClientRect().bottom ?? b.top) - b.top + 6;
        const bottom = b.bottom - (foot.current?.getBoundingClientRect().top ?? b.bottom) + 6;
        setBand({ top: Math.max(0, Math.round(top)), bottom: Math.max(0, Math.round(bottom)) });
      } else setBand(null);
      requestAnimationFrame(() => {
        const r = scroller.current?.getBoundingClientRect();
        if (r) setBox({ w: r.width, h: r.height });
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    for (const el of [body.current, logo.current, shards.current, foot.current]) if (el) ro.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);
  const fitted = fitBand && !!band;
  const along = portrait ? Math.max(box.h, STAGE_COUNT * 112 + (fitted ? 180 : 530)) : Math.max(box.w, STAGE_COUNT * 150 + (fitted ? 180 : 280));
  const across = portrait ? box.w : box.h;
  const pts = stages.map((_, i) => nodePos(i, along, across, portrait, fitted));
  // open on the stage to play next
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const p = pts[next];
    if (portrait) el.scrollTop = Math.max(0, p.y - box.h * (fitted ? 0.5 : 0.6));
    else el.scrollLeft = Math.max(0, p.x - box.w * 0.35);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portrait, box.w, box.h, fitted]);

  const pick = (i: number) => {
    if (i > sv.cleared) {
      foley.tick();
      return;
    }
    sfx('select', 0.5);
    setSel(i);
  };
  const challenge = async () => {
    if (!deck || !deckOk) return go('deck');
    sfx('horn-3', 0.6);
    if (!startStage(sel, deck.cards)) await askConfirm('まだ挑戦できないステージです', 'OK');
  };
  const open = (k: Sheet) => {
    sfx('expand', 0.4);
    setSheet(k);
  };
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const done = (i: number) => i < sv.cleared;
  const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const start = new Date(ends.getFullYear(), ends.getMonth(), ends.getDate() - 14);

  return (
    <div className="screen stg" style={{ ['--et' as string]: TINT[ev.type] ?? '200, 170, 255' }}>
      <div className="stg-bg" style={{ backgroundImage: `url(${artUrl(ev.bg)})` }} />
      <div className="stg-shade" />
      <div className="page stg-page">
        <TopBar
          title="イベント"
          back="arena"
          right={
            <button className="round-btn" title="あそびかた" onClick={() => open('help')}>
              ?
            </button>
          }
        />
        <div className="stg-body" ref={body}>
          <div className="stg-map" ref={scroller} style={fitted ? { top: band!.top, bottom: band!.bottom } : undefined}>
            <div className="stg-track" style={portrait ? { height: along, width: '100%' } : { width: along, height: '100%' }}>
              <svg className="stg-path" width={portrait ? across : along} height={portrait ? along : across}>
                <path d={path} className="stg-path-bg" />
                <path d={path} className="stg-path-dash" />
              </svg>
              {stages.map((s, i) => {
                const lock = i > sv.cleared;
                const cur = i === sv.cleared;
                return (
                  <button
                    key={i}
                    className={`stg-node ${s.boss ? 'boss' : ''} ${i === STAGE_COUNT - 1 ? 'final' : ''} ${lock ? 'lock' : ''} ${cur ? 'cur' : ''} ${done(i) ? 'done' : ''} ${sel === i ? 'sel' : ''}`}
                    style={{ left: pts[i].x, top: pts[i].y }}
                    onClick={() => pick(i)}
                  >
                    {i % 5 === 0 && <span className="stg-chapter">第{i / 5 + 1}章</span>}
                    {s.boss && <span className="stg-boss-tag">BOSS</span>}
                    <span className="stg-glow" />
                    <img className="stg-art" src={asset(`ui/stage/${nodeArt(i)}.webp`)} alt="" draggable={false} />
                    {lock && (
                      <span className="stg-lock">
                        <Icon name="lock" />
                      </span>
                    )}
                    <span className="stg-label">{s.label}</span>
                    {done(i) && (
                      <span className="stg-check">
                        <Icon name="check" />
                      </span>
                    )}
                    {cur && <span className="stg-here">▼</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <motion.div ref={logo} className="stg-logo" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            <span className="stg-kicker">
              <Icon name="crown" /> 期間限定イベント
            </span>
            <h1>
              <span>{ev.title[0]}</span>
              <span>{ev.title[1]}</span>
            </h1>
            <span className="stg-period">
              <Icon name="hourglass" /> {fmtDate(start)}〜{fmtDate(new Date(ends.getTime() - 86400000))}（あと {fmtRemain(ends.getTime() - Date.now())}）
            </span>
          </motion.div>

          <div className="stg-shards" ref={shards}>
            <small>イベントのかけら</small>
            <b>
              <Shard size="1.2em" /> {sv.shards.toLocaleString()}
            </b>
            <button className="stg-mini" onClick={() => open('shop')}>
              交換所 <span>›</span>
            </button>
          </div>

          <div className="stg-foot" ref={foot}>
            <StageInfo st={st} first={!done(st.index)} />
            <div className="stg-actions">
              <button className="stg-sub" onClick={() => open('rewards')}>
                <Icon name="chest" /> 報酬一覧
              </button>
              <motion.button className="stg-go" whileTap={{ scale: 0.97 }} onClick={challenge}>
                <span>{deckOk ? `${st.label} に挑戦` : 'デッキを組む'}</span>
                <i>›</i>
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {sheet && (
          <motion.div className="login-modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(null)}>
            <motion.div className="panel raid3-sheet stg-sheet" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn close" title="閉じる" onClick={() => setSheet(null)}>
                <Icon name="close" />
              </button>
              {sheet === 'shop' && (
                <>
                  <h2>交換所</h2>
                  <div className="stg-have">
                    所持 <Shard /> <b>{sv.shards.toLocaleString()}</b>
                  </div>
                  {shopOf(ev).map((it) => {
                    const n = sv.bought[it.id] ?? 0;
                    const left = it.limit - n;
                    return (
                      <div className="stg-item" key={it.id}>
                        <div className="stg-item-ico">{it.card ? <CardFace cid={it.card} /> : <Icon name="gem" size="2.2em" />}</div>
                        <div className="stg-item-main">
                          <b>{it.label}</b>
                          <small>
                            あと{left}回 ・ <Shard /> {it.cost}
                          </small>
                        </div>
                        <button
                          className="btn small"
                          disabled={left <= 0 || sv.shards < it.cost}
                          onClick={() => {
                            if (tradeStage(it.id)) {
                              sfx('gold', 0.6);
                              foley.chime(2);
                            }
                          }}
                        >
                          {left <= 0 ? '交換済み' : '交換'}
                        </button>
                      </div>
                    );
                  })}
                  <p className="raid3-note">かけらはステージに勝つとときどき落ちます（ボスは必ず）。イベントが終わると、かけらは消えます。</p>
                </>
              )}
              {sheet === 'rewards' && (
                <>
                  <h2>報酬一覧</h2>
                  <h3>はじめてクリアしたとき</h3>
                  <div className="stg-rw-grid">
                    {stages.map((s) => (
                      <div key={s.index} className={`stg-rw ${done(s.index) ? 'got' : ''} ${s.boss ? 'boss' : ''}`}>
                        <small>{s.label}</small>
                        <b>
                          <Icon name="gem" /> {s.gems}
                        </b>
                      </div>
                    ))}
                  </div>
                  <h3>勝つたびに</h3>
                  <p className="raid3-note">
                    <Icon name="gem" /> ジェム：ふつうのステージ70、1-5・2-5のボス130、3-5のボス270
                  </p>
                  <p className="raid3-note">
                    <Shard /> イベントのかけら：ふつうのステージは80%の確率で10〜40個、1-5・2-5のボスは必ず40〜60個、3-5のボスは必ず80〜100個
                  </p>
                  <h3>3-5 のボス</h3>
                  <div className="raid-drop-row">
                    <div className={`raid-drop-card ${(save.collection[ev.card] ?? 0) > 0 ? '' : 'locked'}`}>
                      <CardFace cid={ev.card} />
                    </div>
                    <div>
                      <b>「{cardDef.name}」</b>
                      <p>3-5 のボスに勝つたび、{Math.round(EVENT_CARD_DROP * 100)}%の確率で手に入る。交換所でかけらと交換もできる。このイベントでしか手に入らない。</p>
                    </div>
                  </div>
                </>
              )}
              {sheet === 'help' && (
                <>
                  <h2>あそびかた</h2>
                  <ul className="raid3-notes stg-help">
                    <li>{ev.blurb}</li>
                    <li>ステージは全{STAGE_COUNT}。勝つと次のステージが開きます。クリアしたステージは何度でも遊べます</li>
                    <li>ステージごとに変則ルールがあります</li>
                    <li>1-5・2-5・3-5はボス。3-5を倒すとイベントクリアです</li>
                    <li>はじめてクリアするとジェム。勝つたびに「イベントのかけら」がときどき手に入り、交換所で限定カードやジェムと交換できます</li>
                    <li>イベントは2週間ごとに入れ替わります。かけらは次のイベントには持ち越せません</li>
                  </ul>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StageInfo({ st, first }: { st: StageT; first: boolean }) {
  return (
    <motion.div className={`stg-info ${st.boss ? 'boss' : ''}`} key={st.index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <img className="stg-info-por" src={artUrl(st.portrait)} alt="" />
      <div className="stg-info-main">
        <div className="stg-info-head">
          <span className="stg-info-label">{st.label}</span>
          <b>{st.name}</b>
        </div>
        <ul>
          {st.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <small className="stg-info-rw">
          {first && (
            <>
              初回 <Icon name="gem" /> {st.gems} ・{' '}
            </>
          )}
          勝利 <Icon name="gem" /> {st.winGems}{' '}
          ・ CPU Lv.{st.cpu}
        </small>
      </div>
    </motion.div>
  );
}

