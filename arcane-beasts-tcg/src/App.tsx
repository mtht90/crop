import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { activeDeck, useStore, type Screen } from './state/store';
import { Gallery } from './screens/Gallery';
import { BattleScreen } from './battle/BattleScreen';
import { Title } from './screens/Title';
import { Starter } from './screens/Starter';
import { Home } from './screens/Home';
import { Arena } from './screens/Arena';
import { Rivals } from './screens/Rivals';
import { DeckBuilder } from './screens/DeckBuilder';
import { Collection } from './screens/Collection';
import { Shop } from './screens/Shop';
import { Missions } from './screens/Missions';
import { Lobby } from './screens/Lobby';
import { StoryMap } from './screens/StoryMap';
import { Scene } from './screens/Scene';
import { online } from './online/client';
import { Credits, Rules, Settings } from './screens/Misc';
import { setVolumes, unlockAudio } from './audio/audio';
import { configureFx, vibrate } from './lib/fx';
import { setGyroEnabled, startGyro } from './lib/gyro';
import { expand, RIVALS, deckById } from './engine/decks';
import './screens/screens.css';
import { ConfirmDialog } from './ui/Confirm';
import { TabBar, TAB_OF } from './ui/TabBar';
import { More } from './screens/More';
import './styles/app.css';
import { useBattle } from './battle/controller';

if (import.meta.env.DEV) Object.assign(window, { __stores: { useStore, useBattle } });

function debugBattle() {
  const q = new URLSearchParams(location.search);
  const mine = deckById(q.get('me') ?? 'fire');
  const rival = RIVALS.find((r) => r.id === (q.get('vs') ?? 'marina'))!;
  const theirs = deckById(rival.deck);
  if (q.has('speed')) useStore.getState().update((s) => void (s.settings.speed = Number(q.get('speed'))));
  useStore.getState().startBattle({
    rival,
    playerDeck: expand(mine.cards),
    oppDeck: expand(theirs.cards),
    oppName: rival.name,
    oppPortrait: rival.portrait,
    level: rival.level,
    scene: rival.scene,
    reward: rival.reward,
    spectate: q.has('auto'),
  });
}

const SCREENS = {
  title: Title,
  starter: Starter,
  home: Home,
  arena: Arena,
  rivals: Rivals,
  battle: BattleScreen,
  deck: DeckBuilder,
  collection: Collection,
  shop: Shop,
  missions: Missions,
  lobby: Lobby,
  story: StoryMap,
  scene: Scene,
  more: More,
  settings: Settings,
  credits: Credits,
  rules: Rules,
  gallery: Gallery,
};

export function App() {
  const screen = useStore((s) => s.screen);
  const seq = useStore((s) => s.battleSeq);
  const settings = useStore((s) => s.save.settings);
  useEffect(() => setVolumes({ music: settings.music, sfx: settings.sfx }), [settings.music, settings.sfx]);
  useEffect(() => configureFx(settings.fx, settings.vibrate), [settings.fx, settings.vibrate]);
  useEffect(() => setGyroEnabled(settings.gyro), [settings.gyro]);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    // a game found by the server opens the battle screen
    online.onStart = (m) => {
      const st = useStore.getState();
      const deck = activeDeck(st.save);
      st.startBattle({
        rival: null,
        playerDeck: deck?.cards ?? [],
        oppDeck: [],
        oppName: m.opp.name,
        oppPortrait: m.opp.portrait,
        level: 'normal',
        scene: ['story/landscape-battlefield_nohumans', 'story/p-mountains', 'story/p-summer', 'story/landscape-castle', 'story/p-winter', 'story/p-great-tree'][Math.floor(Math.random() * 6)],
        reward: 0,
        online: m,
      });
    };
    if (q.has('room')) useStore.getState().go(useStore.getState().save.started ? 'lobby' : 'starter');
    else if (q.has('gallery')) useStore.getState().go('gallery');
    else if (q.has('battle')) debugBattle();
    else if (q.has('screen')) useStore.getState().go(q.get('screen') as never);
    const unlock = () => {
      unlockAudio();
      if (useStore.getState().save.settings.gyro) void startGyro();
    };
    window.addEventListener('pointerdown', unlock);
    // a light tick under the finger on anything pressable
    const tick = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && (e.target as Element | null)?.closest?.('button:not(:disabled), .tile2, .chip-btn, [role="button"]')) vibrate(5);
    };
    window.addEventListener('pointerdown', tick, { passive: true });
    // the browser's back (button, swipe, Android key) goes back a screen instead of leaving the game
    const LOCKED: Screen[] = ['battle', 'scene', 'title', 'starter'];
    try {
      history.replaceState({ ab: useStore.getState().screen }, '');
    } catch {
      /* no history (sandboxed frame) */
    }
    const onPop = (e: PopStateEvent) => {
      const cur = useStore.getState().screen;
      const to = (e.state as { ab?: Screen } | null)?.ab;
      // mid-battle, mid-scene and the opening screens stay where they are
      if (LOCKED.includes(cur)) return void history.pushState({ ab: cur }, '');
      if (to) useStore.setState({ screen: to });
      else if (cur !== 'home') {
        useStore.setState({ screen: 'home' });
        history.pushState({ ab: 'home' }, '');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('pointerdown', tick);
      window.removeEventListener('popstate', onPop);
    };
  }, []);
  const Comp = SCREENS[screen];
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="goldfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff8d6" />
            <stop offset="45%" stopColor="#f2c75c" />
            <stop offset="100%" stopColor="#a8701a" />
          </linearGradient>
        </defs>
      </svg>
      <div className={`app ${TAB_OF[screen] ? 'with-tabs' : ''}`}>
        {/* cross-fade: the next screen comes in while the last one fades (no blank moment between them) */}
        <AnimatePresence initial={false}>
          <motion.div
            key={screen === 'battle' ? `battle-${seq}` : screen}
            className="screen"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, pointerEvents: 'none', zIndex: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Comp />
          </motion.div>
        </AnimatePresence>
        {TAB_OF[screen] && <TabBar screen={screen} />}
      </div>
      <ConfirmDialog />
    </>
  );
}
