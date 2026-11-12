// 覇王の塔: the floors stacked from the bottom, the next one lit; pick a floor
// to see its foe, rule and reward, and climb.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { foley, playMusic, sfx } from '../audio/audio';
import { card, TYPE_JP } from '../engine/cards';
import { validateDeck } from '../engine/decks';
import { artUrl } from '../lib/assets';
import { fmtRemain } from '../state/progress';
import { modsText } from '../state/stages';
import { activeDeck, useStore } from '../state/store';
import { currentTower, floorsOf, TOWER_FLOORS, towerNow } from '../state/tower';
import { CardFace, EnergySymbol } from '../ui/Card';
import { askConfirm } from '../ui/Confirm';
import { Icon } from '../ui/Icon';
import { TopBar } from '../ui/TopBar';
import './tower.css';

export function Tower() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  const startTower = useStore((s) => s.startTower);
  useEffect(() => playMusic('legends'), []);
  const { t, ends, open } = currentTower();
  const sv = towerNow(save.tower);
  const floors = useMemo(() => floorsOf(t), [t]);
  const next = Math.min(sv.cleared + 1, TOWER_FLOORS);
  const [sel, setSel] = useState(next);
  const f = floors[sel - 1];
  const deck = activeDeck(save);
  const deckOk = !!deck && validateDeck(deck.cards).length === 0;
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // open on the floor to climb
  useLayoutEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-floor="${next}"]`);
    el?.scrollIntoView({ block: 'center' });
  }, [next]);

  const pick = (n: number) => {
    if (n > sv.cleared + 1) return void foley.tick();
    sfx('select', 0.5);
    setSel(n);
  };
  const climb = async () => {
    if (!deck || !deckOk) return go('deck');
    sfx('horn-3', 0.6);
    if (!startTower(sel, deck.cards)) await askConfirm('まだ挑戦できない階です', 'OK');
  };

  return (
    <div className="screen tw">
      <div className="page-bg tw-bg" style={{ backgroundImage: `url(${artUrl(t.bg)})` }} />
      <div className="tw-sky" />
      <div className="page tw-page">
        <TopBar title="覇王の塔" back="arena" />
        <div className="tw-head">
          <div className="tw-name">
            <small>覇王の塔</small>
            <b>{t.sub}</b>
          </div>
          <div className="tw-meta">
            <span className="tw-prog">
              <b>{sv.cleared}</b>/{TOWER_FLOORS}階
            </span>
            <span className="tw-ends">{open ? `のこり ${fmtRemain(ends.getTime() - now)}` : 'まもなく開催'}</span>
          </div>
        </div>

        <div className="tw-body">
          <div className="tw-scroll" ref={scroller}>
            <div className="tw-tower">
              <div className="tw-spire" />
              {[...floors].reverse().map((x) => {
                const done = x.n <= sv.cleared;
                const cur = x.n === sv.cleared + 1;
                const locked = x.n > sv.cleared + 1;
                return (
                  <button
                    key={x.n}
                    data-floor={x.n}
                    className={`tw-floor t-${x.type} ${x.boss ? 'boss' : ''} ${done ? 'done' : ''} ${cur ? 'cur' : ''} ${locked ? 'locked' : ''} ${sel === x.n ? 'sel' : ''}`}
                    onClick={() => pick(x.n)}
                  >
                    <span className="tw-no">
                      <b>{x.n}</b>階
                    </span>
                    <span className="tw-foe">
                      <img src={artUrl(x.portrait)} alt="" draggable={false} />
                    </span>
                    <span className="tw-type">
                      <EnergySymbol type={x.type} size="1.4em" />
                    </span>
                    {x.boss && <i className="tw-boss">BOSS</i>}
                    {done && <i className="tw-check">踏破</i>}
                    {cur && <i className="tw-here">NEXT</i>}
                  </button>
                );
              })}
              <div className="tw-gate">入口</div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={sel} className="tw-panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <div className="tw-panel-top">
                <img className="tw-panel-foe" src={artUrl(f.portrait)} alt="" draggable={false} />
                <div className="tw-panel-txt">
                  <small>
                    {f.n}階{f.boss ? '・ボス' : ''}
                  </small>
                  <b>{f.name}</b>
                  <span className="tw-panel-type">
                    <EnergySymbol type={f.type} size="1.1em" /> {TYPE_JP[f.type]}タイプ
                  </span>
                </div>
              </div>
              <ul className="tw-rules">
                {modsText(f.mods).map((r) => (
                  <li key={r}>{r}</li>
                ))}
                {f.cpu >= 11 && <li className="hard">相手は手札も山札もすべて見通している</li>}
              </ul>
              <div className="tw-reward">
                <span>
                  <Icon name="gem" /> {f.gems.toLocaleString()}
                </span>
                {f.coins > 0 && (
                  <span>
                    <Icon name="coin" /> {f.coins.toLocaleString()}
                  </span>
                )}
                {f.tickets?.premium && <span>レアパックチケット×{f.tickets.premium}</span>}
                {f.tickets?.sure3 && <span>★3確定チケット×{f.tickets.sure3}</span>}
                {f.n <= sv.cleared && <em>受け取り済み</em>}
              </div>
              {f.card && (
                <div className="tw-top-card">
                  <div className="tw-top-face">
                    <CardFace cid={f.card} />
                  </div>
                  <span>
                    踏破で「{card(f.card).name}」と称号「覇王」
                  </span>
                </div>
              )}
              <button className="btn primary tw-go" disabled={!open || f.n > sv.cleared + 1} onClick={climb}>
                {!open ? 'まもなく開催' : deckOk ? (f.n <= sv.cleared ? `${f.n}階にもう一度挑む` : `${f.n}階に挑む`) : 'デッキを組む'}
              </button>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
