import { useState } from 'preact/hooks';
import { game } from '../../game/store';
import { ALLIES, ALLY_BY_ID, ELEMENT_INFO, ROLE_INFO, elementFactor } from '../../data/monsters';
import { areaDef, copiesForStar, fmt, heroStats, skillSlotsFor } from '../../game/core';
import * as L from '../../game/logic';
import { AllyInfoLine, Bar, Btn, CharCard, Modal, Portrait, useGame } from '../common';
import { Arrow, ElIcon, Stars, TabIcon } from '../icons';

export function CharsTab() {
  const s = useGame(3);
  const [detail, setDetail] = useState<string | null>(null);
  const owned = ALLIES.filter((a) => s.chars[a.id]).sort((a, b) => b.rarity - a.rarity || heroStats(s, b.id).power - heroStats(s, a.id).power);
  const best = L.bestCharFor(s);
  const area = areaDef(s.g);
  const els = [...new Set(area.mobs.map((m) => m.el))];

  return (
    <div class="col">
      <div class="sec-title">
        <TabIcon name="chars" size={26} />
        <span class="grow">
          霊獣 {owned.length}/{ALLIES.length}
        </span>
        {best !== s.active && (
          <Btn
            size="sm"
            color="green"
            onClick={() => {
              game.act((sv) => (sv.active = best));
              game.toast(`${ALLY_BY_ID[best].name} を出撃させた`, 'good');
            }}
          >
            おすすめ出撃
          </Btn>
        )}
      </div>
      <div class="hint" style={{ margin: '-4px 6px 0' }}>
        このエリアの敵の属性：
        {els.map((e) => (
          <span style={{ marginRight: '6px' }}>
            <ElIcon el={e} size={14} /> {ELEMENT_INFO[e].name}
          </span>
        ))}
        <br />
        相性：
        {(['fire', 'wind', 'earth', 'water', 'fire'] as const).map((e, i) => (
          <>
            {i > 0 && <Arrow size={9} />}
            <ElIcon el={e} size={14} />
          </>
        ))}
        {'　'}
        <ElIcon el="light" size={14} />
        <Arrow size={9} dir="left" />
        <Arrow size={9} />
        <ElIcon el="dark" size={14} />
      </div>
      <div class="grid">
        {owned.map((a) => {
          const own = s.chars[a.id];
          return (
            <CharCard
              id={a.id}
              selected={s.active === a.id}
              onClick={() => setDetail(a.id)}
              badge={s.active === a.id ? <span class="chip gold">出撃中</span> : undefined}
              footer={
                <div style={{ marginTop: '1px' }}>
                  <Stars n={own.stars} size={10} />
                </div>
              }
            />
          );
        })}
      </div>
      {owned.length < 3 && <div class="empty">「召喚」タブで新しい霊獣を呼び出そう</div>}
      {detail && <CharDetail id={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function CharDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useGame(3);
  const a = ALLY_BY_ID[id];
  const own = s.chars[id];
  const cur = game.hero;
  const h = heroStats(s, id);
  const area = areaDef(s.g);
  const avgEl = area.mobs.reduce((x, m) => x + elementFactor(a.el, m.el), 0) / area.mobs.length;
  const cmp = (x: number, y: number) => (x > y * 1.001 ? 'cmp-up' : x < y * 0.999 ? 'cmp-down' : '');
  const need = own.stars < 5 ? copiesForStar(own.stars) : 0;
  return (
    <Modal title={`${a.title} ${a.name}`} onClose={onClose}>
      <div class="col">
        <div class="row" style={{ alignItems: 'flex-end' }}>
          <div class="slot" style={{ width: '130px' }}>
            <Portrait ally={a} size={110} />
          </div>
          <div class="grow col" style={{ gap: '6px' }}>
            <AllyInfoLine ally={a} />
            <div class="hint">{ROLE_INFO[a.role].desc}</div>
            <div class="hint">秘術スロット：{skillSlotsFor(a.rarity)}</div>
            <div class="hint">
              このエリアとの相性：
              <b class={avgEl > 1.05 ? 'cmp-up' : avgEl < 0.95 ? 'cmp-down' : ''}>{avgEl > 1.05 ? '有利' : avgEl < 0.95 ? '不利' : '普通'}</b>
            </div>
          </div>
        </div>
        <div class="stat-grid">
          <div>
            <span>攻撃力</span>
            <b class={cmp(h.atk, cur.atk)}>{fmt(h.atk)}</b>
          </div>
          <div>
            <span>体力</span>
            <b class={cmp(h.hp, cur.hp)}>{fmt(h.hp)}</b>
          </div>
          <div>
            <span>攻撃間隔</span>
            <b class={cmp(cur.interval, h.interval)}>{h.interval.toFixed(2)}秒</b>
          </div>
          <div>
            <span>戦力</span>
            <b class={cmp(h.power, cur.power)}>{fmt(h.power)}</b>
          </div>
        </div>
        <div>
          <div class="row" style={{ justifyContent: 'space-between', fontSize: '13px', fontWeight: 800 }}>
            <span>
              覚醒 <Stars n={own.stars} size={13} />
            </span>
            <span class="muted">{own.stars < 5 ? `同じ霊獣 ${own.copies}/${need}` : '最大覚醒'}</span>
          </div>
          {own.stars < 5 && <Bar value={own.copies} max={need} />}
          <div class="hint">覚醒1段階ごとに能力 +20%</div>
        </div>
        {s.active === id ? (
          <Btn color="gray" disabled>
            出撃中
          </Btn>
        ) : (
          <Btn
            color="green"
            size="lg"
            onClick={() => {
              game.act((sv) => (sv.active = id));
              onClose();
            }}
          >
            出撃させる
          </Btn>
        )}
      </div>
    </Modal>
  );
}
