import { useEffect, useState } from 'preact/hooks';
import { game } from '../game/store';
import { areaDef, fmt, isAreaBoss, killsNeeded, loopOf, stageLabel } from '../game/core';
import * as L from '../game/logic';
import { getField, type TabKey } from './App';
import { Bar, Btn, useGame } from './common';
import { TabIcon } from './icons';
import { MissionsModal } from './modals/MissionsModal';
import { ChestModal } from './modals/ChestModal';
import { sfx } from '../game/audio';

const LOOP = ['', ' Ⅱ', ' Ⅲ', ' Ⅳ', ' Ⅴ', ' Ⅵ', ' Ⅶ', ' Ⅷ', ' Ⅸ', ' Ⅹ'];

export function Hud(_p: { onTab: (t: TabKey) => void }) {
  const s = useGame(8);
  const [, tick] = useState(0);
  const [missions, setMissions] = useState(false);
  const [chest, setChest] = useState(false);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 200);
    return () => clearInterval(t);
  }, []);
  const f = getField();
  const area = areaDef(s.g);
  const need = killsNeeded(s.g);
  const full = s.kills >= need;
  const phase = f?.phase ?? 'field';
  const boss = f?.boss;
  const pending = L.pendingMissionCount(s);
  const chestC = L.chestContents(s, Date.now());
  const chestReady = chestC.hours >= 1;
  const showChallenge = phase === 'field' && full && !L.shouldAutoChallenge(s);
  const loop = loopOf(s.g);

  return (
    <div class="hud">
      <div class="hud-stage">
        <div class="st-area">
          {area.name}
          {LOOP[loop] ?? ' +' + loop}
        </div>
        <div class="st-no">
          STAGE {stageLabel(s.g)}
          {isAreaBoss(s.g) && ' ★'}
        </div>
      </div>

      <div class="hud-left">
        <div class="hud-power" title="戦力">
          <TabIcon name="sword" size={18} />
          {fmt(game.hero.power)}
        </div>
        <button
          class="round-btn"
          title="戦闘速度"
          onClick={() => {
            sfx.click();
            game.act((sv) => (sv.settings.speed = sv.settings.speed === 1 ? 2 : 1));
          }}
        >
          <TabIcon name="speed" size={20} />
          <span class="lbl">×{s.settings.speed}</span>
        </button>
      </div>

      <div class="hud-right">
        <button
          class="round-btn"
          title="霊脈の恵み"
          onClick={() => {
            sfx.click();
            setChest(true);
          }}
        >
          <TabIcon name="chest" size={26} />
          {chestReady && <span class="dot">{chestC.full ? '!' : '•'}</span>}
        </button>
        <button
          class="round-btn"
          title="任務"
          onClick={() => {
            sfx.click();
            setMissions(true);
          }}
        >
          <TabIcon name="scroll" size={26} />
          {pending > 0 && <span class="dot">{pending}</span>}
        </button>
      </div>

      {boss && (phase === 'boss' || phase === 'victory') && (
        <div class="hud-boss">
          <div>{boss.def.name}</div>
          <Bar value={boss.hp} max={boss.maxHp} label={fmt(Math.max(0, boss.hp))} />
          {phase === 'boss' && <div class={`timer ${f!.bossTimer < 8 ? 'low' : ''}`}>残り {Math.ceil(f!.bossTimer)} 秒</div>}
        </div>
      )}

      {phase === 'field' && s.farming && (
        <div class="hud-farm">周回中 — 強くなったら自動で再挑戦{s.settings.autoBoss ? '' : '（自動挑戦OFF）'}</div>
      )}

      <div class="hud-gauge">
        <Bar
          class={`${isAreaBoss(s.g) ? 'boss' : ''} ${full ? 'full' : ''}`}
          value={s.kills}
          max={need}
          label={full ? (isAreaBoss(s.g) ? 'エリアボス出現！' : 'ボス出現！') : `討伐 ${s.kills} / ${need}`}
        />
        {showChallenge && (
          <Btn color="red" size="sm" onClick={() => f?.challengeBoss()}>
            ボスに挑む
          </Btn>
        )}
      </div>

      {f?.banner && (
        <>
          {(f.banner.kind === 'boss' || f.banner.kind === 'areaBoss' || f.banner.kind === 'clear' || f.banner.kind === 'area') && <div class="banner-strip" key={'s' + f.banner.title + f.banner.sub} />}
          <div class={`banner ${f.banner.kind}`} key={f.banner.title + f.banner.sub}>
            <div class="b-title">{f.banner.title}</div>
            <br />
            <div class="b-sub">{f.banner.sub}</div>
          </div>
        </>
      )}

      {missions && <MissionsModal onClose={() => setMissions(false)} />}
      {chest && <ChestModal onClose={() => setChest(false)} />}
    </div>
  );
}
