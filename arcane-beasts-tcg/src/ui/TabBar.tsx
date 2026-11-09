// The main navigation: five tabs along the bottom in portrait, down the left
// side in landscape. Sub-screens (強敵, ストーリー, フレンド対戦 …) light up
// the tab they belong to.
import { claimableCount } from '../state/progress';
import { extCtx, freePackState, useStore, type Screen } from '../state/store';
import { foley } from '../audio/audio';
import { Icon } from './Icon';

type Tab = 'home' | 'arena' | 'store' | 'deck' | 'more';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'ホーム', icon: 'tower-flag' },
  { id: 'arena', label: 'バトル', icon: 'swords' },
  { id: 'store', label: 'ショップ', icon: 'shop' },
  { id: 'deck', label: 'デッキ', icon: 'deck' },
  { id: 'more', label: 'その他', icon: 'scroll-unfurled' },
];

/** which tab a screen sits under (screens without one have no tab bar) */
export const TAB_OF: Partial<Record<Screen, Tab>> = {
  home: 'home',
  arena: 'arena',
  rivals: 'arena',
  raid: 'arena',
  story: 'arena',
  lobby: 'arena',
  shop: 'store',
  store: 'store',
  deck: 'deck',
  more: 'more',
  collection: 'more',
  missions: 'more',
  settings: 'more',
  rules: 'more',
  credits: 'more',
  wardrobe: 'more',
};

export function TabBar({ screen }: { screen: Screen }) {
  const go = useStore((s) => s.go);
  const save = useStore((s) => s.save);
  const active = TAB_OF[screen];
  const missions = claimableCount(save.progress, extCtx(save));
  const freePack = freePackState(save).ready;
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab ${active === t.id ? 'on' : ''}`}
          onClick={() => {
            if (screen === t.id) return;
            foley.tick();
            go(t.id);
          }}
        >
          <span className="tab-ico">
            <Icon name={t.icon} />
            {t.id === 'more' && missions > 0 && <i className="tab-dot">{missions}</i>}
            {t.id === 'store' && freePack && <i className="tab-dot">無料</i>}
          </span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
