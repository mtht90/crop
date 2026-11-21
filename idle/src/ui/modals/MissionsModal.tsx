import { game } from '../../game/store';
import * as L from '../../game/logic';
import { Bar, Btn, Modal, useGame } from '../common';
import { Gem, TabIcon } from '../icons';

export function MissionsModal({ onClose }: { onClose: () => void }) {
  const s = useGame(4);
  const gd = L.GUIDE[s.missions.guide];
  const allDone = L.DAILY.every((m) => s.missions.claimed.includes(m.id));
  const bonusClaimed = s.missions.claimed.includes('bonus');
  const claim = (fn: (sv: typeof s) => number) => {
    const g = game.act(fn);
    if (g) game.toast(`霊晶 +${g}`, 'good');
  };
  return (
    <Modal title={<><TabIcon name="scroll" size={26} />任務</>} onClose={onClose}>
      <div class="col">
        {gd && (
          <>
            <b>導きの任務 {s.missions.guide + 1}/{L.GUIDE.length}</b>
            <div class="lrow" style={{ background: '#fff6d0' }}>
              <div class="lr-ico"><TabIcon name="star" size={30} /></div>
              <div class="lr-main">
                <div class="lr-title" style={{ whiteSpace: 'normal' }}>{gd.label}</div>
                {gd.hint && <div class="lr-sub" style={{ whiteSpace: 'normal' }}>{gd.hint}</div>}
              </div>
              <Btn size="sm" color={gd.done(s) ? 'gold' : 'gray'} disabled={!gd.done(s)} onClick={() => claim((sv) => L.claimGuide(sv))}>
                <Gem size={16} />{gd.gems}
              </Btn>
            </div>
          </>
        )}
        <b>日替わり任務</b>
        <div class="list">
          {L.DAILY.map((m) => {
            const p = Math.min(m.goal, s.missions.prog[m.key] ?? 0);
            const claimed = s.missions.claimed.includes(m.id);
            const ok = p >= m.goal;
            return (
              <div class={`lrow ${claimed ? 'done' : ''}`}>
                <div class="lr-main">
                  <div class="lr-title" style={{ fontSize: '14px' }}>{m.label}</div>
                  <Bar value={p} max={m.goal} label={`${p} / ${m.goal}`} />
                </div>
                <Btn size="sm" color={claimed ? 'gray' : ok ? 'gold' : 'white'} disabled={claimed || !ok} onClick={() => claim((sv) => L.claimDaily(sv, m.id))}>
                  {claimed ? '済' : <><Gem size={16} />{m.gems}</>}
                </Btn>
              </div>
            );
          })}
          <div class={`lrow ${bonusClaimed ? 'done' : ''}`} style={{ background: '#f3e6ff' }}>
            <div class="lr-main">
              <div class="lr-title" style={{ fontSize: '14px' }}>日替わり任務をすべて達成</div>
            </div>
            <Btn size="sm" color={bonusClaimed ? 'gray' : allDone ? 'gold' : 'white'} disabled={bonusClaimed || !allDone} onClick={() => claim((sv) => L.claimDailyBonus(sv))}>
              {bonusClaimed ? '済' : <><Gem size={16} />{L.DAILY_BONUS}</>}
            </Btn>
          </div>
        </div>
        <div class="hint">日替わり任務は毎日0時に更新される。</div>
      </div>
    </Modal>
  );
}
