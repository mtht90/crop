import { audio } from '../core/audio';
import { events, toast } from '../core/events';
import { el, escapeHtml, nicePrice, rng, yen } from '../core/util';
import { itemDef } from '../data/items';
import type { Game } from '../game/game';
import type { ItemState } from '../game/state';
import { GRADE_COLOR, GRADE_LABEL, effectiveCondition, itemGrade } from '../game/valuation';
import { InspectStage } from './inspect';
import { Modal, icon } from './ui';

/** 作業台: 清掃 (こすって汚れを落とす) と 修理 (タイミングゲーム) */
export class WorkshopUI extends Modal {
  private stage: InspectStage | null = null;
  private it: ItemState | null = null;
  private side!: HTMLElement;
  private repair: { pos: number; dir: number; hits: number; misses: number; zone: [number, number]; speed: number } | null = null;
  private suppliesPaid = false;

  constructor(private g: Game) {
    super('workshop');
    this.el.innerHTML = `
      <div class="ap-view">
        <div class="ap-canvas"></div>
        <div class="ws-mode"></div>
        <div class="ws-repair hidden"><div class="ws-title">修理: 緑のゾーンで <kbd>Space</kbd> / クリック ×3</div><div class="ws-bar"><div class="zone"></div><div class="needle"></div></div><div class="ws-count"></div></div>
      </div>
      <div class="ap-side"></div>`;
    this.side = this.el.querySelector('.ap-side')!;
    const bar = this.el.querySelector('.ws-bar') as HTMLElement;
    bar.addEventListener('pointerdown', () => this.hitRepair());
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && this.repair && this.ui?.isOpen(this)) { this.hitRepair(); e.preventDefault(); } });
  }

  open() {
    const slot = this.g.world.benchSlot();
    const it = slot?.item?.state;
    if (!it) { toast('作業台に商品を置いてください', 'warn'); return; }
    this.it = it;
    this.g.ui.open(this);
  }

  onOpen() {
    if (!this.stage) this.stage = new InspectStage(this.el.querySelector('.ap-canvas')!);
    this.stage.setItem(this.it!, 'clean');
    this.stage.scrubPower = this.g.model.has('cleaner') ? 2 : 1;
    this.stage.onScrub = (rem) => this.onScrub(rem);
    this.stage.onDefectFound = (d) => {
      audio.play('success', { volume: 0.5, rate: 1.4 });
      toast(`傷を発見 (状態 -${d.severity})`, 'info', 'magnifying-glass');
      this.render();
    };
    this.repair = null;
    this.suppliesPaid = false;
    this.el.querySelector('.ws-repair')!.classList.add('hidden');
    this.render();
  }

  update(dt: number) {
    this.stage?.render(dt);
    if (this.repair) {
      const r = this.repair;
      r.pos += r.dir * r.speed * dt;
      if (r.pos > 1) { r.pos = 1; r.dir = -1; }
      if (r.pos < 0) { r.pos = 0; r.dir = 1; }
      (this.el.querySelector('.needle') as HTMLElement).style.left = `${r.pos * 100}%`;
    }
  }

  private scrubSoundT = 0;
  private onScrub(rem: number) {
    const it = this.it!;
    if (!this.suppliesPaid) {
      this.suppliesPaid = true;
      this.g.model.addMoney(-100, '清掃用品');
      this.g.model.state.today.expenses += 100;
    }
    const now = performance.now();
    if (now - this.scrubSoundT > 140) { audio.scrub(); this.scrubSoundT = now; }
    const startDirt = (this.stage as any).startDirt ?? it.dirt;
    (this.stage as any).startDirt = startDirt;
    it.dirt = Math.max(0, startDirt * rem);
    if (rem <= 0.04 && startDirt > 0) {
      it.dirt = 0;
      (this.stage as any).startDirt = undefined;
      this.g.model.state.stats.cleaned++;
      this.g.model.addXp(12);
      audio.play('success', { volume: 0.7 });
      toast('ピカピカになった！ 状態が上がりました', 'good', 'sparkles');
      events.emit('item:cleaned', { itemUid: it.uid });
    }
    this.render();
  }

  private repairCost(it: ItemState) {
    const def = itemDef(it.defId);
    const base = def.electronic && !it.working ? def.base * 0.1 : def.base * 0.06;
    return nicePrice(Math.max(300, base * (this.g.model.has('tools') ? 0.7 : 1)));
  }

  private canRepair(it: ItemState): string | null {
    const def = itemDef(it.defId);
    if (def.electronic && !it.tested) return '先に動作確認をしてください';
    if (def.electronic && !it.working) return null;
    if (it.repaired) return 'これ以上は直せない';
    if (!it.defects.length) return '修理の必要なし';
    return null;
  }

  private render() {
    const it = this.it!;
    const def = itemDef(it.defId);
    const g = itemGrade(it);
    const cond = Math.round(effectiveCondition(it));
    const why = this.canRepair(it);
    const cost = this.repairCost(it);
    const mode = def.electronic && !it.working ? '故障修理' : '傷の補修';
    this.el.querySelector('.ws-mode')!.innerHTML = (it.dirt > 0.02 ? `${icon('broom')} 汚れを<b>ドラッグでこすって</b>落とそう (残り ${Math.round(it.dirt * 100)}%)` : `${icon('sparkles')} 清掃完了`) + ' ・ 傷は<b>クリック</b>で記録';
    this.side.innerHTML = `
      <div class="ap-item">
        <div class="ap-name">${escapeHtml(def.name)}</div>
        <div class="ws-grade"><span class="grade" style="background:${GRADE_COLOR[g]}">${g}</span> ${GRADE_LABEL[g]} <span class="dim">(状態 ${cond})</span></div>
        <div class="ap-grid">
          <div>汚れ</div><div><div class="meter"><i style="width:${it.dirt * 100}%"></i></div></div>
          <div>傷・凹み</div><div>${it.defects.length ? it.defects.map((d) => `<span class="def ${d.found ? '' : 'dim'}">-${d.severity}</span>`).join('') : 'なし'}</div>
          ${def.electronic ? `<div>動作</div><div>${it.tested ? (it.working ? '<b class="good">OK</b>' : '<b class="bad">故障</b>') : '<span class="dim">未確認</span>'}</div>` : ''}
        </div>
      </div>
      <div class="ws-actions">
        ${def.electronic && !it.tested ? `<button class="test">${icon('laptop')} 動作確認</button>` : ''}
        <button class="repair" ${why ? 'disabled' : ''}>${icon('screwdriver')} ${mode} <span class="cost">${yen(cost)}</span></button>
        ${why ? `<div class="dim small">${why}</div>` : `<div class="dim small">成功率は${this.g.model.has('tools') ? '高め (工具セット)' : 'ふつう'}。失敗すると部品代だけかかります。</div>`}
      </div>
      <div class="btns">
        <button class="primary pick">${icon('hand')} 手に取る</button>
        <button class="close-btn">閉じる</button>
      </div>`;
    this.side.querySelector('.test')?.addEventListener('click', () => {
      it.tested = true;
      if (it.working) { audio.play('success'); toast('正常に動作しています', 'good'); } else { audio.errorBuzz(); toast('故障している…修理が必要', 'bad'); }
      this.render();
    });
    this.side.querySelector('.repair')?.addEventListener('click', () => this.startRepair());
    this.side.querySelector('.pick')!.addEventListener('click', () => {
      const v = this.g.world.view(it.uid);
      this.close();
      if (v) this.g.interaction.pickUp(v);
    });
    this.side.querySelector('.close-btn')!.addEventListener('click', () => this.close());
  }

  private startRepair() {
    const it = this.it!;
    const cost = this.repairCost(it);
    if (!this.g.model.canAfford(cost)) { toast('お金が足りません', 'bad'); return; }
    this.g.model.addMoney(-cost, '修理部品');
    this.g.model.state.today.expenses += cost;
    const w = this.g.model.has('tools') ? 0.2 : 0.14;
    const c = rng.range(0.2, 0.8);
    this.repair = { pos: 0, dir: 1, hits: 0, misses: 0, zone: [c - w / 2, c + w / 2], speed: rng.range(0.9, 1.3) };
    const box = this.el.querySelector('.ws-repair') as HTMLElement;
    box.classList.remove('hidden');
    const zone = box.querySelector('.zone') as HTMLElement;
    zone.style.left = `${this.repair.zone[0] * 100}%`;
    zone.style.width = `${w * 100}%`;
    this.updateRepairCount();
  }

  private updateRepairCount() {
    const r = this.repair!;
    this.el.querySelector('.ws-count')!.innerHTML = `成功 ${'●'.repeat(r.hits)}${'○'.repeat(3 - r.hits)} ・ ミス ${'✕'.repeat(r.misses)}${'・'.repeat(Math.max(0, 2 - r.misses))}`;
  }

  private hitRepair() {
    const r = this.repair;
    if (!r) return;
    if (r.pos >= r.zone[0] && r.pos <= r.zone[1]) {
      r.hits++;
      audio.play('equip', { volume: 0.6 });
      // 次のゾーンへ移動・スピードアップ
      const w = r.zone[1] - r.zone[0];
      const c = rng.range(0.15, 0.85);
      r.zone = [c - w / 2, c + w / 2];
      r.speed *= 1.15;
      const zone = this.el.querySelector('.zone') as HTMLElement;
      zone.style.left = `${r.zone[0] * 100}%`;
    } else {
      r.misses++;
      audio.errorBuzz();
    }
    this.updateRepairCount();
    if (r.hits >= 3) this.endRepair(true);
    else if (r.misses >= 2) this.endRepair(false);
  }

  private endRepair(ok: boolean) {
    const it = this.it!;
    const def = itemDef(it.defId);
    this.repair = null;
    this.el.querySelector('.ws-repair')!.classList.add('hidden');
    if (ok) {
      if (def.electronic && !it.working) {
        it.working = true;
        toast('修理成功！ 動くようになった', 'good', 'spanner');
      } else {
        // 目立つ傷を 2 つまで直す
        it.defects.sort((a, b) => b.severity - a.severity);
        const fixed = it.defects.splice(0, 2);
        it.condition = Math.min(100, it.condition + fixed.reduce((s, d) => s + d.severity, 0));
        it.repaired = true;
        toast('補修成功！ 傷が目立たなくなった', 'good', 'spanner');
      }
      it.tested = true;
      this.g.model.state.stats.repaired++;
      this.g.model.addXp(20);
      audio.play('success');
      events.emit('item:repaired', { itemUid: it.uid, success: true });
      this.stage?.setItem(it, 'clean');
    } else {
      if (rng.chance(0.25)) {
        it.condition = Math.max(5, it.condition - 5);
        toast('修理失敗… しかも少し傷をつけてしまった', 'bad');
      } else toast('修理失敗… 部品代が無駄になった', 'bad');
      events.emit('item:repaired', { itemUid: it.uid, success: false });
    }
    this.render();
  }
}

export { el };
