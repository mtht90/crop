import * as THREE from 'three';
import './style.css';
import { loadAssets, heroModel, portraitOf, type HeroModel } from './assets';
import { iconSvg } from './icons';
import { HEROES, type HeroDef } from './heroes';
import { Match, DIFFICULTIES, MODES, type MatchResult } from './game';
import { Input } from './input';
import { Hud } from './hud';
import { initAudio, sfx } from './audio';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // ソフト影はスマホで重いので通常のPCFに（輪郭はほぼ同じ）

const input = new Input(canvas);
const hud = new Hud(input);
let match: Match | null = null;
let selected = 0;
let difficulty = 1;
let mode = 0;
const ultChoice: number[] = HEROES.map(() => 0); // ヒーローごとに選んだ必殺技

function show(id: string | null) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
  $('hud').classList.toggle('show', id === null);
}

// ---------- ロビー（タイトル / キャラ選択の3D表示） ----------
class Lobby {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private models: HeroModel[] = [];
  private look = new THREE.Vector3(0, 1.3, 0);
  private pos = new THREE.Vector3(0, 2.6, 14);
  focus = -1; // -1: 全員を映す

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color(0x12162a);
    s.fog = new THREE.Fog(0x12162a, 14, 40);
    s.add(new THREE.HemisphereLight(0xcfdcff, 0x3a3048, 1.3));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(4, 9, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 8, bottom: -4 });
    s.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshToonMaterial({ color: 0x232a47 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    s.add(floor);
    HEROES.forEach((def, i) => {
      const x = (i - (HEROES.length - 1) / 2) * 2.5;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), new THREE.MeshBasicMaterial({ color: def.color }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.02, -Math.abs(x) * 0.18);
      s.add(ring);
    });
    this.reclaim();
  }

  /** 対戦に貸し出していたモデルをロビーに並べ直す */
  reclaim() {
    this.models = HEROES.map((def, i) => {
      const m = heroModel(def);
      const x = (i - (HEROES.length - 1) / 2) * 2.5;
      m.root.position.set(x, 0, -Math.abs(x) * 0.18);
      this.scene.add(m.root);
      m.mixer.clipAction(m.clips.get(def.idle)!).reset().play();
      m.settle();
      return m;
    });
  }

  cheer(i: number) {
    const m = this.models[i];
    const a = m.mixer.clipAction(m.clips.get('Dance_Loop')!);
    a.reset().fadeIn(0.15).play();
    setTimeout(() => a.fadeOut(0.3), 1600);
  }

  update(dt: number) {
    for (const m of this.models) m.update(dt);
    const portrait = this.camera.aspect < 1;
    const wantLook = new THREE.Vector3(), wantPos = new THREE.Vector3();
    if (this.focus < 0) {
      wantLook.set(0, portrait ? 1.6 : 3.0, 0); wantPos.set(0, 2.6, portrait ? 30 : 15);
    } else {
      const p = this.models[this.focus].root.position;
      const sx = portrait ? 0 : -1.5, sy = portrait ? 0.9 : 1.3;
      wantLook.set(p.x + sx, sy, p.z); wantPos.set(p.x + sx * 0.6, portrait ? 1.6 : 1.9, p.z + (portrait ? 12 : 6.2));
      this.models[this.focus].root.rotation.y = Math.sin(performance.now() / 1400) * 0.35;
    }
    const k = 1 - Math.exp(-dt * 6);
    this.look.lerp(wantLook, k); this.pos.lerp(wantPos, k);
    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
  }
}
let lobby: Lobby;

// ---------- キャラ選択UI ----------
function buildSelect() {
  const cards = $('cards');
  HEROES.forEach((h, i) => {
    const c = document.createElement('button');
    c.className = 'card';
    c.style.setProperty('--hc', `#${h.color.toString(16).padStart(6, '0')}`);
    c.innerHTML = `<img alt="" /><b></b><span></span>`;
    (c.querySelector('img') as HTMLImageElement).src = portraitOf(h);
    c.querySelector('b')!.textContent = h.name;
    c.querySelector('span')!.textContent = h.role;
    c.addEventListener('click', () => { pick(i); sfx.ui(); lobby.cheer(i); });
    cards.append(c);
  });
  const diff = $('diff');
  DIFFICULTIES.forEach((d, i) => {
    const b = document.createElement('button');
    b.textContent = d.name;
    b.addEventListener('click', () => { difficulty = i; sfx.ui(); refreshDiff(); });
    diff.append(b);
  });
  const modes = $('modes');
  MODES.forEach((m, i) => {
    const b = document.createElement('button');
    b.textContent = m.name;
    b.addEventListener('click', () => { mode = i; sfx.ui(); refreshMode(); });
    modes.append(b);
  });
  refreshMode();
  refreshDiff();
  pick(0);
}
function refreshMode() {
  [...$('modes').children].forEach((b, i) => b.classList.toggle('on', i === mode));
  $('mode-desc').textContent = MODES[mode].desc;
}
function refreshDiff() { [...$('diff').children].forEach((b, i) => b.classList.toggle('on', i === difficulty)); }

function pick(i: number) {
  selected = i;
  if (lobby.focus >= 0) lobby.focus = i;
  const h: HeroDef = HEROES[i];
  [...$('cards').children].forEach((c, j) => c.classList.toggle('on', j === i));
  ($('i-img') as HTMLImageElement).src = portraitOf(h);
  $('i-role').textContent = h.role;
  $('i-role').style.background = `#${h.color.toString(16).padStart(6, '0')}`;
  $('i-name').textContent = h.name;
  $('i-blurb').textContent = h.blurb;
  const stats: [string, number][] = [['体力', h.hp / 1500], ['攻撃', (h.atk / h.interval) / 130], ['速度', h.speed / 8.4], ['射程', h.range / 14]];
  $('i-stats').innerHTML = '';
  for (const [label, val] of stats) {
    const row = document.createElement('div'); row.className = 'stat';
    row.innerHTML = `<span></span><div><i></i></div>`;
    row.querySelector('span')!.textContent = label;
    (row.querySelector('i') as HTMLElement).style.width = `${Math.min(1, val) * 100}%`;
    $('i-stats').append(row);
  }
  $('i-skills').innerHTML = '';
  const rows = [['スキル1', h.skills[0], -1], ['スキル2', h.skills[1], -1], ['必殺技A', h.ults[0], 0], ['必殺技B', h.ults[1], 1]] as const;
  for (const [tag, s, ult] of rows) {
    const row = document.createElement('div');
    row.className = `sk${ult >= 0 ? ' ult' : ''}${ult === ultChoice[i] ? ' on' : ''}`;
    row.innerHTML = `<i>${iconSvg(s.icon)}</i><em></em><b></b><span></span>`;
    row.querySelector('em')!.textContent = tag;
    row.querySelector('b')!.textContent = s.name;
    row.querySelector('span')!.textContent = s.desc + (s.cd ? `（CT ${s.cd}秒）` : '');
    // 必殺技はタップで選ぶ
    if (ult >= 0) row.addEventListener('click', () => { ultChoice[i] = ult; sfx.ui(); pick(i); });
    $('i-skills').append(row);
  }
}

// ---------- 画面遷移 ----------
function startMatch() {
  initAudio();
  match?.dispose();
  input.reset();
  match = new Match(HEROES[selected], { mode: MODES[mode], difficulty: DIFFICULTIES[difficulty], ult: ultChoice[selected] }, input, hud, showResult);
  resize();
  show(null);
}

function showResult(r: MatchResult) {
  const t = $('r-title');
  t.textContent = r.winner === 0 ? 'VICTORY' : r.winner === 1 ? 'DEFEAT' : 'DRAW';
  t.className = r.winner === 0 ? 'blue' : r.winner === 1 ? 'red' : '';
  $('r-score').innerHTML = `<b class="blue">${r.scores[0]}</b><span></span><b class="red">${r.scores[1]}</b>`;
  $('r-score').querySelector('span')!.textContent = r.unit;
  const table = $('r-table');
  table.innerHTML = '<tr><th></th><th>KO</th><th>DOWN</th></tr>';
  for (const u of r.units) {
    const tr = document.createElement('tr');
    tr.className = `${u.team === 0 ? 'blue' : 'red'}${u.isPlayer ? ' me' : ''}`;
    const first = document.createElement('td');
    const pic = document.createElement('img'); pic.src = portraitOf(u.def); pic.alt = '';
    first.append(pic, document.createTextNode(u.name));
    tr.append(first);
    for (const text of [String(u.kills), String(u.deaths)]) {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    table.append(tr);
  }
  show('result');
}

function toSelect() {
  match?.dispose(); match = null;
  lobby.reclaim();
  lobby.focus = selected;
  show('select');
}

$('btn-start').addEventListener('click', () => { initAudio(); sfx.ui(); toSelect(); });
$('btn-go').addEventListener('click', () => { sfx.ui(); startMatch(); });
$('btn-again').addEventListener('click', () => { sfx.ui(); startMatch(); });
$('btn-back').addEventListener('click', () => { sfx.ui(); toSelect(); });

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, maxRatio) * resScale);
  renderer.setSize(w, h, false);
  for (const cam of [lobby?.camera, match?.camera]) if (cam) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
  hud.resize(w, h);
}
addEventListener('resize', resize);

/** 解像度の自動調整: 重いときは描画解像度を少し下げ、余裕があれば戻す */
const maxRatio = 2;
let resScale = 1, slowT = 0, fastT = 0;
function adaptResolution(dt: number) {
  if (dt > 1 / 45) { slowT += dt; fastT = 0; } else if (dt < 1 / 58) { fastT += dt; slowT = 0; } else { slowT = fastT = 0; }
  const floor = 0.6 / Math.min(devicePixelRatio, maxRatio) > 0.5 ? 0.75 : 0.6; // 最低でも等倍弱は保つ
  if (slowT > 1 && resScale > floor) { resScale = Math.max(floor, resScale - 0.1); slowT = 0; resize(); }
  else if (fastT > 3 && resScale < 1) { resScale = Math.min(1, resScale + 0.1); fastT = 0; resize(); }
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (match) { match.update(dt); renderer.render(match.scene, match.camera); adaptResolution(dt); }
  else if (lobby) { lobby.update(dt); renderer.render(lobby.scene, lobby.camera); }
  requestAnimationFrame(frame);
}

loadAssets(renderer, (k) => { $('loadfill').style.width = `${k * 100}%`; })
  .then(() => {
    lobby = new Lobby();
    buildSelect();
    resize();
    show('title');
    requestAnimationFrame(frame);
  })
  .catch((e) => { $('loadtext').textContent = `読み込みに失敗しました: ${e?.message ?? e}`; });

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); $('loadtext').textContent = '描画がリセットされました。ページを再読み込みしてください。'; show('loading'); });

// デバッグ・自動テスト用
(window as unknown as Record<string, unknown>).__game = { renderer, get match() { return match; }, startMatch, HEROES, setMode(i: number) { mode = i; refreshMode(); } };
