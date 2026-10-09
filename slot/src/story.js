// =====================================================================
//  物語シナリオエンジン
//   1ゲームを「レバーON → 第1停止 → 第2停止 → 第3停止 → 結果」の5拍で進め、
//   拍ごとに演出を昇格させる。結果が「勝ち」ならボーナス告知へつなぐ。
// =====================================================================
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const COLOR_RANK = ['blue', 'green', 'red', 'gold', 'rainbow'];

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
    this.lcd.onTick = () => this.audio.play('tick', { gain: 0.25, rate: 1.3 + Math.random() * 0.2 });
    this.lcd.onWindow = () => this.audio.play('window', { gain: 0.35, rate: 0.9 + Math.random() * 0.3 });
  }

  // ------------------------------------------------------------
  //  ゲーム毎のシナリオ決定
  // ------------------------------------------------------------
  plan(flag) {
    const m = this.machine;
    const cur = { type: 'none', outcome: 'lose', flag, zoneStep: false };
    if (m.mode !== 'normal') { this.cur = cur; return cur; }
    const pendingBonus = !!flag.bonus && !m.noticed;
    // 前兆ゾーン継続中
    if (this.zone) {
      if (pendingBonus) this.zone.outcome = 'win'; // ガセ前兆中にボーナスを引いたら本物へ
      this.zone.left--;
      if (this.zone.left > 0) {
        cur.type = Math.random() < 0.55 ? 'cutin' : 'group';
        cur.outcome = 'pending';
        cur.zoneStep = true;
      } else {
        cur.type = this.zone.outcome === 'win' ? (Math.random() < 0.35 ? 'final' : 'battle') : (Math.random() < 0.12 ? 'final' : 'battle');
        cur.outcome = this.zone.outcome;
        cur.zoneEnd = true;
      }
    } else {
      let key = 'NONE';
      if (pendingBonus) key = 'BONUS';
      else if (flag.small && this.S.scenarios[flag.small]) key = flag.small;
      const table = { ...this.S.scenarios[key] };
      if (pendingBonus && !flag.newBonus) { delete table.freeze; delete table.zone; } // 持ち越し2G目以降は当該Gで決着
      cur.type = pickWeighted(table);
      cur.outcome = pendingBonus ? 'win' : 'lose';
      if (this.force !== 'auto' && (this.force !== 'girl' && this.force !== 'freeze' || pendingBonus)) cur.type = this.force;
      if (cur.type === 'zone') {
        const [a, b] = this.S.zoneLength;
        this.zone = { left: a + Math.floor(Math.random() * (b - a + 1)), outcome: cur.outcome };
        cur.type = 'cutin';
        cur.outcome = 'pending';
        cur.zoneStep = true;
        cur.zoneStart = true;
      }
    }
    // 台詞の色 (結果に応じて振り分け → 序盤は低い色から昇格させる)
    const res = cur.outcome === 'win' ? 'win' : 'lose';
    cur.color = cur.type === 'girl' ? 'rainbow' : pickWeighted(this.S.lineColor[res]);
    if (cur.outcome === 'pending') cur.color = Math.random() < 0.7 ? 'blue' : 'green';
    const finalRank = COLOR_RANK.indexOf(cur.color);
    const startRank = Math.max(0, finalRank - (finalRank >= 2 ? Math.floor(Math.random() * 3) : 0));
    cur.colors = [COLOR_RANK[startRank]];
    // 第1〜第3停止での昇格スケジュール
    let r = startRank;
    for (let s = 1; s <= 3; s++) {
      if (r < finalRank && (Math.random() < 0.55 || s === 3)) r++;
      cur.colors.push(COLOR_RANK[Math.min(r, finalRank)]);
    }
    cur.colors[3] = cur.color;
    cur.revival = cur.outcome === 'win' && Math.random() < this.S.revival && ['battle', 'final', 'caution'].includes(cur.type);
    this.cur = cur;
    return cur;
  }

  line(color) {
    const pool = this.S.lines[color] || this.S.lines.blue;
    const [char, text] = pool[Math.floor(Math.random() * pool.length)];
    return { char, text };
  }

  cutin(color, opts = {}) {
    const l = opts.char ? { char: opts.char, text: opts.text } : this.line(color);
    this.lcd.play('cutin', { char: l.char, text: l.text, color, dur: opts.dur ?? 2.4 });
    this.audio.play('cutin', { gain: 0.7, rate: color === 'gold' ? 0.85 : 1 });
    if (COLOR_RANK.indexOf(color) >= 2) this.audio.play('title_hit', { gain: 0.5, rate: 1.4 });
    this.haptics.vibrate('cutin');
    if (color === 'gold' || color === 'rainbow') { this.director.bloomKick(0.8); this.shaker.add(0.3); }
  }

  setStage(mood) {
    const names = { night: '夜間警戒', command: '司令室', alert: '警戒態勢', battle: '迎撃戦', final: '最終決戦' };
    if (this.lcd.stage.mood === mood) return;
    this.lcd.stage = { name: names[mood] || '', mood };
    this.stage.setMood(mood === 'battle' ? 'battle' : mood);
    if (mood === 'command' || mood === 'alert') {
      this.lcd.play('flash', { color: mood === 'alert' ? '#ff0000' : '#00ffd0', dur: 0.4, alpha: 0.6 });
      this.audio.play(mood === 'alert' ? 'siren' : 'computer', { gain: 0.6 });
      this.lcd.play('telop', { text: mood === 'alert' ? '警戒態勢へ移行' : '司令室へ', dur: 1.6, color: mood === 'alert' ? '#ff6a6a' : '#7fffe8' });
    }
  }

  // ------------------------------------------------------------
  //  レバーON (await で演出が終わるまでリール始動を待たせる)
  // ------------------------------------------------------------
  async lever() {
    const c = this.cur, m = this.machine;
    if (!c || m.mode !== 'normal') return;
    // ステージ
    if (this.zone) this.setStage('alert');
    else if (this.lcd.stage.mood === 'alert') this.setStage('night');
    else if (Math.random() < (c.flag.bonus && !m.noticed ? 0.3 : this.S.stageChange)) this.setStage(this.lcd.stage.mood === 'command' ? 'night' : 'command');
    if (c.zoneStart) {
      this.lcd.play('title', { lines: [{ text: '前兆', size: 190, y: 300 }, { text: '侵蝕体、観測圏内に侵入', size: 34, y: 380, x: 76, squash: 1 }], dur: 1.3, sub: 'PRELUDE' });
      this.audio.play('title_hit'); this.haptics.vibrate('title');
      await wait(1300);
    }
    switch (c.type) {
      case 'cutin':
        this.cutin(c.colors[0]);
        break;
      case 'group':
        this.lcd.play('windows', { color: c.outcome === 'win' && Math.random() < 0.6 ? 'red' : 'yellow', count: 12, rate: 14, dur: 2.0 });
        this.audio.play('alarm', { gain: 0.5 });
        this.haptics.vibrate('yokokuMid');
        this.shaker.add(0.2);
        break;
      case 'caution':
        this.lcd.play('band', { level: 'caution', dur: 99, hold: true });
        this.audio.play('alarm', { gain: 0.7 });
        this.haptics.vibrate('yokokuMid');
        break;
      case 'battle':
        this.setStage('battle');
        this.audio.duck(0.2, 2500);
        this.audio.play('siren', { gain: 0.8 });
        this.lcd.play('title', { lines: [{ text: '迎撃', size: 210, y: 290 }, { text: '侵蝕体、第七防衛線へ', size: 40, y: 380, x: 78, squash: 1 }], dur: 1.5, sub: 'OPERATION : INTERCEPT' });
        this.audio.play('title_hit', { gain: 1 });
        this.haptics.vibrate('yokokuStrong');
        this.shaker.add(0.5);
        await wait(1400);
        this.stage.shot('approach');
        this.lcd.play('telop', { text: '目標、市街地へ侵攻中', dur: 2.2, color: '#ff8a8a' });
        break;
      case 'final':
        this.lcd.blackout = 1;
        this.audio.duck(0.0, 3000);
        await wait(500);
        this.lcd.blackout = 0;
        this.setStage('final');
        this.audio.play('siren', { gain: 1 });
        this.lcd.play('title', { lines: [{ text: '最終決戦', size: 170, y: 300, color: '#ffd84a' }], dur: 1.6, sub: 'FINAL OPERATION' });
        this.audio.play('title_hit', { gain: 1.2, rate: 0.8 });
        this.haptics.vibrate('yokokuStrong');
        this.shaker.add(0.7);
        this.director.bloomKick(1);
        await wait(1500);
        this.stage.shot('final');
        break;
      case 'girl':
        this.lcd.blackout = 1;
        this.audio.duck(0.0, 3500);
        this.audio.play('glitch', { gain: 0.8 });
        await wait(700);
        this.lcd.blackout = 0;
        this.lcd.play('static', { dur: 0.4, alpha: 0.8 });
        this.cutin('rainbow', { char: 'girl', text: '…来るよ', dur: 3 });
        this.lcd.play('band', { level: 'rainbow', dur: 99, hold: true });
        this.director.bloomKick(1.2);
        this.haptics.vibrate('notice');
        await wait(600);
        break;
      case 'freeze':
        await this.director.freeze(c.flag);
        break;
      default:
    }
  }

  // ------------------------------------------------------------
  //  第n停止 (非同期で演出だけ進める)
  // ------------------------------------------------------------
  stop(n) {
    const c = this.cur;
    if (!c || this.machine.mode !== 'normal') return;
    const up = c.colors[n] !== c.colors[n - 1];
    switch (c.type) {
      case 'cutin':
        if (up) { this.lcd.play('flash', { dur: 0.25, alpha: 0.8 }); this.cutin(c.colors[n]); }
        break;
      case 'group':
        if (n === 2) this.cutin(c.colors[2]);
        else if (n === 3 && up) this.cutin(c.colors[3]);
        break;
      case 'caution':
        if (n === 1 && (c.outcome === 'win' ? Math.random() < 0.75 : Math.random() < 0.25)) {
          c.emergency = true;
          this.lcd.play('band', { level: 'emergency', dur: 99, hold: true });
          this.audio.play('siren', { gain: 0.8 });
          this.haptics.vibrate('yokokuStrong');
          this.shaker.add(0.35);
        }
        if (n === 2) {
          this.lcd.play('title', c.emergency
            ? { lines: [{ text: '第七防衛線', size: 130, y: 250 }, { text: '突破', size: 170, y: 430, color: '#ff3030' }], dur: 1.4, sub: 'LINE 7 : BREACHED' }
            : { lines: [{ text: '接近', size: 200, y: 300 }], dur: 1.2, sub: 'CONTACT' });
          this.audio.play('title_hit');
          this.haptics.vibrate('title');
        }
        if (n === 3) this.cutin(c.colors[3], { dur: 1.6 });
        break;
      case 'battle':
        if (n === 1) {
          this.stage.shot('launch');
          this.audio.play('hangar', { gain: 0.8 }); this.audio.play('launch', { gain: 0.8, delay: 0.2 });
          this.cutin(c.colors[1], this.line(c.colors[1]).char === 'pilot' ? {} : { char: 'pilot', text: ['出撃します', '行きます!', '準備完了'][Math.floor(Math.random() * 3)] });
          this.shaker.add(0.3);
        }
        if (n === 2) {
          this.stage.shot('faceoff');
          setTimeout(() => { this.stage.shot('lock'); this.lcd.play('lockon', { dur: 99, hold: true }); this.audio.play('computer', { gain: 0.6 }); }, 500);
          if (up) this.cutin(c.colors[2], { dur: 1.4 });
        }
        if (n === 3) {
          this.lcd.kill('lockon');
          this.stage.shot('strike');
          this.audio.play('beam', { gain: 1 });
          this.cutin(c.colors[3], { dur: 1.2 });
          this.shaker.add(0.4);
        }
        break;
      case 'final': {
        const num = ['', '3', '2', '1'][n];
        this.lcd.play('count', { text: num, color: COLOR_RANK.indexOf(c.colors[n]) >= 3 ? '#ffd84a' : '#ffffff', dur: 1.0 });
        this.audio.play('title_hit', { rate: 0.9 + n * 0.1 });
        this.haptics.vibrate([40 * n]);
        this.shaker.add(0.15 * n);
        if (n === 3) { this.stage.shot('strike'); this.audio.play('beam'); }
        break;
      }
      default:
    }
  }

  // ------------------------------------------------------------
  //  決着 (精算時に await)。true を返すと告知へ
  // ------------------------------------------------------------
  async result(res) {
    const c = this.cur;
    if (!c || this.machine.mode !== 'normal' && !res.bonusStart) return false;
    this.lcd.kill('lockon');
    if (res.bonusStart) { this.cleanup(); this.zone = null; return false; } // 目押しで先に揃えた
    if (c.outcome === 'pending') return false;
    const win = c.outcome === 'win';
    let shown = false;
    if (c.type === 'battle' || c.type === 'final') {
      shown = true;
      if (win && !c.revival) await this.winScene();
      else {
        await this.loseScene();
        if (win) await this.revival();
      }
    } else if (c.type === 'caution') {
      shown = true;
      if (win && !c.revival) await this.winCard();
      else {
        this.lcd.play('result', { win: false, text: '撤退', dur: 1.2 });
        this.audio.play('lose', { gain: 0.7 });
        await wait(1100);
        if (win) await this.revival();
      }
    }
    if (c.zoneEnd || (!win && shown)) this.zone = null;
    if (!win) this.cleanup();
    return win;
  }

  async winScene() {
    this.stage.shot('enemyDie');
    this.audio.play('explosion', { gain: 1.2 });
    this.director.bloomKick(1.5);
    this.shaker.add(0.8);
    this.haptics.vibrate('win');
    await wait(700);
    await this.winCard();
  }

  async winCard() {
    this.lcd.play('flash', { dur: 0.4 });
    this.lcd.play('result', { win: true, text: '迎撃成功', sub: 'MISSION COMPLETE', dur: 1.8 });
    this.audio.play('title_hit', { gain: 1.2, rate: 0.7 });
    await wait(1200);
    this.cleanup();
  }

  async loseScene() {
    this.stage.shot('mechDown');
    this.audio.play('explosion', { gain: 0.6, rate: 0.7 });
    this.audio.play('lose', { gain: 0.8, delay: 0.4 });
    this.haptics.vibrate('lose');
    await wait(800);
    this.lcd.play('static', { dur: 1.0, alpha: 0.5 });
    this.lcd.play('result', { win: false, text: '撤退', sub: '機体損傷。帰投する', dur: 1.4 });
    await wait(1300);
  }

  // 逆転: 一度負けを見せてから謎の少女が割り込む
  async revival() {
    this.audio.play('glitch', { gain: 1 });
    this.lcd.play('static', { dur: 0.6, alpha: 0.9 });
    this.lcd.blackout = 1;
    await wait(500);
    this.lcd.blackout = 0;
    this.cutin('rainbow', { char: 'girl', text: 'まだ…終わってない', dur: 2.2 });
    this.director.bloomKick(1.2);
    this.shaker.add(0.6);
    this.haptics.vibrate('notice');
    await wait(1700);
    this.stage.shot('enemyDie');
    this.audio.play('explosion', { gain: 1.2 });
    await wait(500);
    await this.winCard();
  }

  cleanup() {
    this.lcd.kill('band');
    this.lcd.kill('lockon');
    this.stage.shot('city');
    if (!this.zone && ['battle', 'final'].includes(this.lcd.stage.mood)) this.setStage('night');
  }

  // ボーナス中 / 終了
  bonusScene(on) {
    this.zone = null;
    this.lcd.kill('band');
    if (on) { this.stage.setMood('night'); this.stage.shot('victory'); }
    else { this.setStage('night'); this.stage.shot('city'); }
  }
}
