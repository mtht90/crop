import { useStore, type Screen } from '../state/store';
import { Icon } from './Icon';
import { sfx } from '../audio/audio';

/** the gem chip opens the shop's ジェム section (set by the shop, to keep the import one-way) */
export let openGemShop = () => useStore.getState().go('store');
export const setOpenGemShop = (f: () => void) => void (openGemShop = f);

/** page header: back (sub-screens only), title, extras and coins */
export function TopBar({ title, back = null, right }: { title: string; back?: Screen | null; right?: React.ReactNode }) {
  const go = useStore((s) => s.go);
  const gems = useStore((s) => s.save.gems);
  const coins = useStore((s) => s.save.coins);
  return (
    <header className="page-head">
      {back && (
        <button
          className="back-btn"
          aria-label="もどる"
          onClick={() => {
            sfx('contract', 0.5);
            go(back);
          }}
        >
          <Icon name="back" />
        </button>
      )}
      <h1 className="page-title">{title}</h1>
      <div className="page-head-right">
        {right}
        <span className="coin-chip coin-only" title="コイン">
          <Icon name="coin" /> {coins.toLocaleString()}
        </span>
        <span
          className="coin-chip gem-chip"
          title="ジェムを買う"
          onClick={() => {
            sfx('expand', 0.4);
            openGemShop();
          }}
        >
          <Icon name="gem" /> {gems.toLocaleString()}
          <i className="chip-plus">+</i>
        </span>
      </div>
    </header>
  );
}
