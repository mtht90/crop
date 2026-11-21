import { useEffect, useState } from 'preact/hooks';
import { game } from '../../game/store';
import { ALLY_BY_ID, ELEMENT_INFO } from '../../data/monsters';
import { EQUIP_BY_ID, SKILL_BY_ID, SLOT_LABEL } from '../../data/items';
import { GACHA_COST, PITY, gachaLevel, gachaNextLv, gachaRates, type Banner } from '../../game/core';
import * as L from '../../game/logic';
import { sfx } from '../../game/audio';
import { GEN, itemUrl, spriteUrl } from '../../render/sprites';
import { Bar, Btn, Card, RARITY_NAME, useGame } from '../common';
import { ElIcon, EquipIcon, Gem, SkillIcon, Stars } from '../icons';

const BANNERS: { key: Banner; name: string; sub: string; card: string; art: () => any }[] = [
  {
    key: 'char',
    name: '霊獣召喚',
    sub: '出撃させる霊獣を呼び出す',
    card: 'purple',
    art: () => (
      <>
        <img src={spriteUrl('Boss Goddess Innova')} />
        <img src={spriteUrl('Summon Shiva')} />
      </>
    ),
  },
  {
    key: 'equip',
    name: '武具召喚',
    sub: '武器・防具・装飾を手に入れる',
    card: 'gold',
    art: () => (
      <div class="row" style={{ gap: '0', paddingBottom: '20px', paddingRight: '18px' }}>
        <EquipIcon shape="sword:mythic" size={84} />
        <EquipIcon shape="shield:gold" size={64} />
      </div>
    ),
  },
  {
    key: 'skill',
    name: '秘術召喚',
    sub: '自動で放つ秘術を覚える',
    card: 'teal',
    art: () => (
      <div class="row" style={{ gap: '0', paddingBottom: '20px', paddingRight: '18px' }}>
        <SkillIcon kind="meteor" el="fire" size={80} />
        <SkillIcon kind="bolt" el="light" size={62} />
      </div>
    ),
  },
];

export function GachaTab() {
  const s = useGame(4);
  const [result, setResult] = useState<{ banner: Banner; pulls: L.Pull[] } | null>(null);

  const doPull = (b: Banner, n: 1 | 10) => {
    const res = game.act((sv) => L.pull(sv, b, n, Math.random));
    if (!res) {
      game.toast('霊晶が足りない', 'warn');
      return;
    }
    setResult({ banner: b, pulls: res });
  };

  return (
    <div class="col">
      <div class="hint" style={{ margin: '0 6px' }}>
        霊晶はボス初撃破・任務・霊脈の恵み・討伐でまれに手に入る。引くほど召喚レベルが上がり、高レア度が出やすくなる。
      </div>
      {BANNERS.map((b) => {
        const st = s.gacha[b.key];
        const lv = gachaLevel(st.pulls);
        const next = gachaNextLv(st.pulls);
        const rates = gachaRates(st.pulls);
        const cost = GACHA_COST[b.key];
        return (
          <div class={`banner-card card card-${b.card}`} style={{ marginTop: '22px' }}>
            <div class="banner-head">{b.name}</div>
            <div class="banner-art">{b.art()}</div>
            <div class="banner-text">
              <div style={{ fontSize: '12px', fontWeight: 700 }}>{b.sub}</div>
              <div class="rates" style={{ marginTop: '6px' }}>
                <span>召喚Lv{lv}</span>
                {[5, 4, 3].map((r) => (
                  <span>
                    {RARITY_NAME[r]} {(rates[r] * 100).toFixed(1)}%
                  </span>
                ))}
              </div>
              <div style={{ width: '92%', marginTop: '4px' }}>
                {next ? <Bar value={st.pulls} max={next} label={`次のLvまで ${next - st.pulls}`} /> : <Bar value={1} max={1} label="召喚Lv MAX" />}
              </div>
              <div style={{ fontSize: '11px', marginTop: '3px' }}>
                あと {PITY[b.key] - st.pity} 回以内に UR 確定
              </div>
            </div>
            <div class="row" style={{ position: 'relative', marginTop: '8px' }}>
              <Btn color="white" onClick={() => doPull(b.key, 1)} disabled={s.gems < cost.one}>
                1回 <Gem size={18} /> {cost.one}
              </Btn>
              <Btn color="gold" onClick={() => doPull(b.key, 10)} disabled={s.gems < cost.ten}>
                10回 <Gem size={18} /> {cost.ten}
              </Btn>
            </div>
          </div>
        );
      })}
      {result && (
        <PullStage
          {...result}
          onAgain={() => {
            const b = result.banner;
            setResult(null);
            setTimeout(() => doPull(b, 10), 50);
          }}
          onClose={() => setResult(null)}
        />
      )}
    </div>
  );
}

function PullStage({ banner, pulls, onClose, onAgain }: { banner: Banner; pulls: L.Pull[]; onClose: () => void; onAgain: () => void }) {
  const [shown, setShown] = useState(false);
  const top = Math.max(...pulls.map((p) => p.rarity));
  // orb tint per best rarity (hue shift of the orb image) and the reveal effect sheet
  const hue = top >= 5 ? 200 : top >= 4 ? 0 : top >= 3 ? -60 : -150;
  const burst = top >= 5 ? 'crit' : top >= 4 ? 'spark' : 'puff';
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 1150);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!shown) return;
    pulls.forEach((p, i) => setTimeout(() => sfx.gacha(p.rarity), i * 70));
  }, [shown]);
  const canAgain = game.save.gems >= GACHA_COST[banner].ten;
  return (
    <div class="pull-stage" onClick={() => !shown && setShown(true)}>
      {!shown ? (
        <img class="pull-orb" src={itemUrl('orb')} style={{ filter: `hue-rotate(${hue}deg)` }} alt="" />
      ) : (
        <>
          <div class="pull-burst" style={{ backgroundImage: `url(${GEN}fx/${burst}.webp)` }} />
          <div class={`pull-grid ${pulls.length === 1 ? 'one' : ''}`}>
            {pulls.map((p, i) => (
              <div class={`pull-item r${p.rarity}`} style={{ animationDelay: i * 0.07 + 's' }}>
                {p.rarity >= 4 && <div class="pi-fx" style={{ backgroundImage: `url(${GEN}fx/${p.rarity >= 5 ? 'crit' : 'spark'}.webp)` }} />}
                <PullCard p={p} />
              </div>
            ))}
          </div>
          <div class="pull-actions">
            <Btn color="white" onClick={onClose}>
              とじる
            </Btn>
            <Btn color="gold" disabled={!canAgain} onClick={onAgain}>
              もう10回 <Gem size={18} /> {GACHA_COST[banner].ten}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

function PullCard({ p }: { p: L.Pull }) {
  let art: any;
  let name = '';
  let head: any = null;
  if (p.banner === 'char') {
    const a = ALLY_BY_ID[p.id];
    art = <img src={spriteUrl(a.sprite)} />;
    name = a.name;
    head = <ElIcon el={a.el} size={14} />;
  } else if (p.banner === 'equip') {
    const d = EQUIP_BY_ID[p.id];
    art = <EquipIcon shape={d.icon} size={58} />;
    name = d.name;
    head = <span>{SLOT_LABEL[d.slot]}</span>;
  } else {
    const d = SKILL_BY_ID[p.id];
    art = <SkillIcon kind={d.kind} el={d.el} size={58} />;
    name = d.name;
    head = <span>{ELEMENT_INFO[d.el].name}</span>;
  }
  return (
    <Card rarity={p.rarity} class="char-card small">
      <div class="cc-head">
        {head}
        <span>{RARITY_NAME[p.rarity]}</span>
      </div>
      <div class="pi-art">{art}</div>
      <div class="pi-name">{name}</div>
      <Stars n={p.rarity} size={9} />
      {p.isNew && <span class="pi-new dot">NEW</span>}
      {p.upgraded && <div class="pi-up">{p.upgraded}</div>}
    </Card>
  );
}
