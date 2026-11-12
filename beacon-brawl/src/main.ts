import * as THREE from 'three';
import './style.css';
import { loadAssets, heroModel, type HeroModel } from './assets';
import { HEROES, type HeroDef } from './heroes';
import { Match, DIFFICULTIES, type MatchResult } from './game';
import { Input } from './input';
import { Hud } from './hud';
import { initAudio, sfx } from './audio';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const input = new Input(canvas);
const hud = new Hud(input);
let match: Match | null = null;
let selected = 0;
let difficulty = 1;

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
      wantLook.set(0, 1.5, 0); wantPos.set(0, 2.4, portrait ? 30 : 15);
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
    c.innerHTML = `<b></b><span></span>`;
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
  refreshDiff();
  pick(0);
}
function refreshDiff() { [...$('diff').children].forEach((b, i) => b.classList.toggle('on', i === difficulty)); }

function pick(i: number) {
  selected = i;
  if (lobby.focus >= 0) lobby.focus = i;
  const h: HeroDef = HEROES[i];
  [...$('cards').children].forEach((c, j) => c.classList.toggle('on', j === i));
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
  for (const [tag, s] of [['スキル1', h.skills[0]], ['スキル2', h.skills[1]], ['必殺技', h.ult]] as const) {
    const row = document.createElement('div'); row.className = `sk${tag === '必殺技' ? ' ult' : ''}`;
    row.innerHTML = `<em></em><b></b><span></span>`;
    row.querySelector('em')!.textContent = tag;
    row.querySelector('b')!.textContent = s.name;
    row.querySelector('span')!.textContent = s.desc + (s.cd ? `（CT ${s.cd}秒）` : '');
    $('i-skills').append(row);
  }
}

// ---------- 画面遷移 ----------
function startMatch() {
  initAudio();
  match?.dispose();
  input.reset();
  match = new Match(HEROES[selected], DIFFICULTIES[difficulty], input, hud, showResult);
  resize();
  show(null);
}

function showResult(r: MatchResult) {
  const t = $('r-title');
  t.textContent = r.winner === 0 ? 'VICTORY' : r.winner === 1 ? 'DEFEAT' : 'DRAW';
  t.className = r.winner === 0 ? 'blue' : r.winner === 1 ? 'red' : '';
  $('r-score').textContent = `確保した拠点　青 ${r.counts[0]} － ${r.counts[1]} 赤`;
  const table = $('r-table');
  table.innerHTML = '<tr><th>ヒーロー</th><th>撃破</th><th>ダウン</th></tr>';
  for (const u of r.units) {
    const tr = document.createElement('tr');
    tr.className = u.team === 0 ? 'blue' : 'red';
    for (const text of [u.isPlayer ? `${u.name}（あなた）` : u.name, String(u.kills), String(u.deaths)]) {
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
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  for (const cam of [lobby?.camera, match?.camera]) if (cam) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
  hud.resize(w, h);
}
addEventListener('resize', resize);

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (match) { match.update(dt); renderer.render(match.scene, match.camera); }
  else if (lobby) { lobby.update(dt); renderer.render(lobby.scene, lobby.camera); }
  requestAnimationFrame(frame);
}

loadAssets((k) => { $('loadfill').style.width = `${k * 100}%`; })
  .then(() => {
    lobby = new Lobby();
    buildSelect();
    resize();
    show('title');
    requestAnimationFrame(frame);
  })
  .catch((e) => { $('loadtext').textContent = `読み込みに失敗しました: ${e?.message ?? e}`; });

// デバッグ・自動テスト用
(window as unknown as Record<string, unknown>).__game = { get match() { return match; }, startMatch, HEROES };
