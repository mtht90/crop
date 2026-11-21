import { useEffect, useState } from 'preact/hooks';
import { game } from '../../game/store';
import { CHEST_GEMS_PER_HOUR, CHEST_MAX_HOURS, fmt, fmtTime } from '../../game/core';
import * as L from '../../game/logic';
import { sfx } from '../../game/audio';
import { Bar, Btn, Modal, useGame } from '../common';
import { Coin, Gem, Orb, TabIcon } from '../icons';

export function ChestModal({ onClose }: { onClose: () => void }) {
  const s = useGame(2);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const c = L.chestContents(s, Date.now());
  return (
    <Modal title={<><TabIcon name="chest" size={26} />霊脈の恵み</>} onClose={onClose}>
      <div class="col">
        <div class="hint">霊脈から少しずつ恵みが湧き出す。最大{CHEST_MAX_HOURS}時間分たまる（霊晶 {CHEST_GEMS_PER_HOUR}/時）。</div>
        <Bar value={c.hours} max={CHEST_MAX_HOURS} label={c.full ? '満タン！' : fmtTime(c.hours * 3600)} />
        <div class="report-grid">
          <Coin size={24} /><span class="row" style={{ justifyContent: 'space-between' }}>コイン<b class="num">+{fmt(c.coins)}</b></span>
          <Gem size={24} /><span class="row" style={{ justifyContent: 'space-between' }}>霊晶<b class="num">+{c.gems}</b></span>
          <Orb size={24} /><span class="row" style={{ justifyContent: 'space-between' }}>霊珠<b class="num">+{c.orbs}</b></span>
        </div>
        <Btn
          color="gold"
          size="lg"
          disabled={c.hours < 1 / 60}
          onClick={() => {
            const r = game.act((sv) => L.claimChest(sv, Date.now()));
            if (r) {
              sfx.win();
              game.toast(`霊晶 +${r.gems}　コイン +${fmt(r.coins)}`, 'good');
            }
            onClose();
          }}
        >
          受け取る
        </Btn>
      </div>
    </Modal>
  );
}
