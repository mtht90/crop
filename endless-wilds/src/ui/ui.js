// 画面(DOM)とHUDの描画
import { WEAPONS, PASSIVES, RELICS, HEROES, SHOP, ACHIEVEMENTS } from '../game/data.js';
import { BIOMES, CHUNK } from '../world/world.js';
import { fmtTime, fmtNum, clamp } from '../core/util.js';
import { writeSave, resetSave } from '../meta/save.js';
import { CREDITS_HTML } from './credits.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const iconHtml = (icon, color, cls = 'icon') => `<div class="${cls}" style="background:linear-gradient(160deg, ${color}, ${shade(color, -0.45)})">${esc(icon)}</div>`;
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r * (1 + f)); g = Math.round(g * (1 + f)); b = Math.round(b * (1 + f));
  return `rgb(${clamp(r, 0, 255)},${clamp(g, 0, 255)},${clamp(b, 0, 255)})`;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.screens = $('screens');
    this.stack = [];
    this.keyHandler = null;
    this.bannerT = 0;
    this.lastCombo = 0;
    this.mm = $('minimap').getContext('2d');
    this.fx2d = $('fx2d').getContext('2d');
    addEventListener('keydown', (e) => { if (this.keyHandler) this.keyHandler(e); });
    $('pausebtn').addEventListener('click', () => this.app.togglePause());
  }
  get game() { return this.app.game; }
  get save() { return this.app.save; }
  sfx(n) { this.app.audio.play(n); }

  clear() { this.screens.innerHTML = ''; this.keyHandler = null; }
  show(html, { id = '', dim = true } = {}) {
    this.clear();
    const d = document.createElement('div');
    d.className = 'screen' + (dim ? ' dim' : '');
    d.id = id;
    d.innerHTML = html;
    this.screens.appendChild(d);
    d.querySelectorAll('button').forEach((b) => b.addEventListener('pointerenter', () => this.sfx('hover')));
    return d;
  }
  bind(root, sel, fn) { root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => { this.sfx('ui'); fn(el, e); })); }

  // ===== タイトル =====
  title() {
    $('hud').classList.add('hidden');
    const s = this.save;
    const d = this.show(`
      <div>
        <div class="logo"><div class="jp">果てなき荒野</div><div class="en">ENDLESS WILDS</div></div>
        <div class="menu">
          <button class="btn big gold" data-a="play">冒険に出る</button>
          <button class="btn" data-a="shop">恒久強化</button>
          <button class="btn" data-a="ach">実績・記録</button>
          <button class="btn ghost" data-a="help">遊び方</button>
          <button class="btn ghost" data-a="settings">設定</button>
          <button class="btn ghost" data-a="credits">素材とライセンス</button>
        </div>
        <div class="gold-line">● ${fmtNum(s.gold)} G</div>
        <div class="hint">最高記録 ${fmtTime(s.best.time)} / 撃破 ${fmtNum(s.best.kills)} / Lv ${s.best.level}</div>
      </div>`, { id: 'title', dim: false });
    this.bind(d, '[data-a]', (el) => {
      const a = el.dataset.a;
      if (a === 'play') this.heroSelect();
      if (a === 'shop') this.shop();
      if (a === 'ach') this.achievements();
      if (a === 'help') this.help(() => this.title());
      if (a === 'settings') this.settings(() => this.title());
      if (a === 'credits') this.credits();
    });
    this.keyHandler = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.heroSelect(); } };
  }
  heroSelect() {
    const s = this.save;
    const ids = Object.keys(HEROES);
    let sel = ids.indexOf(s.lastHero);
    if (sel < 0) sel = 0;
    const locked = (id) => HEROES[id].unlock && !s.unlocks[HEROES[id].unlock];
    const d = this.show(`<div class="panel"><h2>冒険者を選ぶ</h2><div class="heroes">${ids.map((id, i) => {
      const h = HEROES[id], w = WEAPONS[h.weapon];
      const lockText = locked(id) ? ACHIEVEMENTS.find((a) => a.unlock === h.unlock) : null;
      return `<button class="card hero ${locked(id) ? 'locked' : ''}" data-id="${id}" style="animation-delay:${i * 0.05}s">
        <div class="head">${iconHtml(w.icon, w.color)}<div><div class="name">${esc(h.name)}</div><div class="kind">初期武器:${esc(w.name)}</div></div></div>
        <div class="desc">${locked(id) ? '🔒 ' + esc(lockText ? lockText.desc + 'で解放' : '未解放') : esc(h.desc)}</div>
        ${locked(id) ? '' : `<div class="perk">${esc(h.perk)}</div>`}
      </button>`;
    }).join('')}</div><div class="actions"><button class="btn ghost" data-back>戻る</button></div></div>`);
    const go = (id) => { if (locked(id)) return; s.lastHero = id; writeSave(s); this.app.startRun(id); };
    this.bind(d, '.hero', (el) => go(el.dataset.id));
    this.bind(d, '[data-back]', () => this.title());
    const cards = [...d.querySelectorAll('.hero')];
    const mark = () => cards.forEach((c, i) => c.classList.toggle('sel', i === sel));
    mark();
    this.keyHandler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'd') { sel = (sel + 1) % ids.length; mark(); }
      if (e.key === 'ArrowLeft' || e.key === 'a') { sel = (sel + ids.length - 1) % ids.length; mark(); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(ids[sel]); }
      if (e.key === 'Escape') this.title();
    };
  }

  // ===== レベルアップ =====
  levelUp(onDone) {
    const g = this.game;
    let choices = g.rollChoices();
    const render = () => {
      const d = this.show(`<div class="panel" style="max-width:1000px">
        <div class="lvtitle"><div class="t">LEVEL UP!</div><div class="s">Lv ${g.player.level - g.pendingLevels + 1} — 強化をひとつ選ぶ</div></div>
        <div class="cards">${choices.map((c, i) => `
          <button class="card" data-i="${i}" style="animation-delay:${i * 0.06}s">
            ${c.isNew ? '<div class="badge">NEW</div>' : ''}
            ${g.banishes > 0 && c.type !== 'gold' && c.type !== 'heal' ? `<span class="bkey" data-ban="${i}">除外</span>` : ''}
            <div class="head">${iconHtml(c.icon, c.color)}<div><div class="kind">${esc(c.kind)}</div><div class="name">${esc(c.name)}</div>${c.lv ? `<div class="lv">${c.isNew ? '新規' : 'Lv ' + (c.lv - 1) + ' → ' + c.lv}</div>` : ''}</div></div>
            <div class="desc">${esc(c.desc)}</div>
            ${c.hint ? `<div class="hint">★ ${esc(c.hint)}</div>` : ''}
            <div class="key">${i + 1}</div>
          </button>`).join('')}</div>
        <div class="actions">
          <button class="btn ghost" data-reroll ${g.rerolls > 0 ? '' : 'disabled'}>引き直す(残り${g.rerolls})[R]</button>
          <button class="btn ghost" data-skip>見送る(+経験値)</button>
        </div></div>`);
      const pickIt = (i) => { if (!choices[i]) return; g.applyChoice(choices[i]); onDone(); };
      d.querySelectorAll('.card').forEach((el) => el.addEventListener('click', (e) => {
        if (e.target.dataset.ban !== undefined) { this.sfx('ui'); g.banish(choices[+e.target.dataset.ban]); choices = g.rollChoices(); render(); return; }
        pickIt(+el.dataset.i);
      }));
      d.querySelectorAll('.card').forEach((b) => b.addEventListener('pointerenter', () => this.sfx('hover')));
      this.bind(d, '[data-reroll]', () => { if (g.rerolls <= 0) return; g.rerolls--; choices = g.rollChoices(); render(); });
      this.bind(d, '[data-skip]', () => { g.player.xp += g.player.xpNeed * 0.25; onDone(); });
      let sel = -1;
      const cards = [...d.querySelectorAll('.card')];
      this.keyHandler = (e) => {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= choices.length) { pickIt(n - 1); return; }
        if ((e.key === 'r' || e.key === 'R') && g.rerolls > 0) { g.rerolls--; choices = g.rollChoices(); render(); this.sfx('ui'); }
        if (['ArrowRight', 'ArrowDown', 'd', 's'].includes(e.key)) { sel = (sel + 1) % cards.length; cards.forEach((c, i) => c.classList.toggle('sel', i === sel)); this.sfx('hover'); }
        if (['ArrowLeft', 'ArrowUp', 'a', 'w'].includes(e.key)) { sel = (sel + cards.length - 1) % cards.length; cards.forEach((c, i) => c.classList.toggle('sel', i === sel)); this.sfx('hover'); }
        if ((e.key === 'Enter' || e.key === ' ') && sel >= 0) { e.preventDefault(); pickIt(sel); }
      };
      this.padSelect = { count: cards.length, pick: pickIt, cards };
    };
    render();
  }

  chest(rewards, gold, onDone) {
    this.sfx('chest');
    const d = this.show(`<div class="panel" style="max-width:760px;text-align:center"><h2>宝箱</h2><div class="chestbox">🎁</div><div class="chest-items"></div><div class="actions"></div></div>`);
    const box = d.querySelector('.chestbox'), items = d.querySelector('.chest-items'), act = d.querySelector('.actions');
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      box.remove();
      items.innerHTML = rewards.map((r, i) => `<div class="chest-item ${r.evolve ? 'evolve' : ''}" style="animation-delay:${i * 0.18}s">${iconHtml(r.icon, r.color)}<div class="nm">${esc(r.name)}</div><div class="ds">${esc(r.desc)}</div></div>`).join('') +
        `<div class="chest-item" style="animation-delay:${rewards.length * 0.18}s">${iconHtml('金', '#ffd24a')}<div class="nm">+${gold} G</div></div>`;
      if (rewards.some((r) => r.evolve)) setTimeout(() => this.sfx('evolve'), 200);
      act.innerHTML = `<button class="btn gold big" data-ok>受け取る</button>`;
      this.bind(act, '[data-ok]', onDone);
      setTimeout(() => { this.keyHandler = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); onDone(); } }; }, 250);
    };
    const t = setTimeout(finish, 900);
    d.addEventListener('click', () => { if (!done) { clearTimeout(t); finish(); } }, { once: true });
    this.keyHandler = () => { clearTimeout(t); finish(); };
  }
  pickList(title, sub, opts, onPick, cls = 'relic') {
    const d = this.show(`<div class="panel" style="max-width:1000px">
      <div class="lvtitle"><div class="t" style="background:linear-gradient(180deg,#fff,#ffd24a);-webkit-background-clip:text;background-clip:text">${esc(title)}</div><div class="s">${esc(sub)}</div></div>
      <div class="cards">${opts.map((o, i) => `<button class="card ${cls}" data-i="${i}" style="animation-delay:${i * 0.07}s">
        <div class="head">${iconHtml(o.icon, o.color)}<div><div class="name">${esc(o.name)}</div></div></div>
        <div class="desc">${esc(o.desc)}</div><div class="key">${i + 1}</div></button>`).join('')}</div></div>`);
    this.bind(d, '.card', (el) => onPick(opts[+el.dataset.i]));
    this.keyHandler = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= opts.length) onPick(opts[n - 1]); };
    this.padSelect = { count: opts.length, pick: (i) => onPick(opts[i]), cards: [...d.querySelectorAll('.card')] };
  }

  pause() {
    const g = this.game;
    const s = g.stats;
    const d = this.show(`<div class="panel" style="max-width:640px"><h2>一時停止</h2>
      <div class="help" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:13px">
        <div>ダメージ ×${(s.might * g.dmgMul).toFixed(2)}</div><div>攻撃間隔 ×${s.cooldown.toFixed(2)}</div>
        <div>範囲 ×${s.area.toFixed(2)}</div><div>弾数 +${s.amount}</div>
        <div>移動速度 ×${s.move.toFixed(2)}</div><div>会心率 ${Math.round(s.crit * 100)}%</div>
        <div>防御 ${s.armor}</div><div>回復 ${s.regen.toFixed(1)}/秒</div>
      </div>
      <div style="margin:12px 0 4px;font-weight:900">秘宝</div>
      <div style="font-size:13px;color:var(--dim)">${g.player.relics.length ? g.player.relics.map((r) => `<div>【${esc(RELICS[r].name)}】${esc(RELICS[r].desc)}</div>`).join('') : 'なし'}</div>
      <div class="actions"><button class="btn gold" data-a="resume">再開</button><button class="btn ghost" data-a="settings">設定</button><button class="btn ghost" data-a="help">遊び方</button><button class="btn ghost" data-a="quit">あきらめる</button></div></div>`);
    this.bind(d, '[data-a]', (el) => {
      const a = el.dataset.a;
      if (a === 'resume') this.app.togglePause(false);
      if (a === 'settings') this.settings(() => this.pause());
      if (a === 'help') this.help(() => this.pause());
      if (a === 'quit') { this.app.paused = false; this.clear(); g.endRun(false); }
    });
    this.keyHandler = (e) => { if (e.key === 'Escape' || e.key === 'p') this.app.togglePause(false); };
  }

  result(run, info) {
    const won = run.won;
    const dmg = Object.entries(run.dmg).filter(([k]) => WEAPONS[k] || ['chain', 'blast', 'thunderRelic', 'gale', 'overload', 'explode', 'burn'].includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxD = dmg.length ? dmg[0][1] : 1;
    const nm = (k) => (WEAPONS[k] ? WEAPONS[k].name : { chain: '連鎖爆発', blast: '大爆発', thunderRelic: '雷鳴の指輪', gale: '疾風', overload: '過剰詠唱', explode: '爆発', burn: '炎上' }[k]);
    const col = (k) => (WEAPONS[k] ? WEAPONS[k].color : '#ff9a3c');
    const next = ACHIEVEMENTS.filter((a) => !this.save.achievements[a.id]).sort((a, b) => (b.unlock ? 1 : 0) - (a.unlock ? 1 : 0)).slice(0, 2);
    const cell = (label, v, rec) => `<div class="cell ${rec ? 'rec' : ''}"><b>${v}</b><span>${label}</span></div>`;
    const d = this.show(`<div class="panel result" style="max-width:760px">
      <div class="rtitle" style="color:${won ? '#ffd24a' : '#ff7a8a'}">${won ? '世界を救った!' : '力尽きた…'}</div>
      <div style="text-align:center;color:var(--dim)">${esc(HEROES[this.game.heroId].name)}</div>
      <div class="grid">
        ${cell('生存時間', fmtTime(run.time), info.rec.time)}${cell('撃破数', fmtNum(run.kills), info.rec.kills)}${cell('レベル', run.level, info.rec.level)}
        ${cell('獲得ゴールド', '+' + fmtNum(info.gold), false)}${cell('最大コンボ', fmtNum(run.maxCombo), false)}${cell('封印塔', run.seals + '/3', false)}
      </div>
      ${info.unlocked.map((a) => `<div class="unlock-new">🏆 実績「${esc(a.name)}」達成 — ${esc(a.unlockText)}</div>`).join('')}
      ${next.length ? `<div style="font-weight:900;margin:8px 0">次の目標</div>${next.map((a) => `<div class="ach" style="padding:6px 4px">${iconHtml('?', '#5a4a8a')}<div><div style="font-weight:900">${esc(a.name)}</div><div class="ds">${esc(a.desc)}</div></div><div class="rw">${esc(a.unlockText)}</div></div>`).join('')}` : ''}
      <div style="font-weight:900;margin:8px 0">与えたダメージ</div>
      ${dmg.map(([k, v]) => `<div class="dmgrow"><div style="width:90px">${esc(nm(k))}</div><div class="bar"><i style="width:${(v / maxD) * 100}%;background:${col(k)}"></i></div><div class="v">${fmtNum(v)}</div></div>`).join('')}
      <div class="actions"><button class="btn gold big" data-a="again">もう一度</button><button class="btn" data-a="shop">強化する</button><button class="btn ghost" data-a="title">タイトルへ</button></div></div>`);
    this.bind(d, '[data-a]', (el) => {
      const a = el.dataset.a;
      if (a === 'again') this.app.startRun(this.game.heroId);
      if (a === 'shop') this.shop(() => this.app.toTitle());
      if (a === 'title') this.app.toTitle();
    });
    this.keyHandler = (e) => { if (e.key === 'Enter') this.app.startRun(this.game.heroId); };
  }

  shop(back) {
    const s = this.save;
    const render = () => {
      const d = this.show(`<div class="panel"><h2>恒久強化</h2><div class="topgold">● ${fmtNum(s.gold)} G</div>
        <div class="shop">${SHOP.map((it) => {
          const lv = s.shop[it.id] || 0;
          const max = lv >= it.max;
          const cost = Math.round(it.cost * (1 + lv * 0.6));
          return `<button class="shopitem ${max ? 'max' : s.gold < cost ? 'poor' : ''}" data-id="${it.id}">${iconHtml(it.icon, '#7a5af0')}
            <div><div class="nm">${esc(it.name)}</div><div class="ds">${esc(it.desc)}</div><div class="pips">${Array.from({ length: it.max }, (_, i) => `<div class="pip ${i < lv ? 'on' : ''}"></div>`).join('')}</div></div>
            <div class="cost">${max ? 'MAX' : cost + 'G'}</div></button>`;
        }).join('')}</div>
        <div class="actions"><button class="btn ghost" data-refund>振り直し(全額返金)</button><button class="btn" data-back>戻る</button></div></div>`);
      this.bind(d, '.shopitem', (el) => {
        const it = SHOP.find((x) => x.id === el.dataset.id);
        const lv = s.shop[it.id] || 0;
        const cost = Math.round(it.cost * (1 + lv * 0.6));
        if (lv >= it.max || s.gold < cost) return;
        s.gold -= cost; s.shop[it.id] = lv + 1; writeSave(s);
        this.sfx('pick');
        render();
      });
      this.bind(d, '[data-refund]', () => {
        let back2 = 0;
        for (const it of SHOP) { const lv = s.shop[it.id] || 0; for (let i = 0; i < lv; i++) back2 += Math.round(it.cost * (1 + i * 0.6)); }
        s.gold += back2; s.shop = {}; writeSave(s); render();
      });
      this.bind(d, '[data-back]', () => (back ? back() : this.title()));
      this.keyHandler = (e) => { if (e.key === 'Escape') (back ? back() : this.title()); };
    };
    render();
  }
  achievements() {
    const s = this.save;
    const d = this.show(`<div class="panel" style="max-width:720px"><h2>実績・記録</h2>
      <div class="help" style="text-align:center;margin-bottom:10px">最長生存 ${fmtTime(s.best.time)} ・ 最多撃破 ${fmtNum(s.best.kills)} ・ 最高Lv ${s.best.level}<br>累計撃破 ${fmtNum(s.totalKills)} ・ 冒険 ${s.totalRuns}回 ・ ボス撃破 ${s.totalBosses} ・ 勝利 ${s.totalWins}</div>
      ${ACHIEVEMENTS.map((a) => `<div class="ach ${s.achievements[a.id] ? '' : 'locked'}">${iconHtml(s.achievements[a.id] ? '✓' : '?', s.achievements[a.id] ? '#ffd24a' : '#555')}<div><div style="font-weight:900">${esc(a.name)}</div><div class="ds">${esc(a.desc)}</div></div><div class="rw">${esc(a.unlockText)}</div></div>`).join('')}
      <div class="actions"><button class="btn" data-back>戻る</button></div></div>`);
    this.bind(d, '[data-back]', () => this.title());
    this.keyHandler = (e) => { if (e.key === 'Escape') this.title(); };
  }
  help(back) {
    const d = this.show(`<div class="panel help" style="max-width:720px"><h2>遊び方</h2>
      <p><b>移動するだけ。攻撃は自動。</b>押し寄せる魔物を倒し、経験値の結晶を拾ってレベルを上げ、強化を選んでいきます。</p>
      <p>操作:<kbd>WASD</kbd>/<kbd>矢印</kbd>で移動、<kbd>Space</kbd>/<kbd>Shift</kbd>でダッシュ(無敵)、<kbd>Esc</kbd>で一時停止。レベルアップは<kbd>1</kbd>〜<kbd>4</kbd>で選択、<kbd>R</kbd>で引き直し。スマホは画面をなぞって移動、右下ボタンでダッシュ。ゲームパッドにも対応。</p>
      <p><b>目的:</b>世界のどこかにある <span style="color:#ffcc33">3つの封印塔</span>(金色の光の柱)を探し、守護者を倒して塔を壊すこと。3つ壊すと <b>虚ろの王</b> が現れます。20分経つと、塔が残っていても王は目覚めます。</p>
      <p><b>探索:</b>世界は区切りなく続きます。中心から遠いほど魔物は強く、見返りも大きくなります。宝箱・祠(青い光)・呪いの石碑(赤い光)・癒しの泉・木箱や壺を見つけましょう。</p>
      <p><b>進化:</b>武器をLv8にして、対応するパッシブを持った状態で宝箱を開けると武器が進化します。選択肢の「★」が目印です。</p>
      <p><b>コンボとフィーバー:</b>倒し続けるとコンボで経験値が最大1.5倍。画面上部のゲージが満ちるとフィーバー:攻撃速度2倍・ダメージ増・ゴールドの雨。</p>
      <p><b>血月の夜:</b>およそ5分ごとに夜が来て、魔物が急増します。経験値は1.5倍。</p>
      <p>手に入れたゴールドは「恒久強化」で次の冒険に持ち越せます。実績を達成すると新しい冒険者や武器が解放されます。</p>
      <div class="actions"><button class="btn" data-back>戻る</button></div></div>`);
    this.bind(d, '[data-back]', back);
    this.keyHandler = (e) => { if (e.key === 'Escape') back(); };
  }
  settings(back) {
    const s = this.save.settings;
    const d = this.show(`<div class="panel settings" style="max-width:520px"><h2>設定</h2>
      <label>全体音量<input type="range" min="0" max="1" step="0.05" data-k="master" value="${s.master}"></label>
      <label>効果音<input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${s.sfx}"></label>
      <label>BGM<input type="range" min="0" max="1" step="0.05" data-k="bgm" value="${s.bgm}"></label>
      <label>画質<select data-k="quality"><option value="high">高(光の演出あり)</option><option value="mid">中</option><option value="low">低(軽量)</option></select></label>
      <label><input type="checkbox" data-k="shake" ${s.shake ? 'checked' : ''}> 画面の揺れ</label>
      <label><input type="checkbox" data-k="numbers" ${s.numbers ? 'checked' : ''}> ダメージ数字を表示</label>
      <div class="actions"><button class="btn ghost" data-reset>セーブデータ消去</button><button class="btn" data-back>戻る</button></div></div>`);
    d.querySelector('select').value = s.quality;
    d.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', () => {
      const k = el.dataset.k;
      s[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
      this.app.applySettings();
      writeSave(this.save);
    }));
    const rb = d.querySelector('[data-reset]');
    rb.addEventListener('click', () => {
      if (rb.dataset.sure) { this.app.save = resetSave(); writeSave(this.app.save); this.app.applySettings(); rb.textContent = '消去しました'; delete rb.dataset.sure; }
      else { rb.dataset.sure = '1'; rb.textContent = 'もう一度押すと消去'; }
    });
    this.bind(d, '[data-back]', back);
    this.keyHandler = (e) => { if (e.key === 'Escape') back(); };
  }
  credits() {
    const d = this.show(`<div class="panel credits" style="max-width:820px"><h2>素材とライセンス</h2>${CREDITS_HTML}<div class="actions"><button class="btn" data-back>戻る</button></div></div>`);
    this.bind(d, '[data-back]', () => this.title());
    this.keyHandler = (e) => { if (e.key === 'Escape') this.title(); };
  }

  // ===== HUD =====
  hudStart() {
    $('hud').classList.remove('hidden');
    $('bossbar').classList.add('hidden');
    $('combo').classList.add('hidden');
    $('fever-frame').classList.remove('on');
    $('feverbar').classList.remove('on');
    this.inventory();
  }
  inventory() {
    const g = this.game;
    if (!g || !g.player) return;
    const p = g.player;
    const ev = new Set(g.evolvable().map((w) => w.id));
    $('slots-w').innerHTML = p.weapons.map((w) => { const d = WEAPONS[w.id]; return `<div class="slot ${d.evolved ? 'evo' : ''} ${ev.has(w.id) ? 'ready' : ''}" style="background:linear-gradient(160deg, ${d.color}, ${shade(d.color, -0.5)})">${esc(d.icon)}<i>${d.evolved ? '★' : w.lv}</i></div>`; }).join('');
    $('slots-p').innerHTML = Object.entries(p.passives).map(([id, lv]) => { const d = PASSIVES[id]; return `<div class="slot" style="background:linear-gradient(160deg, ${d.color}, ${shade(d.color, -0.5)})">${esc(d.icon)}<i>${lv}</i></div>`; }).join('');
    $('slots-r').innerHTML = p.relics.map((id) => { const d = RELICS[id]; return `<div class="slot" title="${esc(d.name)}" style="background:linear-gradient(160deg, ${d.color}, ${shade(d.color, -0.5)})">${esc(d.icon)}</div>`; }).join('');
  }
  banner(t, s) {
    $('banner-t').textContent = t;
    $('banner-s').textContent = s || '';
    const b = $('banner');
    b.classList.add('on');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => b.classList.remove('on'), 2600);
  }
  toast(text, color = '#fff') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.color = color;
    t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2300);
  }
  hurtFlash() {
    const v = $('vignette');
    v.classList.add('hurt');
    clearTimeout(this._ht);
    this._ht = setTimeout(() => v.classList.remove('hurt'), 160);
  }
  fever(on) {
    $('fever-frame').classList.toggle('on', on);
    $('feverbar').classList.toggle('on', on);
    if (on) this.banner('FEVER!!', '攻撃速度2倍・ダメージ増・ゴールドの雨');
  }
  boss(b) {
    this.bossRef = b;
    $('bossbar').classList.toggle('hidden', !b);
    if (b) $('bossname').textContent = b.def.title;
  }
  updateHud(dt) {
    const g = this.game;
    if (!g || !g.player) return;
    const p = g.player, s = g.stats;
    $('xpfill').style.width = `${(p.xp / p.xpNeed) * 100}%`;
    $('lvbadge').textContent = `Lv ${p.level}`;
    $('hpfill').style.width = `${clamp(p.hp / s.maxHp, 0, 1) * 100}%`;
    $('hptext').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${Math.round(s.maxHp)}`;
    $('timer').textContent = fmtTime(g.time);
    $('kills').textContent = fmtNum(g.runStats.kills);
    $('gold').textContent = fmtNum(g.runStats.gold);
    $('objective').textContent = g.finalSpawned ? '虚ろの王を倒せ!' : `封印塔 ${g.sealsBroken}/3`;
    const dg = g.danger || 0;
    $('danger').textContent = `${BIOMES[g.biome].name} 危険度${'★'.repeat(dg + 1)}`;
    $('feverfill').style.width = g.feverT > 0 ? `${(g.feverT / 9) * 100}%` : `${(g.fever / g.feverNeed) * 100}%`;
    const cb = $('combo');
    if (g.combo >= 10) {
      cb.classList.remove('hidden');
      if (g.combo !== this.lastCombo) {
        const n = $('combonum');
        n.textContent = g.combo;
        if (g.combo % 5 === 0) { n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); }
        $('combobonus').textContent = `EXP +${Math.round(Math.min(g.combo, 500) / 10)}%`;
      }
      cb.style.opacity = Math.min(1, g.comboT / 0.8);
    } else cb.classList.add('hidden');
    this.lastCombo = g.combo;
    const ch = $('challenge');
    if (g.challenge) { ch.classList.remove('hidden'); ch.textContent = `試練 残り ${Math.ceil(g.challenge.t)} 秒`; } else ch.classList.add('hidden');
    if (this.bossRef) {
      $('bossfill').style.width = `${clamp(this.bossRef.hp / this.bossRef.maxHp, 0, 1) * 100}%`;
      if (this.bossRef.dead) this.boss(null);
    }
    const dr = $('dashring');
    const cd = p.dashMax ? clamp(p.dashCd / p.dashMax, 0, 1) : 0;
    dr.style.strokeDashoffset = `${cd * 276.5}`;
    $('dashbtn').classList.toggle('cool', cd > 0);
    this.drawMinimap();
    this.drawCompass();
  }
  drawMinimap() {
    const g = this.game, c = this.mm, W = 300;
    const p = g.player;
    const R = 110; // 表示範囲(ワールド単位)
    const sc = W / (R * 2);
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(10,8,24,0.8)'; c.fillRect(0, 0, W, W);
    const cx0 = Math.floor((p.x - R) / CHUNK), cx1 = Math.floor((p.x + R) / CHUNK);
    const cz0 = Math.floor((p.z - R) / CHUNK), cz1 = Math.floor((p.z + R) / CHUNK);
    const cell = (CHUNK / 4) * sc;
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const cols = g.world.explored.get(`${cx},${cz}`);
      if (!cols) continue;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        c.fillStyle = cols[i * 4 + j];
        c.fillRect(W / 2 + (cx * CHUNK + i * 8 - p.x) * sc, W / 2 + (cz * CHUNK + j * 8 - p.z) * sc, cell + 0.6, cell + 0.6);
      }
    }
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, W, W);
    const dot = (x, z, col, r) => { const sx = W / 2 + (x - p.x) * sc, sy = W / 2 + (z - p.z) * sc; c.fillStyle = col; c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill(); };
    // 敵(一部)
    c.globalAlpha = 0.7;
    for (let i = 0; i < g.enemies.length; i += 3) { const e = g.enemies[i]; dot(e.x, e.z, e.elite ? '#ffd24a' : '#ff4f6a', e.elite ? 5 : 2.2); }
    c.globalAlpha = 1;
    const poiCol = { chest: '#ffe9a0', shrine: '#7ff3ff', obelisk: '#ff3a6a', spring: '#5df2c0', seal: '#ffcc33' };
    for (const q of g.world.pois.values()) if (poiCol[q.kind]) dot(q.x, q.z, poiCol[q.kind], q.kind === 'seal' ? 9 : 5);
    for (const b of g.bosses) dot(b.x, b.z, '#ff3ab0', 9);
    // 自分
    c.translate(W / 2, W / 2); c.rotate(Math.atan2(p.fz, p.fx));
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(12, 0); c.lineTo(-8, 7); c.lineTo(-4, 0); c.lineTo(-8, -7); c.closePath(); c.fill();
    c.restore();
  }
  // 画面端の方角マーカー(封印塔・ボス・宝箱)
  drawCompass() {
    const g = this.game, p = g.player, cam = this.app.renderer.camera;
    const ctx = this.fx2d;
    const targets = [];
    for (const s of g.world.seals) if (!s.broken) targets.push({ x: s.x, z: s.z, col: '#ffcc33', label: '封印塔', big: true });
    for (const b of g.bosses) targets.push({ x: b.x, z: b.z, col: '#ff3ab0', label: 'ボス', big: true });
    for (const q of g.world.pois.values()) if (q.kind === 'chest' || q.kind === 'shrine' || q.kind === 'obelisk') targets.push({ x: q.x, z: q.z, col: { chest: '#ffe9a0', shrine: '#7ff3ff', obelisk: '#ff3a6a' }[q.kind], label: '', big: false });
    for (const it of g.items) if (it.kind === 'chest') targets.push({ x: it.x, z: it.z, col: '#ffe9a0', label: '', big: false });
    const W = innerWidth, H = innerHeight;
    const v = this._v || (this._v = new cam.position.constructor());
    for (const t of targets) {
      const dist = Math.hypot(t.x - p.x, t.z - p.z);
      v.set(t.x, 1, t.z).project(cam);
      let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      const onScreen = v.z < 1 && sx > 30 && sx < W - 30 && sy > 60 && sy < H - 30;
      if (onScreen) continue;
      // 画面外:プレイヤーから見た方角で端に置く
      v.set(p.x, 1, p.z).project(cam);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      const ang = Math.atan2(t.z - p.z, t.x - p.x);
      const dx = Math.cos(ang), dy = Math.sin(ang) * 0.8;
      const mx = W / 2 - 40, my = H / 2 - 50;
      const k = Math.min(mx / Math.abs(dx || 1e-3), my / Math.abs(dy || 1e-3));
      sx = clamp(px + dx * k, 36, W - 36); sy = clamp(py + dy * k, 70, H - 40);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.globalAlpha = t.big ? 0.95 : 0.7;
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = t.col;
      ctx.shadowColor = t.col; ctx.shadowBlur = 12;
      const s = t.big ? 14 : 9;
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, s * 0.7); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s * 0.7, -s * 0.7); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (t.big) {
        ctx.save();
        ctx.font = '900 12px "EW Rounded", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
        const txt = `${t.label} ${Math.round(dist)}m`;
        const ty = sy + (sy > H / 2 ? -20 : 26);
        ctx.strokeText(txt, sx, ty); ctx.fillText(txt, sx, ty);
        ctx.restore();
      }
    }
  }
}
