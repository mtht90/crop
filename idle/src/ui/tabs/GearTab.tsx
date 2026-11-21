import { useState } from 'preact/hooks';
import { game } from '../../game/store';
import { EQUIPS, EQUIP_BY_ID, EQUIP_MAX_LV, SKILLS, SKILL_BY_ID, SKILL_MAX_LV, SLOT_LABEL, STAT_LABEL, copiesForLevel, equipLvMul, skillDesc, type EquipDef, type Slot, type StatKey } from '../../data/items';
import { ELEMENT_INFO } from '../../data/monsters';
import * as L from '../../game/logic';
import { Bar, Btn, Card, Modal, Panel, RARITY_NAME, SubTabs, useGame } from '../common';
import { EquipIcon, SkillIcon, Stars, TabIcon } from '../icons';

const pct = (k: StatKey, v: number) => (k === 'regen' ? `+${(v * 100).toFixed(1)}%/秒` : `+${Math.round(v * 100)}%`);

export function GearTab() {
  const [sub, setSub] = useState<'equip' | 'skill'>('equip');
  return (
    <div class="col">
      <SubTabs
        tabs={[
          ['equip', '装備'],
          ['skill', '秘術'],
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'equip' ? <EquipView /> : <SkillView />}
    </div>
  );
}

function statLines(d: EquipDef, lv: number) {
  const m = equipLvMul(lv);
  return (
    <>
      {STAT_LABEL[d.main[0]]} <b>{pct(d.main[0], d.main[1] * m)}</b>
      {d.sub && (
        <>
          {' '}
          ／ {STAT_LABEL[d.sub[0]]} <b>{pct(d.sub[0], d.sub[1] * m)}</b>
        </>
      )}
    </>
  );
}

function EquipView() {
  const s = useGame(3);
  const [pick, setPick] = useState<Slot | null>(null);
  return (
    <div class="col">
      <div class="list">
        {(['weapon', 'armor', 'acc'] as Slot[]).map((slot) => {
          const id = s.equipped[slot];
          const d = id ? EQUIP_BY_ID[id] : null;
          const lv = id ? s.equips[id]?.lv ?? 1 : 0;
          const n = EQUIPS.filter((e) => e.slot === slot && s.equips[e.id]).length;
          return (
            <div class="lrow is-click" onClick={() => setPick(slot)}>
              <div class="lr-ico">{d ? <EquipIcon id={d.id} size={34} /> : <span class="muted">{SLOT_LABEL[slot]}</span>}</div>
              <div class="lr-main">
                <div class="lr-title">
                  {d ? d.name : `${SLOT_LABEL[slot]}：なし`}
                  {d && <span class="lv">Lv{lv}</span>}
                  {d && <Stars n={d.rarity} size={11} />}
                </div>
                <div class="lr-sub">{d ? statLines(d, lv) : n ? 'タップして装備' : '武具召喚で手に入る'}</div>
              </div>
              <Btn size="sm" color="white">
                変更
              </Btn>
            </div>
          );
        })}
      </div>
      <Btn
        color="blue"
        onClick={() => {
          game.act((sv) => L.autoEquip(sv));
          game.toast('最も強い装備にそろえた', 'good');
        }}
      >
        おまかせ装備
      </Btn>
      <div class="sec-title">
        <TabIcon name="gear" size={24} />
        所持品
      </div>
      <div class="grid small">
        {EQUIPS.filter((e) => s.equips[e.id])
          .sort((a, b) => b.rarity - a.rarity)
          .map((e) => (
            <EquipCard d={e} onClick={() => setPick(e.slot)} equipped={s.equipped[e.slot] === e.id} />
          ))}
      </div>
      {!Object.keys(s.equips).length && <div class="empty">「召喚」タブの「武具召喚」で装備を手に入れよう</div>}
      {pick && <EquipPicker slot={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

function EquipCard({ d, onClick, equipped }: { d: EquipDef; onClick?: () => void; equipped?: boolean }) {
  const s = game.save;
  const own = s.equips[d.id];
  return (
    <Card rarity={d.rarity} onClick={onClick} selected={equipped} class="char-card small">
      <div class="cc-head">
        <span>{SLOT_LABEL[d.slot]}</span>
        <span class="cc-r">{RARITY_NAME[d.rarity]}</span>
      </div>
      <div style={{ height: '50px', display: 'grid', placeItems: 'center' }}>
        <EquipIcon id={d.id} size={44} />
      </div>
      <div class="cc-name">{d.name}</div>
      {own && <div class="muted" style={{ fontWeight: 800 }}>Lv{own.lv}</div>}
    </Card>
  );
}

function EquipPicker({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const s = useGame(3);
  const list = EQUIPS.filter((e) => e.slot === slot && s.equips[e.id]).sort((a, b) => L.equipScore(b.id, s.equips[b.id].lv) - L.equipScore(a.id, s.equips[a.id].lv));
  return (
    <Modal title={`${SLOT_LABEL[slot]}を選ぶ`} onClose={onClose}>
      <div class="list">
        {list.map((d) => {
          const own = s.equips[d.id];
          const on = s.equipped[slot] === d.id;
          return (
            <div class="lrow">
              <div class="lr-ico">
                <EquipIcon id={d.id} size={34} />
              </div>
              <div class="lr-main">
                <div class="lr-title">
                  {d.name} <span class="lv">Lv{own.lv}</span>
                  <Stars n={d.rarity} size={11} />
                </div>
                <div class="lr-sub">{statLines(d, own.lv)}</div>
                {own.lv < EQUIP_MAX_LV && <Bar value={own.copies} max={copiesForLevel(own.lv)} label={`強化 ${own.copies}/${copiesForLevel(own.lv)}`} />}
              </div>
              {on ? (
                <Btn size="sm" color="red" onClick={() => game.act((sv) => (sv.equipped[slot] = null))}>
                  外す
                </Btn>
              ) : (
                <Btn size="sm" color="green" onClick={() => game.act((sv) => (sv.equipped[slot] = d.id))}>
                  装備
                </Btn>
              )}
            </div>
          );
        })}
        {!list.length && <div class="empty">まだ持っていません。武具召喚で手に入ります。</div>}
      </div>
      <p class="hint">同じ装備を重ねて引くとレベルが上がり、効果が強くなる（最大Lv{EQUIP_MAX_LV}）。</p>
    </Modal>
  );
}

function SkillView() {
  const s = useGame(3);
  const slots = game.hero.skillSlots;
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div class="col">
      <Panel kind="note">
        <div class="hint">秘術は自動で発動するスキル。出撃中の霊獣のレア度でスロット数が決まる（N/R:1、SR/SSR:2、UR:3）。</div>
      </Panel>
      <div class="list">
        {[0, 1, 2].map((i) => {
          const id = s.skillSlots[i];
          const d = id ? SKILL_BY_ID[id] : null;
          const locked = i >= slots;
          const lv = id ? s.skills[id]?.lv ?? 1 : 0;
          return (
            <div class={`lrow ${locked ? 'lock-slot' : 'is-click'}`} onClick={() => !locked && setPick(i)}>
              <div class="lr-ico">{locked ? <TabIcon name="lock" size={28} /> : d ? <SkillIcon kind={d.kind} el={d.el} size={34} /> : <span class="muted">空き</span>}</div>
              <div class="lr-main">
                <div class="lr-title">
                  {locked ? `スロット${i + 1}（ロック中）` : d ? d.name : `スロット${i + 1}：空き`}
                  {d && !locked && <span class="lv">Lv{lv}</span>}
                </div>
                <div class="lr-sub">{locked ? 'レア度の高い霊獣で解放' : d ? `${skillDesc(d, lv)}（${d.cd}秒）` : 'タップしてセット'}</div>
              </div>
            </div>
          );
        })}
      </div>
      <Btn
        color="blue"
        onClick={() => {
          game.act((sv) => L.autoSkills(sv));
          game.toast('秘術をおまかせでセットした', 'good');
        }}
      >
        おまかせセット
      </Btn>
      <div class="sec-title">
        <TabIcon name="book" size={24} />
        所持秘術
      </div>
      <div class="grid small">
        {SKILLS.filter((k) => s.skills[k.id])
          .sort((a, b) => b.rarity - a.rarity)
          .map((d) => (
            <Card rarity={d.rarity} class="char-card small" selected={s.skillSlots.slice(0, slots).includes(d.id)}>
              <div class="cc-head">
                <span>{ELEMENT_INFO[d.el].name}</span>
                <span class="cc-r">{RARITY_NAME[d.rarity]}</span>
              </div>
              <div style={{ height: '50px', display: 'grid', placeItems: 'center' }}>
                <SkillIcon kind={d.kind} el={d.el} size={44} />
              </div>
              <div class="cc-name">{d.name}</div>
              <div class="muted" style={{ fontWeight: 800 }}>
                Lv{s.skills[d.id].lv}
              </div>
            </Card>
          ))}
      </div>
      {!Object.keys(s.skills).length && <div class="empty">「召喚」タブの「秘術召喚」で秘術を手に入れよう</div>}
      {pick !== null && <SkillPicker slot={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

function SkillPicker({ slot, onClose }: { slot: number; onClose: () => void }) {
  const s = useGame(3);
  const list = SKILLS.filter((k) => s.skills[k.id]).sort((a, b) => b.rarity - a.rarity);
  return (
    <Modal title={`スロット${slot + 1}に秘術をセット`} onClose={onClose}>
      <div class="list">
        {list.map((d) => {
          const own = s.skills[d.id];
          const at = s.skillSlots.indexOf(d.id);
          return (
            <div class="lrow">
              <div class="lr-ico">
                <SkillIcon kind={d.kind} el={d.el} size={34} />
              </div>
              <div class="lr-main">
                <div class="lr-title">
                  {d.name} <span class="lv">Lv{own.lv}</span> <Stars n={d.rarity} size={11} />
                </div>
                <div class="lr-sub" style={{ whiteSpace: 'normal' }}>
                  {skillDesc(d, own.lv)}（{d.cd}秒）
                </div>
                {own.lv < SKILL_MAX_LV && <Bar value={own.copies} max={copiesForLevel(own.lv)} label={`強化 ${own.copies}/${copiesForLevel(own.lv)}`} />}
              </div>
              {at === slot ? (
                <Btn size="sm" color="red" onClick={() => game.act((sv) => (sv.skillSlots[slot] = null))}>
                  外す
                </Btn>
              ) : (
                <Btn
                  size="sm"
                  color="green"
                  onClick={() => {
                    game.act((sv) => {
                      if (at >= 0) sv.skillSlots[at] = sv.skillSlots[slot];
                      sv.skillSlots[slot] = d.id;
                    });
                    onClose();
                  }}
                >
                  セット
                </Btn>
              )}
            </div>
          );
        })}
        {!list.length && <div class="empty">まだ秘術を持っていません。</div>}
      </div>
    </Modal>
  );
}
