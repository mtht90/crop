import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { useStore } from './state/store';
import { Gallery } from './screens/Gallery';
import { BattleScreen } from './battle/BattleScreen';
import { Title } from './screens/Title';
import { Starter } from './screens/Starter';
import { Home } from './screens/Home';
import { Rivals } from './screens/Rivals';
import { DeckBuilder } from './screens/DeckBuilder';
import { Collection } from './screens/Collection';
import { Shop } from './screens/Shop';
import { Credits, Rules, Settings } from './screens/Misc';
import { setVolumes, unlockAudio } from './audio/audio';
import { expand, RIVALS, STARTER_DECKS } from './engine/decks';
import './screens/screens.css';

function debugBattle() {
  const q = new URLSearchParams(location.search);
  const mine = STARTER_DECKS.find((d) => d.id === (q.get('me') ?? 'fire'))!;
  const rival = RIVALS.find((r) => r.id === (q.get('vs') ?? 'marina'))!;
  const theirs = STARTER_DECKS.find((d) => d.id === rival.deck)!;
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
  rivals: Rivals,
  battle: BattleScreen,
  deck: DeckBuilder,
  collection: Collection,
  shop: Shop,
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
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.has('gallery')) useStore.getState().go('gallery');
    else if (q.has('battle')) debugBattle();
    else if (q.has('screen')) useStore.getState().go(q.get('screen') as never);
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
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
      <AnimatePresence mode="wait">
        <motion.div key={screen === 'battle' ? `battle-${seq}` : screen} className="screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <Comp />
        </motion.div>
      </AnimatePresence>
    </>
  );
}
