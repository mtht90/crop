import { useState } from 'preact/hooks';
import { game } from '../../game/store';
import { TRAIN, fmt, type TrainKey } from '../../game/core';
import * as L from '../../game/logic';
import { sfx } from '../../game/audio';
import { Btn, Panel, Portrait, Toggle, useGame } from '../common';
import { Arrow, Coin, ElIcon, TabIcon } from '../icons';

const ICON: Record<TrainKey, string> = { atk: 'blade', hp: 'heart', crit: 'crit', critDmg: 'critDmg', speed: 'speed' };

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
      <div class="hero-row">
        <div class="slot">
          <Portrait ally={h.ally} size={50} />
        </div>
        <div class="hr-main">
          <div class="hr-name">
            <ElIcon el={h.ally.el} size={16} />
            {h.ally.name}
            <span class="muted">{h.ally.title}</span>
            {own?.stars ? <span class="chip gold">覚醒{own.stars}</span> : null}
          </div>
          <div class="hr-stats">
            <span>
              <TabIcon name="power" size={16} />
              {fmt(h.power)}
            </span>
            <span>
              <TabIcon name="blade" size={16} />
              {fmt(h.atk)}
            </span>
            <span>
              <TabIcon name="heart" size={16} />
              {fmt(h.hp)}
            </span>
            <span>
              <TabIcon name="crit" size={16} />
              {(h.crit * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

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
                repeat
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
