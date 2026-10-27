import { useStore, type Screen } from '../state/store';
import { Icon } from './Icon';
import { sfx } from '../audio/audio';

/** page header: back (sub-screens only), title, extras and coins */
export function TopBar({ title, back = null, right }: { title: string; back?: Screen | null; right?: React.ReactNode }) {
  const go = useStore((s) => s.go);
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
        <span className="coin-chip">
          <Icon name="coin" /> {coins.toLocaleString()}
        </span>
      </div>
    </header>
  );
}
