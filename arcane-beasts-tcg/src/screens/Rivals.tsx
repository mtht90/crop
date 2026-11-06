// CPU対戦: pick how strong the CPU is (1–9) and what it plays. The story rivals
// (キャラとデッキ) are met in the story only.
import { useEffect, useMemo, useState } from 'react';
import { activeDeck, useStore } from '../state/store';
import { ALL_DECKS, EX_DECKS, STARTER_DECKS, expand, validateDeck, type DeckList, cpuPrintTier, DECK_STRENGTH, upgradeDeck } from '../engine/decks';
import { CPU_LEVELS, type CpuLevel } from '../engine/ai';
import { coinsFor, CPU_FIRST_GEMS, CPU_REWARD, cpuTier } from '../state/progress';
import { artUrl } from '../lib/assets';
import { CardFace, EnergySymbol } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { TopBar } from '../ui/TopBar';
import { foley, playMusic, sfx } from '../audio/audio';

const PORTRAIT: Record<CpuLevel, string> = {
  1: 'humans/peasant',
  2: 'humans/footpad',
  3: 'humans/spearman',
  4: 'humans/knight',
  5: 'humans/paladin',
  6: 'humans/mage-arch',
  7: 'humans/grand-knight',
  8: 'undead/ancient-lich',
  9: 'camp/asheviere',
};
const SCENE: Record<CpuLevel, string> = {
  1: 'story/landscape-hills-01',
  2: 'story/landscape-plain',
  3: 'story/landscape-coast',
  4: 'story/landscape-mountains-03',
  5: 'story/landscape-desert',
  6: 'story/landscape-castle',
  7: 'story/p-lake-castle',
  8: 'story/p-graves',
  9: 'story/p-shrine',
};

/** the decks a level may bring when it picks for itself */
function poolFor(level: number): DeckList[] {
  if (level <= 3) return STARTER_DECKS;
  if (level <= 6) return [...STARTER_DECKS, ...EX_DECKS];
  // the strongest decks (Lv9 only the very top)
  const top = DECK_STRENGTH.slice(0, level >= 9 ? 6 : DECK_STRENGTH.length);
  return ALL_DECKS.filter((d) => top.includes(d.id));
}

export function Rivals() {
  const save = useStore((s) => s.save);
  const startBattle = useStore((s) => s.startBattle);
  const go = useStore((s) => s.go);
  const [level, setLevel] = useState<CpuLevel>(() => {
    const done = save.cpuBeaten ?? [];
    return Math.min(9, (done.length ? Math.max(...done) + 1 : 1)) as CpuLevel;
  });
  /** '' = the CPU chooses (a different deck from its pool each time) */
  const [deckId, setDeckId] = useState('');
  useEffect(() => playMusic('legends'), []);

  const deck = activeDeck(save);
  const errs = deck ? validateDeck(deck.cards) : ['デッキがありません'];
  const info = CPU_LEVELS[level - 1];
  const beaten = save.cpuBeaten ?? [];
  const pool = useMemo(() => poolFor(level), [level]);

  const fight = (spectate = false) => {
    if (!deck || errs.length) return;
    const d = (deckId ? ALL_DECKS.find((x) => x.id === deckId) : undefined) ?? pool[Math.floor(Math.random() * pool.length)];
    sfx('horn-3', 0.7);
    startBattle({
      rival: null,
      playerDeck: deck.cards,
      oppDeck: upgradeDeck(expand(d.cards), cpuPrintTier(level)),
      oppName: `CPU Lv.${level}（${d.name}）`,
      oppPortrait: PORTRAIT[level],
      level: cpuTier(level),
      cpuLevel: level,
      scene: SCENE[level],
      reward: CPU_REWARD[level - 1],
      spectate,
    });
  };

  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl(SCENE[level])})` }} key={SCENE[level]} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="CPU対戦" back="arena" />
        <div className="page-inner rv3 cpu3">
          <button className="box arena3-deck" onClick={() => go('deck')}>
            {deck && <CardFace cid={deck.cover} />}
            <span className="arena3-deck-text">
              <small>使用デッキ</small>
              <b>{deck?.name ?? 'デッキがありません'}</b>
              {errs.length > 0 && <span className="warn">{errs[0]}</span>}
            </span>
            <span className="chip-btn">変更</span>
          </button>

          <h3 className="section-title">CPUのレベル</h3>
          <div className="cpu3-levels">
            {CPU_LEVELS.map((l) => (
              <button key={l.level} className={`cpu3-lv ${level === l.level ? 'on' : ''} lv-${l.level}`} onClick={() => (foley.tick(), setLevel(l.level))}>
                <b>Lv.{l.level}</b>
                <small>{l.name}</small>
                {beaten.includes(l.level) && <span className="cleared">CLEAR</span>}
              </button>
            ))}
          </div>

          <div className="box cpu3-detail">
            <img className="cpu3-por" src={artUrl(PORTRAIT[level])} alt="" />
            <div className="cpu3-info">
              <small>CPU Lv.{level}</small>
              <h2>{info.name}</h2>
              <p>{info.blurb}</p>
              <div className="rv3-meta">
                <span>
                  勝利 <Icon name="gem" /> <b>{coinsFor(CPU_REWARD[level - 1]).toLocaleString()}</b>
                </span>
                {!beaten.includes(level) && (
                  <span>
                    初勝利 <Icon name="gem" /> <b>{CPU_FIRST_GEMS[level - 1]}</b>
                  </span>
                )}
              </div>
            </div>
          </div>

          <h3 className="section-title">相手のデッキ</h3>
          <div className="box rv3-free">
            <div className="db3-chips rv3-decks">
              <button className={`chip-btn ${deckId === '' ? 'on' : ''}`} onClick={() => setDeckId('')}>
                <Icon name="sparkles" /> おまかせ
              </button>
              {ALL_DECKS.map((d) => (
                <button key={d.id} className={`chip-btn ${deckId === d.id ? 'on' : ''}`} onClick={() => setDeckId(d.id)}>
                  <EnergySymbol type={d.type} size="1.1em" /> {d.name}
                </button>
              ))}
            </div>
            <div className="rv3-free-row">
              <span className="set-note cpu3-note">強いレベルほど、考える時間が少し長くなります</span>
              <span className="db3-spacer" />
              <button className="btn small ghost" title="自分のデッキとCPUのデッキで、CPU同士が対戦します" disabled={!!errs.length} onClick={() => fight(true)}>
                CPU同士を観る
              </button>
              <button className="btn blue" disabled={!!errs.length} onClick={() => fight()}>
                <Icon name="swords" /> 対戦する
              </button>
            </div>
          </div>
          <div className="set-note">強敵（キャラとの対戦）は、ストーリーで挑めます。</div>
        </div>
      </div>
    </div>
  );
}
