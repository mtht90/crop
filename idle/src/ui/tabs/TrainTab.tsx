import { useState } from 'preact/hooks';
import { game } from '../../game/store';
import { TRAIN, fmt, soulMul, type TrainKey } from '../../game/core';
import * as L from '../../game/logic';
import { ELEMENT_INFO, ROLE_INFO } from '../../data/monsters';
import { sfx } from '../../game/audio';
import { AllyInfoLine, Btn, Panel, Portrait, Toggle, useGame } from '../common';
import { Arrow, Coin, ElIcon, TabIcon } from '../icons';

const ICON: Record<TrainKey, string> = { atk: 'sword', hp: 'heart', crit: 'crit', critDmg: 'critDmg', speed: 'speed' };

export function TrainTab() {
  const s = useGame(6);
  const h = game.hero;
  const [mult, setMult] = useState<1 | 10 | 0>(1);
  const own = s.chars[h.ally.id];

  const costFor = (k: TrainKey, n: number) => {
    const t = TRAIN.find((x) => x.key === k)!;
    let c = 0;
    let lv = s.train[k];
    let i = 0;
    if (n === 0) {
      // max affordable
      while (lv < t.max && c + Math.ceil(t.cost(lv)) <= s.coins && i < 1000) {
        c += Math.ceil(t.cost(lv));
        lv++;
        i++;
      }
      return { c, n: i };
    }
    for (; i < n && lv < t.max; i++, lv++) c += Math.ceil(t.cost(lv));
    return { c, n: i };
  };

  return (
    <div class="col">
      <Panel kind="wood">
        <div class="row" style={{ alignItems: 'stretch' }}>
          <div class="slot hero-slot">
            <Portrait ally={h.ally} size={72} />
          </div>
          <div class="grow col" style={{ gap: '4px' }}>
            <div class="row" style={{ gap: '6px', alignItems: 'baseline' }}>
              <b style={{ fontSize: '18px' }}>{h.ally.name}</b>
              <span class="muted">{h.ally.title}</span>
              {own?.stars ? <span class="chip gold">覚醒{own.stars}</span> : null}
            </div>
            <AllyInfoLine ally={h.ally} />
            <div class="stat-grid" style={{ marginTop: '4px' }}>
              <div>
                <span>攻撃力</span>
                <b>{fmt(h.atk)}</b>
              </div>
              <div>
                <span>体力</span>
                <b>{fmt(h.hp)}</b>
              </div>
              <div>
                <span>会心率</span>
                <b>{(h.crit * 100).toFixed(1)}%</b>
              </div>
              <div>
                <span>会心ダメ</span>
                <b>{Math.round(h.critDmg * 100)}%</b>
              </div>
              <div>
                <span>攻撃間隔</span>
                <b>{h.interval.toFixed(2)}秒</b>
              </div>
              <div>
                <span>戦力</span>
                <b>{fmt(h.power)}</b>
              </div>
              <div>
                <span>コイン</span>
                <b>×{h.gold.toFixed(2)}</b>
              </div>
            </div>
          </div>
        </div>
        <div class="hint" style={{ marginTop: '6px' }}>
          {ROLE_INFO[h.ally.role].name}：{ROLE_INFO[h.ally.role].desc} 属性 <ElIcon el={h.ally.el} size={14} /> <b>{ELEMENT_INFO[h.ally.el].name}</b>
          {s.souls > 0 && ` ／ 魂石ボーナス 能力×${soulMul(s.souls).power.toFixed(2)}`}
        </div>
      </Panel>

      <div class="sec-title">
        <TabIcon name="train" size={26} />
        <span class="grow">修練</span>
        <div class="row" style={{ gap: '4px' }}>
          {([1, 10, 0] as const).map((m) => (
            <Btn size="sm" color={mult === m ? 'gold' : 'white'} onClick={() => setMult(m)}>
              {m === 0 ? 'MAX' : '×' + m}
            </Btn>
          ))}
        </div>
      </div>

      <div class="list">
        {TRAIN.map((t) => {
          const lv = s.train[t.key];
          const maxed = lv >= t.max;
          const { c, n } = costFor(t.key, mult);
          const can = !maxed && n > 0 && s.coins >= c;
          const next = t.value(Math.min(t.max, lv + Math.max(1, n)));
          const step10 = (t.key === 'atk' || t.key === 'hp') && Math.floor((lv + Math.max(1, n)) / 10) > Math.floor(lv / 10);
          return (
            <div class="lrow">
              <div class="lr-ico">
                <TabIcon name={ICON[t.key]} size={30} />
              </div>
              <div class="lr-main">
                <div class="lr-title">
                  {t.name} <span class="lv">Lv {lv}</span>
                </div>
                <div class="lr-sub">
                  {t.fmt(t.value(lv))}
                  {!maxed && (
                    <>
                      <Arrow size={10} />
                      <span class="up">{t.fmt(next)}</span>
                      {step10 && <span class="up"> ×2!</span>}
                    </>
                  )}
                </div>
              </div>
              <Btn
                color={maxed ? 'gray' : 'green'}
                disabled={!can}
                style={{ minWidth: '108px' }}
                onClick={() => {
                  const done = game.act((sv) => L.doTrain(sv, t.key, n));
                  if (done) sfx.levelUp();
                }}
              >
                {maxed ? (
                  'MAX'
                ) : (
                  <>
                    <Coin size={18} />
                    {fmt(mult === 0 && n === 0 ? Math.ceil(t.cost(lv)) : c)}
                    {mult !== 1 && n > 0 ? <small>×{n}</small> : null}
                  </>
                )}
              </Btn>
            </div>
          );
        })}
      </div>

      <Panel kind="note" style={{ marginTop: '6px' }}>
        <div class="col" style={{ gap: '6px' }}>
          <Toggle on={s.settings.autoTrain} onChange={(v) => game.act((sv) => (sv.settings.autoTrain = v))} label="自動修練（コインを自動で使う。放置中も有効）" />
          <Toggle on={s.settings.autoBoss} onChange={(v) => game.act((sv) => (sv.settings.autoBoss = v))} label="ボスに自動で挑む（負けたら強くなるまで周回）" />
        </div>
      </Panel>
    </div>
  );
}
