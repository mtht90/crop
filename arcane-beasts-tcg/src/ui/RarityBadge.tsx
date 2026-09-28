import { RARITY_NAME, RARITY_SYMBOL } from '../engine/cards';
import type { Rarity } from '../engine/types';

/** ◇ ◇◇ ◇◇◇ ◇◇◇◇ ☆ ♛ chip; `named` adds the tier name */
export function RarityBadge({ r, named }: { r: Rarity; named?: boolean }) {
  return (
    <span className={`rbadge rb-${r}`} title={RARITY_NAME[r]}>
      <b>{RARITY_SYMBOL[r]}</b>
      {named && <span>{RARITY_NAME[r]}</span>}
    </span>
  );
}
