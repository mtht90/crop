// ワードローブ: card sleeves, battle mats and titles, bought with coins. Looks only.
import { useEffect, useState } from 'react';
import { artUrl } from '../lib/assets';
import { foley, playMusic, sfx } from '../audio/audio';
import { MATS, SLEEVES, TITLES, type Cosmetic, type CosmeticKind } from '../state/cosmetics';
import { useStore } from '../state/store';
import { CardBack } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { TopBar } from '../ui/TopBar';

const TABS: { id: CosmeticKind; label: string; list: Cosmetic[] }[] = [
  { id: 'sleeve', label: 'カード裏面', list: SLEEVES },
  { id: 'mat', label: 'バトルの背景', list: MATS },
  { id: 'title', label: '称号', list: TITLES },
];

export function Wardrobe() {
  const save = useStore((s) => s.save);
  const buy = useStore((s) => s.buyCosmetic);
  const equip = useStore((s) => s.equipCosmetic);
  const [tab, setTab] = useState<CosmeticKind>('sleeve');
  const [msg, setMsg] = useState('');
  useEffect(() => playMusic('shop'), []);
  const w = save.wardrobe;
  const cur = TABS.find((t) => t.id === tab)!;

  const act = (c: Cosmetic) => {
    if (w[c.kind] === c.id) return;
    if (w.owned.includes(c.id)) {
      equip(c.id);
      sfx('select', 0.5);
      setMsg(`「${c.name}」に変えました`);
    } else if (buy(c.id)) {
      sfx('gold', 0.6);
      foley.chime(6);
      setMsg(`「${c.name}」を手に入れました`);
    } else {
      sfx('miss-2', 0.5);
      setMsg('コインが足りません。バトルやミッションで集めましょう');
    }
  };

  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/p-study')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="ワードローブ" back="more" />
        <div className="page-inner wd">
          <div className="ms3-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`chip-btn ${tab === t.id ? 'on' : ''}`} onClick={() => (foley.tick(), setTab(t.id), setMsg(''))}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="set-note wd-note">見た目だけの報酬です。強さには関係しません。{msg && <b className="wd-msg"> {msg}</b>}</div>
          <div className={`wd-grid wd-tab-${tab}`}>
            {cur.list.map((c) => {
              const owned = w.owned.includes(c.id);
              const on = w[c.kind] === c.id;
              return (
                <button key={c.id} className={`box wd-item ${on ? 'on' : ''} ${owned ? 'owned' : ''}`} onClick={() => act(c)}>
                  <div className="wd-thumb">
                    {c.kind === 'sleeve' && (
                      <div className="wd-sleeve" style={{ ['--back-filter' as string]: c.filter ?? 'none' }}>
                        <CardBack />
                      </div>
                    )}
                    {c.kind === 'mat' && <div className="wd-mat" style={{ backgroundImage: c.art ? `url(${artUrl(c.art)})` : undefined }}>{!c.art && 'AUTO'}</div>}
                    {c.kind === 'title' && <div className="wd-title">{c.id === 'title-none' ? '—' : c.name}</div>}
                  </div>
                  <b>{c.name}</b>
                  <small>
                    {on ? 'つかっている' : owned ? 'えらぶ' : (
                      <>
                        <Icon name="coin" /> {c.price.toLocaleString()}
                      </>
                    )}
                  </small>
                  {c.note && <em>{c.note}</em>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
