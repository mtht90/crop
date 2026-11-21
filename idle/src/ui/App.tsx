import { useEffect, useRef, useState } from 'preact/hooks';
import { game, type GameEvent } from '../game/store';
import { Field } from '../render/field';
import { areaIndex, fmt } from '../game/core';
import { bgUrl } from '../render/sprites';
import * as L from '../game/logic';
import { unlockAudio } from '../game/audio';
import { useGame } from './common';
import { Coin, Gem, Orb, Soul, TabIcon } from './icons';
import { Hud } from './Hud';
import { TrainTab } from './tabs/TrainTab';
import { CharsTab } from './tabs/CharsTab';
import { GearTab } from './tabs/GearTab';
import { GuardiansTab } from './tabs/GuardiansTab';
import { GachaTab } from './tabs/GachaTab';
import { MoreTab } from './tabs/MoreTab';
import { OfflineModal } from './modals/OfflineModal';
import { IntroModal } from './modals/IntroModal';

export type TabKey = 'train' | 'chars' | 'gear' | 'guardian' | 'gacha' | 'more';
const TABS: [TabKey, string, string][] = [
  ['train', '修練', 'train'],
  ['chars', '霊獣', 'chars'],
  ['gear', '装備', 'gear'],
  ['guardian', '守護霊', 'guardian'],
  ['gacha', '召喚', 'gacha'],
  ['more', 'その他', 'more'],
];

let fieldRef: Field | null = null;
export const getField = () => fieldRef;

interface Toast {
  id: number;
  text: string;
  kind: string;
}

export function App() {
  const s = useGame(5);
  const [tab, setTab] = useState<TabKey>('train');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [offline, setOffline] = useState<L.OfflineReport | null>(null);
  const [intro, setIntro] = useState(!game.save.seenIntro);
  const canvas = useRef<HTMLCanvasElement>(null);
  const coinEl = useRef<HTMLDivElement>(null);
  const orbEl = useRef<HTMLDivElement>(null);
  const [, setHud] = useState(0);

  useEffect(() => {
    const f = new Field(canvas.current!);
    fieldRef = f;
    (window as any).__field = f;
    f.onHud = () => setHud((x) => x + 1);
    let pulseT = 0;
    f.onCoin = () => {
      const el = coinEl.current;
      if (!el || performance.now() - pulseT < 120) return;
      pulseT = performance.now();
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    };
    f.start();
    const off = game.onEvent((e: GameEvent) => {
      if (e.t === 'toast') {
        const id = Math.random();
        setToasts((t) => [...t.slice(-3), { id, text: e.text, kind: e.kind ?? 'info' }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3100);
      } else if (e.t === 'offline') setOffline(e.report);
    });
    // offline catch-up after first paint
    setTimeout(() => game.catchUp(), 300);
    game.startAutosave();
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      off();
      f.destroy();
    };
  }, []);

  // coin particles fly toward the coin counter
  useEffect(() => {
    const upd = () => {
      if (!fieldRef || !coinEl.current || !canvas.current) return;
      const c = canvas.current.getBoundingClientRect();
      const r = coinEl.current.getBoundingClientRect();
      fieldRef.coinTarget = { x: r.left + 14 - c.left, y: r.top + r.height / 2 - c.top };
      if (orbEl.current) {
        const o = orbEl.current.getBoundingClientRect();
        fieldRef.orbTarget = { x: o.left + 14 - c.left, y: o.top + o.height / 2 - c.top };
      }
    };
    upd();
    window.addEventListener('resize', upd);
    const t = setInterval(upd, 2000);
    return () => {
      window.removeEventListener('resize', upd);
      clearInterval(t);
    };
  }, []);

  const gachaAfford = s.gems >= 150;
  const area = areaIndex(s.g);
  useEffect(() => {
    document.documentElement.style.setProperty('--bg-url', `url('${bgUrl(area)}')`);
  }, [area]);
  const orbDot = s.orbs > 0;

  return (
    <div id="app">
      <div class="topbar">
        <div class="cur flex" ref={coinEl} title="コイン">
          <Coin size={24} />
          <span class="num">{fmt(s.coins)}</span>
        </div>
        <div class="cur flex" title="霊晶（召喚に使う）">
          <Gem size={24} />
          <span class="num">{fmt(s.gems)}</span>
        </div>
        {s.souls > 0 && (
          <div class="cur" title="魂石（輪廻で得る恒久ボーナス）">
            <Soul size={22} />
            <span class="num">{fmt(s.souls)}</span>
          </div>
        )}
        <div class="cur" title="霊珠（守護霊がやどる）" ref={orbEl}>
          <Orb size={22} />
          <span class="num">{s.orbs}</span>
        </div>
      </div>

      <div class="field-wrap">
        <canvas class="field" ref={canvas} />
        <Hud onTab={setTab} />
        <div class="toasts">
          {toasts.map((t) => (
            <div key={t.id} class={`toast ${t.kind}`}>
              {t.text}
            </div>
          ))}
        </div>
      </div>

      <div class="main-panel">
        <div class="tab-scroll">
          {tab === 'train' && <TrainTab />}
          {tab === 'chars' && <CharsTab />}
          {tab === 'gear' && <GearTab />}
          {tab === 'guardian' && <GuardiansTab />}
          {tab === 'gacha' && <GachaTab />}
          {tab === 'more' && <MoreTab />}
        </div>
      </div>

      <nav class="tabbar">
        {TABS.map(([k, label, icon]) => (
          <button class={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            <span class="tab-ico">
              <TabIcon name={icon} size={30} />
            </span>
            <span>{label}</span>
            {k === 'gacha' && gachaAfford && <span class="dot">!</span>}
            {k === 'guardian' && orbDot && <span class="dot">{s.orbs}</span>}
            {k === 'more' && L.canPrestige(s) && s.stats.prestiges === 0 && <span class="dot">!</span>}
          </button>
        ))}
      </nav>

      {offline && <OfflineModal report={offline} onClose={() => setOffline(null)} />}
      {intro && (
        <IntroModal
          onClose={() => {
            game.act((sv) => (sv.seenIntro = true));
            setIntro(false);
          }}
        />
      )}
    </div>
  );
}
