import { useStore } from '../state/store';
import { Icon } from './Icon';
import { sfx } from '../audio/audio';

export function TopBar({ title, back = 'home' as const, right }: { title: string; back?: 'home' | 'title' | null; right?: React.ReactNode }) {
  const go = useStore((s) => s.go);
  const coins = useStore((s) => s.save.coins);
  return (
    <div className="topbar">
      {back && (
        <button
          className="back-btn"
          onClick={() => {
            sfx('contract', 0.5);
            go(back);
          }}
        >
          <Icon name="back" /> もどる
        </button>
      )}
      <div className="topbar-title">{title}</div>
      <div className="topbar-right">
        {right}
        <span className="coin-chip">
          <Icon name="coin" /> {coins.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
