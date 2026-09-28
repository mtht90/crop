import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { ALL_CARDS, card, ENERGIES } from '../engine/cards';
import { validateDeck } from '../engine/decks';
import type { CardDef, EType } from '../engine/types';
import { ENERGY_TYPES } from '../engine/types';
import { owned, useStore, type SavedDeck } from '../state/store';
import { artUrl } from '../lib/assets';
import { CardFace, EnergySymbol } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { TopBar } from '../ui/TopBar';
import { foley, playMusic, sfx } from '../audio/audio';
import { askConfirm } from '../ui/Confirm';

type Kind = 'all' | 'monster' | 'trainer' | 'energy';

function sortKey(c: CardDef) {
  const k = c.kind === 'monster' ? 0 : c.kind === 'trainer' ? 1 : 2;
  return k * 1000 + c.no;
}

export function DeckBuilder() {
  const save = useStore((s) => s.save);
  const update = useStore((s) => s.update);
  useEffect(() => playMusic('menu'), []);
  const [editing, setEditing] = useState<SavedDeck>(() => structuredClone(save.decks.find((d) => d.id === save.activeDeck) ?? save.decks[0] ?? { id: `deck-${Date.now()}`, name: '新しいデッキ', cards: [], cover: '' }));
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [types, setTypes] = useState<EType[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const errs = validateDeck(editing.cards);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of editing.cards) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [editing.cards]);
  const nameCount = (name: string) => editing.cards.filter((id) => card(id).name === name).length;

  const pool = ALL_CARDS.filter((c) => owned(save, c.id) > 0)
    .filter((c) => kind === 'all' || c.kind === kind)
    .filter((c) => !types.length || (c.kind === 'monster' && types.includes(c.type)) || (c.kind === 'energy' && types.includes(c.energyType)))
    .filter((c) => !q || c.name.includes(q))
    .sort((a, b) => sortKey(a) - sortKey(b));

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(''), 1600);
  };

  const add = (c: CardDef) => {
    const isBasicE = c.kind === 'energy' && c.basic;
    if (editing.cards.length >= 60) return flash('デッキは60枚までです');
    if (!isBasicE && nameCount(c.name) >= 4) return flash('同じ名前のカードは4枚までです');
    if ((counts.get(c.id) ?? 0) >= owned(save, c.id)) return flash('所持枚数が足りません');
    foley.place();
    setEditing({ ...editing, cards: [...editing.cards, c.id], cover: editing.cover || c.id });
    setDirty(true);
  };
  const remove = (id: string) => {
    const i = editing.cards.lastIndexOf(id);
    if (i < 0) return;
    foley.slide();
    const cards = [...editing.cards];
    cards.splice(i, 1);
    setEditing({ ...editing, cards });
    setDirty(true);
  };

  const autoEnergy = () => {
    const nonBasicE = editing.cards.filter((id) => {
      const c = card(id);
      return !(c.kind === 'energy' && c.basic);
    });
    const need = 60 - nonBasicE.length;
    if (need <= 0) return flash('エネルギーを入れる枠がありません');
    const weight = new Map<EType, number>();
    for (const id of nonBasicE) {
      const c = card(id);
      if (c.kind !== 'monster') continue;
      for (const a of c.attacks) for (const t of a.cost) if (t !== 'colorless') weight.set(t, (weight.get(t) ?? 0) + 1);
    }
    if (!weight.size) weight.set('fire', 1);
    const total = [...weight.values()].reduce((a, b) => a + b, 0);
    const out: string[] = [];
    const entries = [...weight.entries()].sort((a, b) => b[1] - a[1]);
    entries.forEach(([t, w], i) => {
      const n = i === entries.length - 1 ? need - out.length : Math.round((need * w) / total);
      const e = ENERGIES.find((x) => x.basic && x.energyType === t)!;
      for (let k = 0; k < n && out.length < need; k++) out.push(e.id);
    });
    sfx('magic-holy-2', 0.5);
    setEditing({ ...editing, cards: [...nonBasicE, ...out] });
    setDirty(true);
  };

  const saveDeck = (activate = false) => {
    update((s) => {
      const i = s.decks.findIndex((d) => d.id === editing.id);
      const cover = editing.cards.find((id) => card(id).kind === 'monster' && (card(id) as { omega?: boolean }).omega) ?? editing.cards.find((id) => card(id).kind === 'monster') ?? editing.cover;
      const d = { ...editing, cover: cover || editing.cover };
      if (i >= 0) s.decks[i] = d;
      else s.decks.push(d);
      if (activate || !s.activeDeck) s.activeDeck = d.id;
    });
    sfx('fanfare-short', 0.5);
    setDirty(false);
    flash(activate ? '保存して使用デッキに設定しました' : '保存しました');
  };

  const newDeck = () => {
    setEditing({ id: `deck-${Date.now()}`, name: `デッキ${save.decks.length + 1}`, cards: [], cover: '' });
    setDirty(true);
  };
  const deleteDeck = async () => {
    if (save.decks.length <= 1) return flash('最後のデッキは削除できません');
    if (!(await askConfirm(`「${editing.name}」を削除しますか？`, '削除する', true))) return;
    update((s) => {
      s.decks = s.decks.filter((d) => d.id !== editing.id);
      if (s.activeDeck === editing.id) s.activeDeck = s.decks[0].id;
    });
    const next = save.decks.find((d) => d.id !== editing.id)!;
    setEditing(structuredClone(next));
    setDirty(false);
  };

  // grouped list
  const groups: { title: string; ids: string[] }[] = [
    { title: 'モンスター', ids: [] },
    { title: 'トレーナーズ', ids: [] },
    { title: 'エネルギー', ids: [] },
  ];
  const uniq = [...new Set(editing.cards)].sort((a, b) => sortKey(card(a)) - sortKey(card(b)));
  for (const id of uniq) {
    const c = card(id);
    groups[c.kind === 'monster' ? 0 : c.kind === 'trainer' ? 1 : 2].ids.push(id);
  }
  const groupCount = (ids: string[]) => ids.reduce((n, id) => n + (counts.get(id) ?? 0), 0);

  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/grim-altar')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="デッキ編集" />
        <div className="db-left panel" style={{ padding: 'calc(var(--u) * 1)' }}>
          <div className="db-decks">
            {save.decks.map((d) => (
              <button
                key={d.id}
                className={d.id === editing.id ? 'on' : ''}
                onClick={async () => {
                  if (dirty && !(await askConfirm('保存していない変更があります。破棄して切り替えますか？', '破棄する', true))) return;
                  setEditing(structuredClone(d));
                  setDirty(false);
                }}
              >
                {d.name}
                {d.id === save.activeDeck && <span className="act">★</span>}
              </button>
            ))}
            <button onClick={newDeck}>＋ 新規</button>
          </div>
          <div className="db-name">
            <input
              value={editing.name}
              onChange={(e) => {
                setEditing({ ...editing, name: e.target.value });
                setDirty(true);
              }}
            />
            <span className={`db-count ${editing.cards.length === 60 ? 'ok' : 'ng'}`}>{editing.cards.length}/60</span>
          </div>
          <div className="db-list">
            {groups.map((g) => (
              <div className="db-group" key={g.title}>
                <h4>
                  <span>{g.title}</span>
                  <span>{groupCount(g.ids)}</span>
                </h4>
                {g.ids.map((id) => {
                  const c = card(id);
                  return (
                    <div className="db-row" key={id} onClick={() => remove(id)} onContextMenu={(e) => { e.preventDefault(); setZoom(id); }} title="クリックで1枚減らす／右クリックで拡大">
                      <span className="n">{counts.get(id)}</span>
                      {c.kind === 'monster' && <EnergySymbol type={c.type} size="1.1em" />}
                      {c.kind === 'energy' && <EnergySymbol type={c.energyType} size="1.1em" />}
                      {c.kind === 'trainer' && <Icon name={c.sub === 'supporter' ? 'person' : c.sub === 'stadium' ? 'shield' : 'sparkles'} />}
                      <span className="nm">
                        {c.name}
                        {c.variant ? ` (${c.variant === 'mirror' ? 'ミラー' : c.rarity})` : ''}
                      </span>
                      <span className="rm">－</span>
                    </div>
                  );
                })}
              </div>
            ))}
            {!editing.cards.length && <div className="empty-note">右のカードをクリックして追加しよう</div>}
          </div>
          {errs.length > 0 && <div className="db-errs">{errs.map((e) => <div key={e}>・{e}</div>)}</div>}
          <div className="db-actions">
            <button className="btn small ghost" onClick={autoEnergy} title="残り枠を基本エネルギーで埋める">
              エネルギー自動
            </button>
            <button className="btn small" onClick={() => saveDeck(false)}>
              保存
            </button>
            <button className="btn small blue" disabled={errs.length > 0} onClick={() => saveDeck(true)}>
              保存して使う
            </button>
            <button className="btn small red" onClick={deleteDeck}>
              削除
            </button>
          </div>
        </div>

        <div className="db-right">
          <div className="filters">
            <input placeholder="カード名で検索" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="seg">
              {(['all', 'monster', 'trainer', 'energy'] as Kind[]).map((k) => (
                <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                  {k === 'all' ? 'すべて' : k === 'monster' ? 'モンスター' : k === 'trainer' ? 'トレーナーズ' : 'エネルギー'}
                </button>
              ))}
            </div>
            <div className="type-filter">
              {[...ENERGY_TYPES, 'colorless' as EType].map((t) => (
                <button key={t} className={types.includes(t) ? 'on' : ''} onClick={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}>
                  <EnergySymbol type={t} size="100%" />
                </button>
              ))}
            </div>
            <span style={{ marginLeft: 'auto', color: 'var(--ink-dim)', fontSize: 'calc(var(--u) * 0.9)' }}>クリックで追加 ／ 右クリックで拡大</span>
          </div>
          <div className="col-grid panel">
            {pool.map((c) => {
              const inDeck = counts.get(c.id) ?? 0;
              const own = owned(save, c.id);
              const isBasicE = c.kind === 'energy' && c.basic;
              const maxed = !isBasicE && (inDeck >= own || nameCount(c.name) >= 4);
              return (
                <div
                  key={c.id}
                  className={`col-item ${maxed ? 'maxed' : ''}`}
                  onClick={() => add(c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setZoom(c.id);
                  }}
                >
                  <CardFace cid={c.id} />
                  {inDeck > 0 && <div className="cnt in" style={{ left: -4, right: 'auto' }}>{inDeck}</div>}
                  <div className="cnt">{isBasicE ? '∞' : `×${own}`}</div>
                </div>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {toast && (
            <motion.div className="fx-toast" style={{ top: 'calc(var(--u) * 6)', zIndex: 300 }} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
        {zoom && (
          <div className="zoom-back" onClick={() => setZoom(null)}>
            <motion.div className="zoom-card" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <CardFace cid={zoom} interactive />
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
