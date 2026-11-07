// The game's logo in type (gold, with a light that sweeps across it)
export function Logo({ size = 'big' }: { size?: 'big' | 'small' }) {
  return (
    <div className={`ab-logo ${size}`}>
      <div className="ab-logo-main" data-text="ARCANE BEASTS">
        ARCANE BEASTS
      </div>
      <div className="ab-logo-sub">
        <i />
        <span>TRADING CARD GAME</span>
        <i />
      </div>
    </div>
  );
}

/** embers drifting up the screen */
export function Embers({ n = 26 }: { n?: number }) {
  return (
    <div className="embers" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${-((i * 0.73) % 6)}s`,
            animationDuration: `${5 + ((i * 1.3) % 4)}s`,
            ['--dx' as string]: `${((i * 53) % 60) - 30}px`,
            ['--s' as string]: `${2 + (i % 4)}px`,
          }}
        />
      ))}
    </div>
  );
}
