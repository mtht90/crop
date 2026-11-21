import { useState } from 'preact/hooks';
import { game } from '../../game/store';
import { ALLIES, ALLY_BY_ID, ELEMENT_INFO } from '../../data/monsters';
import { GUARD_EFFECT, GUARD_MAX_RANK, GUARD_SLOT_UNLOCK, bonusTotals, guardianSlotsUnlocked, guardianValue, parseGuardianKey, stageLabel } from '../../game/core';
import * as L from '../../game/logic';
import { sfx } from '../../game/audio';
import { AllyInfoLine, Bar, Btn, Card, Modal, Panel, Portrait, RARITY_NAME, useGame } from '../common';
import { Arrow, ElIcon, Orb, StarIcon, TabIcon } from '../icons';

function effectText(key: string) {
  const s = game.save;
  const { id, shiny } = parseGuardianKey(key);
  const d = ALLY_BY_ID[id];
  const g = s.guardians[key];
  const v = guardianValue(d, g.rank, shiny);
  return `${GUARD_EFFECT[d.el].label} +${(v * 100).toFixed(1)}%`;
}

export function GuardiansTab() {
  const s = useGame(3);
  const [opened, setOpened] = useState<ReturnType<typeof L.openOrbs> | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const n = guardianSlotsUnlocked(s.maxG);
  const b = bonusTotals(s);
  const keys = Object.keys(s.guardians).sort((a, c) => L.guardianScore(s, c) - L.guardianScore(s, a));

  return (
    <div class="col">
      <Panel kind="blue">
        <div class="row">
          <Orb size={46} />
          <div class="grow">
            <div style={{ fontWeight: 800, fontSize: '16px' }}>霊珠 × {s.orbs}</div>
            <div style={{ fontSize: '12px', opacity: 0.95 }}>討伐した魔物がまれに落とす。ひらくと味方の霊獣が守護霊として宿る。</div>
          </div>
          <Btn
            color="purple"
            disabled={s.orbs <= 0}
            onClick={() => {
              const got = game.act((sv) => L.openOrbs(sv, Math.random));
              if (got.length) {
                sfx.orb();
                setOpened(got);
              }
            }}
          >
            ひらく
          </Btn>
        </div>
      </Panel>

      <div class="sec-title">
        <TabIcon name="guardian" size={26} />
        <span class="grow">
          守護霊の枠 {s.guardianSlots.slice(0, n).filter(Boolean).length}/{n}
        </span>
        <Btn
          size="sm"
          color="blue"
          onClick={() => {
            game.act((sv) => L.autoGuardians(sv));
            game.toast('守護霊をおまかせで配置した', 'good');
          }}
        >
          おまかせ
        </Btn>
      </div>
      <div class="grid small" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        {s.guardianSlots.map((k, i) => {
          if (i >= n)
            return (
              <Card rarity={0} class="char-card small lock-slot">
                <div class="cc-head">
                  <span>枠{i + 1}</span>
                </div>
                <div style={{ height: '56px', display: 'grid', placeItems: 'center' }}>
                  <TabIcon name="lock" size={30} />
                </div>
                <div class="cc-name">{stageLabel(GUARD_SLOT_UNLOCK[i])} で解放</div>
              </Card>
            );
          if (!k)
            return (
              <Card rarity={0} class="char-card small">
                <div class="cc-head">
                  <span>枠{i + 1}</span>
                </div>
                <div style={{ height: '56px', display: 'grid', placeItems: 'center' }} class="muted">
                  空き
                </div>
                <div class="cc-name muted">霊珠から</div>
              </Card>
            );
          const { id, shiny } = parseGuardianKey(k);
          const d = ALLY_BY_ID[id];
          return (
            <Card rarity={d.rarity} class="char-card small" onClick={() => setDetail(k)}>
              <div class="cc-head">
                <ElIcon el={d.el} size={14} />
                <span>R{s.guardians[k].rank}</span>
              </div>
              <Portrait ally={d} size={56} ghost shiny={shiny} />
              <div class="cc-name">{d.name}</div>
              <div class="muted" style={{ fontSize: '10px', fontWeight: 800 }}>
                {effectText(k)}
              </div>
            </Card>
          );
        })}
      </div>

      <Panel kind="note">
        <div class="stat-grid">
          <div>
            <span>攻撃力</span>
            <b class="up">+{Math.round(b.atk * 100)}%</b>
          </div>
          <div>
            <span>体力</span>
            <b class="up">+{Math.round(b.hp * 100)}%</b>
          </div>
          <div>
            <span>攻撃速度</span>
            <b class="up">+{Math.round(b.speed * 100)}%</b>
          </div>
          <div>
            <span>被ダメ軽減</span>
            <b class="up">{Math.round(b.reduce * 100)}%</b>
          </div>
          <div>
            <span>コイン</span>
            <b class="up">+{Math.round(b.gold * 100)}%</b>
          </div>
          <div>
            <span>会心ダメ</span>
            <b class="up">+{Math.round(b.critDmg * 100)}%</b>
          </div>
        </div>
        <div class="hint" style={{ marginTop: '6px' }}>
          ※装備の効果も含む合計。図鑑 {s.codex.length}/{ALLIES.length}：全能力 +{s.codex.length * 2}%
        </div>
      </Panel>

      <div class="sec-title">
        <TabIcon name="book" size={24} />
        宿った守護霊 {keys.length}
      </div>
      <div class="grid small">
        {keys.map((k) => {
          const { id, shiny } = parseGuardianKey(k);
          const d = ALLY_BY_ID[id];
          const placed = s.guardianSlots.slice(0, n).includes(k);
          return (
            <Card rarity={d.rarity} class="char-card small" selected={placed} onClick={() => setDetail(k)}>
              <div class="cc-head">
                <ElIcon el={d.el} size={14} />
                <span>
                  {shiny && <StarIcon size={11} />}R{s.guardians[k].rank}
                </span>
              </div>
              <Portrait ally={d} size={52} ghost shiny={shiny} />
              <div class="cc-name">{d.name}</div>
            </Card>
          );
        })}
      </div>
      {!keys.length && <div class="empty">まだ守護霊はいない。魔物を倒して霊珠を集めよう。</div>}

      {opened && <OrbResult got={opened} onClose={() => setOpened(null)} />}
      {detail && <GuardianDetail k={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function OrbResult({ got, onClose }: { got: ReturnType<typeof L.openOrbs>; onClose: () => void }) {
  return (
    <Modal title={`霊珠をひらいた（${got.length}）`} onClose={onClose}>
      <div class="grid small" style={{ gap: '30px 8px' }}>
        {got.slice(0, 30).map((x, i) => (
          <div class="pull-item" style={{ animationDelay: i * 0.06 + 's' }}>
            <Card rarity={x.def.rarity} class="char-card small">
              <div class="cc-head">
                <ElIcon el={x.def.el} size={14} />
                <span>{RARITY_NAME[x.def.rarity]}</span>
              </div>
              <Portrait ally={x.def} size={52} ghost shiny={x.shiny} />
              <div class="cc-name">{x.def.name}</div>
              {x.isNew && <span class="pi-new dot">NEW</span>}
              {x.shiny && (
                <div class="pi-up">
                  <StarIcon size={10} />
                  色違い
                </div>
              )}
              {x.rankUp && <div class="pi-up">ランクUP</div>}
            </Card>
          </div>
        ))}
      </div>
      {got.length > 30 && <div class="hint">ほか {got.length - 30} 体</div>}
      <Btn color="green" style={{ width: '100%', marginTop: '10px' }} onClick={onClose}>
        OK
      </Btn>
    </Modal>
  );
}

function GuardianDetail({ k, onClose }: { k: string; onClose: () => void }) {
  const s = useGame(3);
  const { id, shiny } = parseGuardianKey(k);
  const d = ALLY_BY_ID[id];
  const g = s.guardians[k];
  const n = guardianSlotsUnlocked(s.maxG);
  const at = s.guardianSlots.indexOf(k);
  const placed = at >= 0 && at < n;
  return (
    <Modal title={`守護霊 ${d.name}${shiny ? '（色違い）' : ''}`} onClose={onClose}>
      <div class="col">
        <div class="row">
          <div class="slot" style={{ width: '120px' }}>
            <Portrait ally={d} size={96} ghost shiny={shiny} />
          </div>
          <div class="grow col" style={{ gap: '6px' }}>
            <AllyInfoLine ally={d} />
            <div style={{ fontWeight: 800 }}>
              {effectText(k)}
            </div>
            <div class="hint">
              属性で効果が決まる：<ElIcon el={d.el} size={14} />
              <b>{ELEMENT_INFO[d.el].name}</b>
              <Arrow size={9} />
              {GUARD_EFFECT[d.el].label}
              {shiny && '（色違いは効果1.5倍）'}
            </div>
          </div>
        </div>
        <div>
          <div class="row" style={{ justifyContent: 'space-between', fontSize: '13px', fontWeight: 800 }}>
            <span>ランク {g.rank}</span>
            <span class="muted">{g.rank < GUARD_MAX_RANK ? `同じ守護霊 ${g.copies}/${g.rank}` : '最大ランク'}</span>
          </div>
          {g.rank < GUARD_MAX_RANK && <Bar value={g.copies} max={g.rank} />}
        </div>
        {placed ? (
          <Btn
            color="red"
            onClick={() => {
              game.act((sv) => (sv.guardianSlots[at] = null));
              onClose();
            }}
          >
            枠から外す
          </Btn>
        ) : (
          <div class="col" style={{ gap: '6px' }}>
            <div class="hint">宿す枠を選ぶ：</div>
            <div class="row" style={{ flexWrap: 'wrap', gap: '6px' }}>
              {s.guardianSlots.slice(0, n).map((cur, i) => (
                <Btn
                  size="sm"
                  color={cur ? 'white' : 'green'}
                  onClick={() => {
                    game.act((sv) => (sv.guardianSlots[i] = k));
                    onClose();
                  }}
                >
                  枠{i + 1}
                  {cur ? `（${ALLY_BY_ID[parseGuardianKey(cur).id].name}と交代）` : ''}
                </Btn>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
