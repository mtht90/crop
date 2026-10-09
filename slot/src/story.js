// =====================================================================
//  物語シナリオエンジン: 海賊の宝探し
//   1ゲームを「レバーON → 第1停止 → 第2停止 → 第3停止 → (PUSH) → 結果」で進め、
//   拍ごとに演出を昇格させる。待たせるのはレバーON時の最大 0.9 秒だけ。
// =====================================================================
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const COLOR_RANK = ['blue', 'green', 'red', 'gold', 'rainbow'];
const CHEST = { blue: 'wood', green: 'wood', red: 'silver', gold: 'gold', rainbow: 'rainbow' };
const STAGES = { day: '昼の海', sunset: '夕暮れの海', night: '夜の海', storm: '嵐の海' };

export function pickWeighted(table, rng = Math.random) {
  const ent = Object.entries(table).filter(([, w]) => w > 0);
  const tot = ent.reduce((a, [, w]) => a + w, 0);
  let r = rng() * tot;
  for (const [k, w] of ent) { r -= w; if (r < 0) return k; }
  return ent[0]?.[0];
}

export class Story {
  constructor(ctx) {
    Object.assign(this, ctx); // cfg, lcd, stage, audio, haptics, shaker, machine, director
    this.S = this.cfg.story;
    this.zone = null;
    this.cur = null;
    this.force = 'auto';
    this.lcd.cast = this.stage.portraits;
    this.lcd.onTick = () => this.audio.play('tick', { gain: 0.2, rate: 1.4 + Math.random() * 0.2 });
    this.baseMood = 'day';
  }

  // ------------------------------------------------------------
  plan(flag) {
    const m = this.machine;
    const cur = { type: 'none', outcome: 'lose', flag };
    if (m.mode !== 'normal') { this.cur = cur; return cur; }
    const pending = !!flag.bonus && !m.noticed;
    if (this.zone) {
      if (pending) this.zone.outcome = 'win';
      this.zone.left--;
      if (this.zone.left > 0) { cur.type = Math.random() < 0.6 ? 'cutin' : 'barrels'; cur.outcome = 'pending'; }
      else {
        cur.type = this.zone.outcome === 'win' ? (Math.random() < 0.4 ? 'final' : 'battle') : (Math.random() < 0.12 ? 'final' : 'battle');
        cur.outcome = this.zone.outcome;
        cur.zoneEnd = true;
      }
    } else {
      let key = 'NONE';
      if (pending) key = 'BONUS';
      else if (flag.small && this.S.scenarios[flag.small]) key = flag.small;
      const table = { ...this.S.scenarios[key] };
      if (pending && !flag.newBonus) { delete table.freeze; delete table.zone; }
      cur.type = pickWeighted(table);
      cur.outcome = pending ? 'win' : 'lose';
      if (this.force !== 'auto' && (!['map', 'freeze'].includes(this.force) || pending)) cur.type = this.force;
      if (cur.type === 'zone') {
        const [a, b] = this.S.zoneLength;
        this.zone = { left: a + Math.floor(Math.random() * (b - a + 1)), outcome: cur.outcome };
        cur.type = 'cutin'; cur.outcome = 'pending'; cur.zoneStart = true;
      }
    }
    const res = cur.outcome === 'win' ? 'win' : 'lose';
    cur.color = cur.type === 'map' ? 'rainbow' : pickWeighted(this.S.lineColor[res]);
    if (cur.outcome === 'pending') cur.color = Math.random() < 0.7 ? 'blue' : 'green';
    const finalRank = COLOR_RANK.indexOf(cur.color);
    const startRank = Math.max(0, finalRank - (finalRank >= 2 ? 1 + Math.floor(Math.random() * 2) : 0));
    cur.colors = [COLOR_RANK[startRank]];
    let r = startRank;
    for (let s = 1; s <= 3; s++) {
      if (r < finalRank && (Math.random() < 0.55 || s === 3)) r++;
      cur.colors.push(COLOR_RANK[Math.min(r, finalRank)]);
    }
    cur.colors[3] = cur.color;
    cur.revival = cur.outcome === 'win' && Math.random() < this.S.revival && ['battle', 'final', 'chest'].includes(cur.type);
    this.cur = cur;
    return cur;
  }

  line(color) {
    const pool = this.S.lines[color] || this.S.lines.blue;
    const [char, text] = pool[Math.floor(Math.random() * pool.length)];
    return { char, text };
  }

  cutin(color, opts = {}) {
    const l = opts.char ? { char: opts.char, text: opts.text ?? this.line(color).text } : this.line(color);
    this.lcd.play('cutin', { char: l.char, text: l.text, color, dur: opts.dur ?? 1.8 });
    this.audio.play('cutin', { gain: 0.7, rate: color === 'gold' ? 0.85 : 1 });
    if (COLOR_RANK.indexOf(color) >= 2) this.audio.play('title_hit', { gain: 0.45, rate: 1.4 });
    this.haptics.vibrate('cutin');
    if (color === 'gold' || color === 'rainbow') { this.director.bloomKick(0.8); this.shaker.add(0.3); }
  }

  setStage(mood, announce = true) {
    if (this.lcd.stage.mood === mood) return;
    this.lcd.stage = { name: STAGES[mood] || '', mood };
    this.stage.setMood(mood);
    if (announce && (mood === 'sunset' || mood === 'storm' || mood === 'night')) {
      this.lcd.play('flash', { color: mood === 'storm' ? '#a0b0c0' : '#ffb070', dur: 0.4, alpha: 0.5 });
      this.audio.play(mood === 'storm' ? 'alarm' : 'computer', { gain: 0.45 });
      this.lcd.play('telop', { text: STAGES[mood], dur: 1.2, color: mood === 'storm' ? '#d0e0ff' : '#ffd0a0' });
    }
  }

  // ------------------------------------------------------------
  //  レバーON
  // ------------------------------------------------------------
  async lever() {
    const c = this.cur, m = this.machine;
    if (!c || m.mode !== 'normal') return;
    // ステージ: 嵐=前兆 / 夕暮れ=ボーナス持ち越しの示唆
    if (this.zone) this.setStage('storm');
    else if (this.lcd.stage.mood === 'storm') this.setStage('day', false);
    else if (Math.random() < (c.flag.bonus && !m.noticed ? 0.3 : this.S.stageChange)) {
      this.setStage(this.lcd.stage.mood === 'day' ? (Math.random() < 0.7 ? 'sunset' : 'night') : 'day');
    }
    this.stage.shot('sail');
    if (c.zoneStart) {
      this.lcd.play('title', { lines: [{ text: '嵐の予感', size: 150, y: 300 }], dur: 0.9, sub: 'STORM IS COMING', style: 'parchment' });
      this.audio.play('title_hit'); this.haptics.vibrate('title');
      await wait(800);
    }
    switch (c.type) {
      case 'cutin':
        this.cutin(c.colors[0]);
        break;
      case 'barrels':
        this.stage.shot('barrels');
        this.audio.play('splash', { gain: 0.7 });
        for (let i = 1; i < 5; i++) this.audio.play('splash', { gain: 0.4, rate: 0.9 + i * 0.08, delay: i * 0.22 });
        this.lcd.play('telop', { text: c.outcome === 'win' && Math.random() < 0.5 ? '樽がどんどん流れてくる!!' : '樽が流れてきた', dur: 1.6, color: '#ffe8a0' });
        this.haptics.vibrate('yokokuMid');
        break;
      case 'chest':
        this.stage.shot('deck', { tint: CHEST[c.colors[0]] });
        this.audio.play('medal_out', { gain: 0.6 });
        this.lcd.play('telop', { text: '宝箱を引き揚げた!', dur: 1.4, color: '#ffe8a0' });
        this.haptics.vibrate('yokokuMid');
        break;
      case 'battle':
        this.audio.duck(0.25, 1800);
        this.audio.play('alarm', { gain: 0.8 });
        this.stage.shot('enemy');
        this.lcd.play('title', { lines: [{ text: '敵襲', size: 210, y: 300 }], dur: 0.8, sub: 'GHOST SHIP', style: 'parchment' });
        this.audio.play('title_hit', { gain: 1 });
        this.haptics.vibrate('yokokuStrong');
        this.shaker.add(0.4);
        await wait(800);
        this.lcd.play('telop', { text: '骸骨船が近づいてくる!', dur: 1.8, color: '#ffb0a0' });
        break;
      case 'final':
        this.setStage('storm', false);
        this.audio.duck(0.0, 2500);
        this.stage.shot('kraken');
        this.audio.play('splash', { gain: 1.2, rate: 0.6 });
        this.audio.play('freeze', { gain: 0.8, delay: 0.1 });
        this.lcd.play('title', { lines: [{ text: 'クラーケン', size: 150, y: 300, color: '#ffd84a' }], dur: 0.9, sub: 'FINAL BATTLE', style: 'parchment' });
        this.haptics.vibrate('yokokuStrong');
        this.shaker.add(0.7);
        this.director.bloomKick(1);
        await wait(900);
        break;
      case 'map':
        this.lcd.blackout = 1;
        this.audio.duck(0.0, 3000);
        this.audio.play('glitch', { gain: 0.6 });
        await wait(450);
        this.lcd.blackout = 0;
        this.setStage('sunset', false);
        this.stage.shot('map');
        this.cutin('rainbow', { char: 'captain', text: '伝説の宝の地図だ…!', dur: 2.6 });
        this.director.bloomKick(1.2);
        this.haptics.vibrate('notice');
        break;
      case 'freeze':
        await this.director.freeze(c.flag);
        break;
      default:
    }
  }

  // ------------------------------------------------------------
  //  第n停止 (待たせない)
  // ------------------------------------------------------------
  stop(n) {
    const c = this.cur;
    if (!c || this.machine.mode !== 'normal') return;
    const up = c.colors[n] !== c.colors[n - 1];
    switch (c.type) {
      case 'cutin':
        if (up) { this.lcd.play('flash', { dur: 0.2, alpha: 0.7 }); this.cutin(c.colors[n]); }
        break;
      case 'barrels':
        if (n === 2) { this.stage.shot('sail'); this.cutin(c.colors[2]); }
        else if (n === 3 && up) this.cutin(c.colors[3]);
        break;
      case 'chest':
        // 宝箱の色が停止ごとに昇格: 木 → 銀 → 金 → 虹
        if (CHEST[c.colors[n]] !== CHEST[c.colors[n - 1]]) {
          this.stage.chestTint(CHEST[c.colors[n]]);
          this.stage.burst(this.stage.chest.position.clone(), 80, CHEST[c.colors[n]] === 'rainbow' ? 'rainbow' : CHEST[c.colors[n]] === 'gold' ? 0xffd84a : 0xe0e8ff, 5, 0.8, -4);
          this.lcd.play('flash', { color: CHEST[c.colors[n]] === 'gold' ? '#ffd84a' : '#ffffff', dur: 0.3, alpha: 0.6 });
          this.audio.play('flash', { gain: 0.8, rate: 0.9 + n * 0.1 });
          this.lcd.play('telop', { text: { silver: '銀の宝箱に昇格!', gold: '金の宝箱に昇格!!', rainbow: '虹の宝箱!!!' }[CHEST[c.colors[n]]] || '', dur: 1.2, color: '#ffe060' });
          this.haptics.vibrate('cutin');
          this.shaker.add(0.25);
        } else this.audio.play('tick', { gain: 0.4, rate: 0.8 });
        break;
      case 'battle':
        if (n === 1) {
          this.stage.shot('cannon');
          this.audio.play('lever', { gain: 0.6, rate: 0.7 });
          this.cutin(c.colors[1], { char: 'henry', text: ['装填完了!', '弾は込めたぜ!', 'いつでも撃てる!'][Math.floor(Math.random() * 3)], dur: 1.4 });
        }
        if (n === 2) {
          this.lcd.play('lockon', { dur: 99, hold: true, cx: 1024 * 0.5, cy: 512 * 0.42 });
          this.audio.play('computer', { gain: 0.5 });
          if (up) this.cutin(c.colors[2], { dur: 1.2 });
        }
        if (n === 3) this.cutin(c.colors[3], { char: 'captain', text: COLOR_RANK.indexOf(c.colors[3]) >= 3 ? '撃てぇぇ!!' : '撃て!', dur: 1.2 });
        break;
      case 'final': {
        this.lcd.play('count', { text: ['', '3', '2', '1'][n], color: COLOR_RANK.indexOf(c.colors[n]) >= 3 ? '#ffd84a' : '#ffffff', dur: 0.9 });
        this.audio.play('splash', { gain: 0.8, rate: 0.7 + n * 0.1 });
        this.audio.play('title_hit', { rate: 0.9 + n * 0.1, gain: 0.7 });
        if (n === 2) this.stage.shot('krakenAttack');
        this.haptics.vibrate([40 * n]);
        this.shaker.add(0.15 * n);
        break;
      }
      default:
    }
  }

  // ------------------------------------------------------------
  //  決着 (精算時)。true なら告知へ
  // ------------------------------------------------------------
  async result(res) {
    const c = this.cur;
    if (!c || (this.machine.mode !== 'normal' && !res.bonusStart)) return false;
    this.lcd.kill('lockon');
    if (res.bonusStart) { this.cleanup(); this.zone = null; return false; }
    if (c.outcome === 'pending') return false;
    const win = c.outcome === 'win';
    const big = ['battle', 'final', 'chest'].includes(c.type);
    if (big) {
      this.lcd.play('telop', { text: { battle: 'ボタンで発射!', final: '最後の一撃を!', chest: 'ボタンで開けろ!' }[c.type], dur: 6, color: '#ffd84a' });
      await this.director.waitPush(win && COLOR_RANK.indexOf(c.color) >= 3 ? 2 : 1);
      this.lcd.kill('telop');
      if (win && !c.revival) await this.winScene(c.type);
      else {
        await this.loseScene(c.type);
        if (win) await this.revival(c.type);
      }
    }
    if (c.zoneEnd || (!win && big)) this.zone = null;
    if (!win) this.cleanup();
    return win;
  }

  async winScene(type) {
    if (type === 'battle') {
      this.stage.shot('fire', { hit: true });
      this.audio.play('cannon', { gain: 1.1 });
      await wait(650);
      this.stage.shot('sink');
      this.audio.play('cannon_hit', { gain: 1.2 });
      this.audio.play('explosion', { gain: 0.8 });
    } else if (type === 'final') {
      this.stage.shot('krakenWin');
      this.audio.play('explosion', { gain: 1 });
      this.audio.play('splash', { gain: 1, rate: 0.6 });
    } else {
      this.stage.shot('chestOpen', { rainbow: this.stage.tint === 'rainbow' });
      this.audio.play('medal_out', { gain: 1 });
    }
    this.director.bloomKick(1.4);
    this.shaker.add(0.7);
    this.haptics.vibrate('win');
    await wait(500);
    this.lcd.play('flash', { color: '#fff4c0', dur: 0.4 });
    this.lcd.play('result', { win: true, text: type === 'chest' ? 'お宝発見!' : '宝島発見!', sub: '', dur: 1.3 });
    this.audio.play('title_hit', { gain: 1.1, rate: 0.7 });
    if (type !== 'chest') { this.setStage('day', false); this.stage.shot('island'); }
    await wait(1000);
  }

  async loseScene(type) {
    if (type === 'battle') {
      this.stage.shot('fire', { hit: false });
      this.audio.play('cannon', { gain: 1 });
      await wait(650);
      this.stage.shot('miss');
      this.audio.play('splash', { gain: 1 });
    } else if (type === 'final') {
      this.stage.shot('krakenLose');
      this.audio.play('splash', { gain: 1, rate: 0.5 });
    } else {
      this.stage.shot('chestSkull');
      this.audio.play('lose', { gain: 0.7 });
    }
    this.haptics.vibrate('lose');
    await wait(500);
    this.lcd.play('result', { win: false, text: type === 'chest' ? 'ハズレ…' : '撤退…', dur: 1.0 });
    await wait(900);
  }

  // 逆転: 負けを見せた直後に船長が割り込む
  async revival(type) {
    this.audio.play('glitch', { gain: 0.9 });
    this.lcd.play('flash', { dur: 0.3 });
    this.cutin('rainbow', { char: 'captain', text: 'まだ終わっちゃいねえ!', dur: 1.6 });
    this.director.bloomKick(1.2);
    this.shaker.add(0.6);
    this.haptics.vibrate('notice');
    await wait(1200);
    if (type === 'chest') { this.stage.shot('deck', { tint: 'rainbow' }); await wait(200); }
    await this.winScene(type);
  }

  cleanup() {
    this.lcd.kill('lockon');
    this.stage.shot('sail');
    if (!this.zone && this.lcd.stage.mood === 'storm') this.setStage('day', false);
  }

  bonusScene(on) {
    this.zone = null;
    if (on) { this.setStage('sunset', false); this.stage.shot('party'); }
    else { this.setStage('day', false); this.stage.shot('sail'); }
  }
}
