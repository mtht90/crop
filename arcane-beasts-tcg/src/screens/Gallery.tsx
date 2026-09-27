import { ALL_CARDS } from '../engine/cards';
import { CardBack, CardFace } from '../ui/Card';

export function Gallery() {
  const q = new URLSearchParams(location.search);
  const from = Number(q.get('from') ?? 0);
  const n = Number(q.get('n') ?? 12);
  const w = Number(q.get('w') ?? 260);
  const list = ALL_CARDS.slice(from, from + n);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', alignContent: 'flex-start', gap: 18, background: '#1a2040' }}>
      {list.map((c) => (
        <CardFace key={c.id} cid={c.id} style={{ width: w }} />
      ))}
      {from === 0 && <CardBack style={{ width: w }} />}
    </div>
  );
}
