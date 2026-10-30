// デッキ: your decks, ready-made おすすめデッキ, ace auto-build, and the editor
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_CARDS, byName, card, ENERGIES, MODEL_NAME, modelOf, TYPE_JP } from '../engine/cards';
import { ALL_DECKS, validateDeck } from '../engine/decks';
import { fromRecipe } from '../engine/autodeck';
import type { CardDef, EType } from '../engine/types';
import { ENERGY_TYPES } from '../engine/types';
import { owned, useStore, type SavedDeck } from '../state/store';
import { artUrl } from '../lib/assets';
import { CardFace, EnergySymbol } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { TopBar } from '../ui/TopBar';
import { foley, playMusic, sfx } from '../audio/audio';
import { askConfirm } from '../ui/Confirm';
import { AutoDeckModal } from './AutoDeck';

type Kind = 'all' | 'monster' | 'trainer' | 'energy';
type ListTab = 'mine' | 'recipes';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function sortKey(c: CardDef) {
  const k = c.kind === 'monster' ? 0 : c.kind === 'trainer' ? 1 : 2;
  return k * 1000 + c.no;
}

/** the strongest monster in a deck, for its box art */
function coverOf(cards: string[], fallback = '') {
  const mons = cards.map(card).filter((c) => c.kind === 'monster');
  mons.sort((a, b) => b.rarity - a.rarity);
  return mons[0]?.id ?? fallback;
}

/** tap = action, long press (or right click) = zoom */
function usePress(onTap: () => void, onLong: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const long = useRef(false);
  return {
    onPointerDown: () => {
      long.current = false;
      timer.current = window.setTimeout(() => {
        long.current = true;
        onLong();
      }, 450);
    },
    onPointerUp: () => clearTimeout(timer.current),
    onPointerLeave: () => clearTimeout(timer.current),
    onPointerCancel: () => clearTimeout(timer.current),
    onClick: () => {
      if (!long.current) onTap();
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clearTimeout(timer.current);
      onLong();
    },
  };
}

export function DeckBuilder() {
  const save = useStore((s) => s.save);
  const update = useStore((s) => s.update);
  useEffect(() => playMusic('menu'), []);
  const [editing, setEditing] = useState<SavedDeck | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<ListTab>('mine');
  const [auto, setAuto] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(''), 1800);
  };

  const store = (d: SavedDeck, activate: boolean) =>
    update((s) => {
      const i = s.decks.findIndex((x) => x.id === d.id);
      const deck = { ...d, cover: coverOf(d.cards, d.cover) };
      if (i >= 0) s.decks[i] = deck;
      else s.decks.push(deck);
      if (activate || !s.activeDeck) s.activeDeck = deck.id;
    });

  const useDeck = (d: SavedDeck) => {
    if (validateDeck(d.cards).length) return flash('このデッキはまだ完成していません');
    sfx('fanfare-short', 0.5);
    update((s) => void (s.activeDeck = d.id));
    flash(`「${d.name}」を使用デッキにしました`);
  };

  const recipes = useMemo(
    () => ALL_DECKS.map((r) => ({ r, d: fromRecipe(r, (cid) => owned(save, cid)) })).sort((a, b) => b.d.have - a.d.have),
    [save], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const useRecipe = (r: (typeof recipes)[number]) => {
    if (validateDeck(r.d.cards).length) return flash('カードが足りずにこのデッキは組めません');
    const d: SavedDeck = { id: `rec-${r.r.id}`, name: r.r.name, cards: r.d.cards, cover: coverOf(r.d.cards) };
    store(d, true);
    sfx('fanfare-short', 0.5);
    flash(`「${r.r.name}」を使用デッキにしました`);
  };

  const newDeck = () => {
    setEditing({ id: `deck-${Date.now()}`, name: `デッキ${save.decks.length + 1}`, cards: [], cover: '' });
    setDirty(true);
  };

  if (editing)
    return (
      <Editor
        deck={editing}
        dirty={dirty}
        onChange={(d) => {
          setEditing(d);
          setDirty(true);
        }}
        onSave={(activate) => {
          store(editing, activate);
          sfx('fanfare-short', 0.5);
          setDirty(false);
          flash(activate ? '保存して使用デッキにしました' : '保存しました');
        }}
        onClose={async () => {
          if (dirty && !(await askConfirm('保存していない変更があります。破棄して戻りますか？', '破棄する', true))) return;
          setEditing(null);
          setDirty(false);
        }}
        onDelete={async () => {
          const isSaved = save.decks.some((d) => d.id === editing.id);
          if (isSaved && save.decks.length <= 1) return flash('最後のデッキは削除できません');
          if (!(await askConfirm(`「${editing.name}」を削除しますか？`, '削除する', true))) return;
          update((s) => {
            s.decks = s.decks.filter((d) => d.id !== editing.id);
            if (s.activeDeck === editing.id) s.activeDeck = s.decks[0]?.id ?? '';
          });
          setEditing(null);
          setDirty(false);
        }}
        toast={toast}
        flash={flash}
      />
    );

  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/grim-altar')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="デッキ" />
        <div className="page-inner db3">
          <div className="db3-quick">
            <button className="box db3-quick-btn gold" onClick={() => (sfx('expand', 0.5), setAuto(true))}>
              <Icon name="sparkles" />
              <span>
                <b>エースから自動で組む</b>
                <small>好きなモンスターを選ぶだけ</small>
              </span>
            </button>
            <button className="box db3-quick-btn" onClick={newDeck}>
              <Icon name="deck" />
              <span>
                <b>自分で組む</b>
                <small>空のデッキから編集</small>
              </span>
            </button>
          </div>

          <div className="ms3-tabs">
            <button className={`chip-btn ${tab === 'mine' ? 'on' : ''}`} onClick={() => (foley.tick(), setTab('mine'))}>
              <Icon name="deck" /> マイデッキ {save.decks.length}
            </button>
            <button className={`chip-btn ${tab === 'recipes' ? 'on' : ''}`} onClick={() => (foley.tick(), setTab('recipes'))}>
              <Icon name="book" /> おすすめデッキ
            </button>
          </div>

          {tab === 'mine' ? (
            <div className="db3-grid">
              {save.decks.map((d, i) => {
                const errs = validateDeck(d.cards);
                const active = d.id === save.activeDeck;
                const c = d.cover ? card(d.cover) : null;
                return (
                  <motion.div key={d.id} className={`box db3-deck ${active ? 'active' : ''}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.4, ease: EASE_OUT }}>
                    <div className="db3-deck-art" onClick={() => setEditing(structuredClone(d))}>
                      {d.cover && <CardFace cid={d.cover} />}
                    </div>
                    <div className="db3-deck-info">
                      <b>{d.name}</b>
                      <small>
                        {c?.kind === 'monster' && <EnergySymbol type={c.type} size="1.1em" />} {d.cards.length}/60枚
                        {errs.length > 0 && <span className="warn"> ・未完成</span>}
                      </small>
                      <div className="db3-deck-btns">
                        {active ? (
                          <span className="db3-active">
                            <Icon name="check" /> 使用中
                          </span>
                        ) : (
                          <button className="btn small blue" disabled={errs.length > 0} onClick={() => useDeck(d)}>
                            使う
                          </button>
                        )}
                        <button className="btn small ghost" onClick={() => setEditing(structuredClone(d))}>
                          編集
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {!save.decks.length && <div className="empty-note">デッキがありません。おすすめデッキか自動編成ですぐ作れます</div>}
            </div>
          ) : (
            <div className="db3-grid">
              {recipes.map((x, i) => {
                const cover = byName(x.r.cover);
                const saved = save.decks.find((d) => d.id === `rec-${x.r.id}`);
                const active = saved && saved.id === save.activeDeck;
                const legal = !validateDeck(x.d.cards).length;
                return (
                  <motion.div key={x.r.id} className="box db3-deck recipe" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.4, ease: EASE_OUT }}>
                    <div className="db3-deck-art" onClick={() => setZoom(cover.id)}>
                      <CardFace cid={cover.id} />
                    </div>
                    <div className="db3-deck-info">
                      <b>{x.r.name}</b>
                      <small>
                        <EnergySymbol type={x.r.type} size="1.1em" /> {TYPE_JP[x.r.type]}・{x.r.cover}
                      </small>
                      <p>{x.r.description}</p>
                      <div className="db3-have">
                        <div className="ms3-bar">
                          <div style={{ transform: `scaleX(${x.d.have / 100})` }} />
                        </div>
                        <span>所持 {x.d.have}%</span>
                      </div>
                      {legal && x.d.have < 100 && <small className="lb-dim">足りないカードは手持ちの近いカードで補います</small>}
                      <div className="db3-deck-btns">
                        {active ? (
                          <span className="db3-active">
                            <Icon name="check" /> 使用中
                          </span>
                        ) : (
                          <button className="btn small blue" disabled={!legal} onClick={() => useRecipe(x)}>
                            {legal ? 'このデッキを使う' : 'カードが足りません'}
                          </button>
                        )}
                        <button
                          className="btn small ghost"
                          onClick={() => {
                            setEditing({ id: `deck-${Date.now()}`, name: x.r.name, cards: x.d.cards, cover: coverOf(x.d.cards) });
                            setDirty(true);
                          }}
                        >
                          コピーして編集
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {auto && (
          <AutoDeckModal
            onClose={() => setAuto(false)}
            onBuild={(d, mode) => {
              const deck: SavedDeck = { id: `deck-${Date.now()}`, name: `${d.ace}デッキ`, cards: d.cards, cover: d.cards.find((id) => card(id).name === d.ace) ?? d.cards[0] };
              setAuto(false);
              if (mode === 'new') {
                store(deck, true);
                sfx('fanfare-short', 0.5);
                setTab('mine');
                flash(`「${deck.name}」を作って使用デッキにしました`);
              } else {
                setEditing(deck);
                setDirty(true);
              }
            }}
          />
        )}
      </AnimatePresence>
      <Toast text={toast} />
      <Zoom cid={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div className="db3-toast" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Zoom({ cid, onClose }: { cid: string | null; onClose: () => void }) {
  if (!cid) return null;
  return (
    <div className="zoom-back db3-zoom" onClick={onClose}>
      <motion.div className="zoom-card" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <CardFace cid={cid} interactive />
      </motion.div>
    </div>
  );
}

// ------------------------------------------------------------------- editor
function Editor({
  deck,
  dirty,
  onChange,
  onSave,
  onClose,
  onDelete,
  toast,
  flash,
}: {
  deck: SavedDeck;
  dirty: boolean;
  onChange: (d: SavedDeck) => void;
  onSave: (activate: boolean) => void;
  onClose: () => void;
  onDelete: () => void;
  toast: string;
  flash: (t: string) => void;
}) {
  const save = useStore((s) => s.save);
  const [pane, setPane] = useState<'deck' | 'cards'>(deck.cards.length ? 'deck' : 'cards');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [types, setTypes] = useState<EType[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);

  const errs = validateDeck(deck.cards);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of deck.cards) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [deck.cards]);
  const nameCount = (name: string) => deck.cards.filter((id) => card(id).name === name).length;

  const pool = ALL_CARDS.filter((c) => owned(save, c.id) > 0)
    .filter((c) => kind === 'all' || c.kind === kind)
    .filter((c) => !types.length || (c.kind === 'monster' && types.includes(c.type)) || (c.kind === 'energy' && types.includes(c.energyType)))
    .filter((c) => !q || c.name.includes(q))
    .sort((a, b) => sortKey(a) - sortKey(b));

  const canAdd = (c: CardDef): string | null => {
    const isBasicE = c.kind === 'energy' && c.basic;
    if (deck.cards.length >= 60) return 'デッキは60枚までです';
    if (!isBasicE && nameCount(c.name) >= 4) return '同じ名前のカードは4枚までです';
    if (!isBasicE && (counts.get(c.id) ?? 0) >= owned(save, c.id)) return '所持枚数が足りません';
    return null;
  };
  const add = (c: CardDef) => {
    const why = canAdd(c);
    if (why) return flash(why);
    foley.place();
    onChange({ ...deck, cards: [...deck.cards, c.id], cover: deck.cover || c.id });
  };
  const remove = (id: string) => {
    const i = deck.cards.lastIndexOf(id);
    if (i < 0) return;
    foley.slide();
    const cards = [...deck.cards];
    cards.splice(i, 1);
    onChange({ ...deck, cards });
  };

  const autoEnergy = () => {
    const nonBasicE = deck.cards.filter((id) => {
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
    onChange({ ...deck, cards: [...nonBasicE, ...out] });
    flash('残りを基本エネルギーで埋めました');
  };

  const groups: { title: string; ids: string[] }[] = [
    { title: 'モンスター', ids: [] },
    { title: 'トレーナーズ', ids: [] },
    { title: 'エネルギー', ids: [] },
  ];
  const uniq = [...new Set(deck.cards)].sort((a, b) => sortKey(card(a)) - sortKey(card(b)));
  for (const id of uniq) {
    const c = card(id);
    groups[c.kind === 'monster' ? 0 : c.kind === 'trainer' ? 1 : 2].ids.push(id);
  }
  const groupCount = (ids: string[]) => ids.reduce((n, id) => n + (counts.get(id) ?? 0), 0);

  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/grim-altar')})` }} />
      <div className="page-shade" />
      <div className="page db3-edit">
        <header className="page-head db3-head">
          <button className="back-btn" title="もどる" onClick={onClose}>
            <Icon name="back" />
          </button>
          <input className="db3-name" value={deck.name} maxLength={16} onChange={(e) => onChange({ ...deck, name: e.target.value })} />
          <span className={`db3-count ${deck.cards.length === 60 ? 'ok' : ''}`}>{deck.cards.length}/60</span>
        </header>

        <div className="db3-seg">
          <button className={pane === 'deck' ? 'on' : ''} onClick={() => setPane('deck')}>
            デッキ <i>{deck.cards.length}</i>
          </button>
          <button className={pane === 'cards' ? 'on' : ''} onClick={() => setPane('cards')}>
            カードを追加
          </button>
        </div>

        <div className="db3-panes" data-pane={pane}>
          {/* the deck */}
          <section className="box db3-list">
            {groups.map((g) =>
              g.ids.length ? (
                <div className="db3-group" key={g.title}>
                  <h4>
                    <span>{g.title}</span>
                    <span>{groupCount(g.ids)}</span>
                  </h4>
                  {g.ids.map((id) => (
                    <DeckRow key={id} id={id} n={counts.get(id) ?? 0} addOk={!canAdd(card(id))} onAdd={() => add(card(id))} onRemove={() => remove(id)} onZoom={() => setZoom(id)} />
                  ))}
                </div>
              ) : null,
            )}
            {!deck.cards.length && (
              <div className="empty-note">
                カードをタップしてデッキに入れよう
                <br />
                <small>長押しでカードを拡大できます</small>
              </div>
            )}
            {errs.length > 0 && deck.cards.length > 0 && (
              <div className="db3-errs">
                {errs.map((e) => (
                  <div key={e}>・{e}</div>
                ))}
              </div>
            )}
          </section>

          {/* the collection */}
          <section className="db3-pool">
            <div className="db3-filters">
              <input placeholder="カード名で検索" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="db3-chips">
                {(['all', 'monster', 'trainer', 'energy'] as Kind[]).map((k) => (
                  <button key={k} className={`chip-btn ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                    {k === 'all' ? 'すべて' : k === 'monster' ? 'モンスター' : k === 'trainer' ? 'トレーナーズ' : 'エネルギー'}
                  </button>
                ))}
              </div>
              <div className="db3-types">
                {[...ENERGY_TYPES, 'colorless' as EType].map((t) => (
                  <button key={t} className={types.includes(t) ? 'on' : ''} title={TYPE_JP[t]} onClick={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}>
                    <EnergySymbol type={t} size="100%" />
                  </button>
                ))}
              </div>
            </div>
            <div className="db3-cards">
              {pool.map((c) => (
                <PoolCard key={c.id} c={c} inDeck={counts.get(c.id) ?? 0} own={owned(save, c.id)} blocked={!!canAdd(c)} onAdd={() => add(c)} onZoom={() => setZoom(c.id)} />
              ))}
              {!pool.length && <div className="empty-note">条件に合うカードがありません</div>}
            </div>
          </section>
        </div>

        <footer className="db3-actions">
          <button className="btn small ghost" onClick={autoEnergy} title="残り枠を基本エネルギーで埋める">
            エネルギー自動
          </button>
          <button className="btn small red" onClick={onDelete} title="削除">
            <Icon name="trash" />
          </button>
          <span className="db3-spacer" />
          <button className="btn small" disabled={!dirty} onClick={() => onSave(false)}>
            保存
          </button>
          <button className="btn small blue" disabled={errs.length > 0} onClick={() => onSave(true)}>
            保存して使う
          </button>
        </footer>
      </div>
      <Toast text={toast} />
      <Zoom cid={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

function DeckRow({ id, n, addOk, onAdd, onRemove, onZoom }: { id: string; n: number; addOk: boolean; onAdd: () => void; onRemove: () => void; onZoom: () => void }) {
  const c = card(id);
  return (
    <div className="db3-row">
      <span className="nm" onClick={onZoom}>
        {c.kind === 'monster' && <EnergySymbol type={c.type} size="1.05em" />}
        {c.kind === 'energy' && <EnergySymbol type={c.energyType} size="1.05em" />}
        {c.kind === 'trainer' && <Icon name={c.sub === 'supporter' ? 'person' : c.sub === 'stadium' ? 'shield' : 'sparkles'} />}
        <b>{c.name}</b>
        {c.variant && <small>{MODEL_NAME[modelOf(c)!]}</small>}
        {c.kind === 'monster' && c.rarity >= 4 && <i className={`db3-star r-${c.rarity}`}>{'★'.repeat(c.rarity)}</i>}
      </span>
      <button className="db3-step" onClick={onRemove} title="1枚へらす">
        −
      </button>
      <span className="n">{n}</span>
      <button className="db3-step" disabled={!addOk} onClick={onAdd} title="1枚ふやす">
        ＋
      </button>
    </div>
  );
}

function PoolCard({ c, inDeck, own, blocked, onAdd, onZoom }: { c: CardDef; inDeck: number; own: number; blocked: boolean; onAdd: () => void; onZoom: () => void }) {
  const press = usePress(onAdd, onZoom);
  const isBasicE = c.kind === 'energy' && c.basic;
  return (
    <div className={`db3-card ${blocked ? 'maxed' : ''}`} {...press}>
      <CardFace cid={c.id} />
      {inDeck > 0 && <div className="cnt in">{inDeck}</div>}
      <div className="cnt">{isBasicE ? '∞' : `×${own}`}</div>
    </div>
  );
}
