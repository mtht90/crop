// DOM の UI（HUD・レベルアップカード・バナー・各画面）
import { SKILLS, RUN } from './config.js';
import { SPR, iconCanvas, draw } from './sprites.js';

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { attack: '攻撃', summon: '式神', passive: '補助' };

// スキル → アイコンに使うスプライト [key, frame, dir]
const ICON = {
  ofuda: ['ofuda'], kitsunebi: ['foxfire', 2], raifu: ['bomb'], kekkai: ['circleSpark', 3], hamaya: ['arrow'],
  kami: ['kami'], byakko: ['byakko'], zenki: ['zenki', 0], karasu: ['karasu'],
  reiryoku: ['gem3'], shikiko: ['circle', 2], sokuei: ['energy', 1], idaten: ['player', 1, 3], kyukon: ['gem1'], chomei: ['heal'],
  _heal: ['heal'], _purge: ['bomb'],
};
function icon(id, size) {
  const [k, f = 0, d = 0] = ICON[id] || ['gem0'];
  return iconCanvas(k, size, f, d);
}

let hudT = 0;
let pickHandler = null;
let cardsReadyAt = 0;
let currentOpts = [];
let lastStreak = 0;

export const UI = {
  showTitle() {
    $('title').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('result').classList.add('hidden');
    $('levelup').classList.add('hidden');
    $('pause').classList.add('hidden');
  },
  showHUD() {
    $('title').classList.add('hidden');
    $('result').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
    if (!$('faceIcon').firstChild) {
      $('faceIcon').appendChild(iconCanvas('face', 38));
      $('icoKills').appendChild(iconCanvas('kooni', 20));
      $('icoAllies').appendChild(iconCanvas('kami', 20));
      $('icoFoes').appendChild(iconCanvas('hitotsume', 20));
      $('bossFace').appendChild(iconCanvas('tenguFace', 38));
    }
  },

  // タイトル画面：百鬼夜行の行列が横切るアニメーション
  titleArt() {
    const c = $('parade');
    if (!c || c._run) return;
    c._run = true;
    const g = c.getContext('2d');
    const cast = ['onibi', 'kooni', 'chochin', 'hitotsume', 'kappa', 'gashadokuro', 'kooni', 'onibi', 'chochin', 'oni', 'kappa', 'hitotsume', 'gashadokuro', 'onibi'];
    let t0 = performance.now();
    const loop = (now) => {
      if ($('title').classList.contains('hidden')) { c._run = false; return; }
      const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, w, h);
      const t = (now - t0) / 1000;
      const gap = 46, total = cast.length * gap + w;
      cast.forEach((k, i) => {
        const s = SPR[k];
        const x = ((t * 34 + i * gap) % total) - 40;
        const y = h * 0.6 + Math.sin(t * 3 + i) * 2 + (i % 3) * 6 - 6;
        const kk = (h * 0.55) / s.h * (k === 'oni' ? 1.5 : 1);
        g.globalAlpha = 0.95;
        draw(g, s, w - x, y, (t * 8 + i) | 0, 2, false, kk);
      });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  updateHUD(G) {
    const now = performance.now();
    if (now - hudT < 100) return;
    hudT = now;
    $('xpfill').style.width = `${Math.min(100, (G.xp / G.xpNext) * 100)}%`;
    $('lv').textContent = `LV ${G.level}`;
    const t = Math.floor(G.time);
    $('timer').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    $('timer').classList.toggle('dawn', RUN.winAt - G.time < 60);
    $('kills').textContent = G.kills;
    $('allies').textContent = G.allies.length;
    $('foes').textContent = G.enemies.length;
    $('hpfill').style.width = `${Math.max(0, (G.player.hp / G.player.maxHp) * 100)}%`;
    const sk = $('streak');
    if (G.streak >= 15) {
      $('streakNum').textContent = G.streak;
      sk.style.setProperty('--s', Math.min(2.2, 1 + Math.sqrt(G.streak) / 25).toFixed(2));
      sk.classList.add('on');
      if (Math.floor(G.streak / 100) !== Math.floor(lastStreak / 100)) {
        sk.classList.remove('bump'); void sk.offsetWidth; sk.classList.add('bump');
      }
    } else sk.classList.remove('on');
    lastStreak = G.streak;
    if (G.boss) UI.bossBar(true, G.boss.hp / G.boss.maxHp);
    if (G.debug.fps) $('debug').textContent = G.debugText || '';
  },

  refreshSkills(G) {
    const box = $('skills');
    box.innerHTML = '';
    for (const s of G.skills) {
      const d = document.createElement('div');
      d.className = `sk ${s.def.type}`;
      d.title = s.def.name;
      d.appendChild(icon(s.id, 26));
      const lv = document.createElement('i');
      lv.textContent = s.lv >= s.def.levels.length ? 'M' : s.lv;
      d.appendChild(lv);
      box.appendChild(d);
    }
  },

  banner(text, kind = 'red') {
    const b = document.createElement('div');
    b.className = `banner ${kind}`;
    b.innerHTML = `<span>${text}</span>`;
    $('banners').appendChild(b);
    setTimeout(() => b.remove(), kind === 'small' ? 2200 : 2800);
  },

  bossBar(show, frac = 1) {
    $('bossbar').classList.toggle('hidden', !show);
    if (show) $('bossfill').style.width = `${Math.max(0, frac * 100)}%`;
  },

  showLevelUp(G, opts, onPick) {
    currentOpts = opts;
    pickHandler = onPick;
    cardsReadyAt = performance.now() + 380;
    $('lvNum').textContent = G.level;
    const box = $('cards');
    box.innerHTML = '';
    opts.forEach((id, i) => {
      const c = document.createElement('button');
      c.className = 'card';
      c.id = `card${i}`;
      c.style.animationDelay = `${i * 0.08}s`;
      let name, type, lvTxt, desc, isNew = false;
      if (id === '_heal') { name = '霊薬'; type = 'passive'; lvTxt = ''; desc = 'HP を全回復する'; }
      else if (id === '_purge') { name = '大祓'; type = 'attack'; lvTxt = ''; desc = '画面内の妖怪をすべて祓う'; }
      else {
        const def = SKILLS[id];
        const owned = G.skills.find((s) => s.id === id);
        name = def.name; type = def.type;
        if (owned) {
          lvTxt = `Lv${owned.lv} → ${owned.lv + 1}`;
          desc = def.type === 'passive' ? def.desc : def.up[owned.lv] || def.desc;
        } else { lvTxt = 'NEW'; isNew = true; desc = def.desc; }
      }
      c.classList.add(type);
      if (isNew) c.classList.add('new');
      c.innerHTML = `
        <div class="icon"></div>
        <div class="body">
          <div class="row"><b class="name">${name}</b><em class="tag">${TYPE_LABEL[type]}</em></div>
          <div class="lv">${lvTxt}</div>
          <div class="desc">${desc}</div>
        </div>
        <kbd>${i + 1}</kbd>`;
      c.querySelector('.icon').appendChild(icon(id, 48));
      c.addEventListener('click', () => UI.pick(i));
      box.appendChild(c);
    });
    $('levelup').classList.remove('hidden');
  },

  pick(i) {
    if (!pickHandler || performance.now() < cardsReadyAt || i >= currentOpts.length) return;
    const h = pickHandler;
    pickHandler = null;
    $('levelup').classList.add('hidden');
    h(currentOpts[i]);
  },
  levelUpOpen() { return !!pickHandler; },

  showPause(show) { $('pause').classList.toggle('hidden', !show); },

  showResult(win, s) {
    $('hud').classList.add('hidden');
    $('levelup').classList.add('hidden');
    const r = $('result');
    r.classList.remove('hidden');
    r.classList.toggle('win', win);
    const t = Math.floor(s.time);
    $('resTitle').textContent = win ? '百鬼、祓い尽くす' : '力尽きた';
    $('resSub').textContent = win ? '夜が明け、妖怪たちは闇へ還っていった。' : '百鬼夜行に呑まれた。もう一度、札を構えよ。';
    $('resStats').innerHTML = `
      <div><span>生存時間</span><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b></div>
      <div><span>祓った妖怪</span><b>${s.kills}</b></div>
      <div><span>到達レベル</span><b>${s.level}</b></div>
      <div><span>最大同時式神</span><b>${s.maxAllies}</b></div>
      <div><span>総ダメージ</span><b>${Math.round(s.dmg)}</b></div>`;
  },
};
