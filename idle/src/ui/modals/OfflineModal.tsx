import { fmt, fmtTime, stageLabel } from '../../game/core';
import type { OfflineReport } from '../../game/logic';
import { Btn, Modal } from '../common';
import { Arrow, Coin, Gem, Orb, TabIcon } from '../icons';

export function OfflineModal({ report: r, onClose }: { report: OfflineReport; onClose: () => void }) {
  return (
    <Modal title={<><TabIcon name="clock" size={26} />留守中のできごと</>} onClose={onClose}>
      <div class="col">
        <div class="hint" style={{ textAlign: 'center' }}>{fmtTime(r.seconds)} のあいだ、霊獣は戦い続けていた</div>
        <div class="big-arrow">
          {stageLabel(r.fromG)} <Arrow size={18} /> {stageLabel(r.toG)}
          {r.toG > r.fromG && <div style={{ fontSize: '13px', width: '100%' }} class="up">{r.toG - r.fromG} ステージ前進！</div>}
        </div>
        <div class="report-grid">
          <TabIcon name="skull" size={24} />
          <span class="row" style={{ justifyContent: 'space-between' }}>討伐<b class="num">{fmt(r.kills)}体</b></span>
          <TabIcon name="star" size={24} />
          <span class="row" style={{ justifyContent: 'space-between' }}>ボス撃破<b class="num">{r.bossWins}{r.bossLosses ? `（敗北${r.bossLosses}）` : ''}</b></span>
          <Coin size={24} />
          <span class="row" style={{ justifyContent: 'space-between' }}>コイン<b class="num">+{fmt(r.coins)}</b></span>
          <Gem size={24} />
          <span class="row" style={{ justifyContent: 'space-between' }}>霊晶<b class="num">+{fmt(r.gems)}</b></span>
          <Orb size={24} />
          <span class="row" style={{ justifyContent: 'space-between' }}>霊珠<b class="num">+{r.orbs}</b></span>
          <TabIcon name="train" size={24} />
          <span class="row" style={{ justifyContent: 'space-between' }}>自動修練<b class="num">{r.trained}回</b></span>
        </div>
        <Btn color="green" size="lg" onClick={onClose}>受け取る</Btn>
      </div>
    </Modal>
  );
}
