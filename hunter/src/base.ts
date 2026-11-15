import * as THREE from 'three';
import { assets } from './assets';
import { audio } from './audio';
import { CORES, MATERIALS, MODS, MONSTERS, QUIRKS, QUIRK_COST, WEAPONS, BOSS, AREA, LORE, type MatId, type ModId, type WeaponId } from './data';
import { save, persist, canAfford, pay, resetSave } from './save';

const $ = (id: string) => document.getElementById(id)!;

function costHtml(cost: Partial<Record<MatId, number>>) {
  return Object.entries(cost)
    .map(([k, v]) => {
      const have = save.mats[k as MatId];
      return `<span class="cost ${have >= (v ?? 0) ? 'ok' : 'ng'}">${MATERIALS[k as MatId].name} ${have}/${v}</span>`;
    })
    .join(' ');
}

/** 拠点（工房船アンヴィル号）：武器の改造・解放、出撃準備 */
export class Base {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
  vScene = new THREE.Scene();
  vCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  rig?: { root: THREE.Object3D; mixer: THREE.AnimationMixer; id: WeaponId };
  tab: 'sortie' | 'forge' | 'mats' | 'book' | 'settings' = 'sortie';
  sel: WeaponId = 'pistol';
  onSortie?: (loadout: WeaponId[]) => void;
  t = 0;
  lights: THREE.PointLight[] = [];

  build() {
    const s = this.scene;
    s.background = new THREE.Color(0x14110f);
    s.fog = new THREE.Fog(0x14110f, 8, 30);
    s.add(new THREE.HemisphereLight(0xb8c4d0, 0x302820, 0.8));
    // 工房：石床・壁・柱・炉心（すべて外部モデル）
    for (let x = -8; x <= 8; x += 4) for (let z = -12; z <= 4; z += 4) {
      const t = assets.clonePart('dungeon', 'floor_tile');
      t.scale.set(2, 1, 2);
      t.position.set(x, 0, z);
      s.add(t);
    }
    for (let x = -8; x <= 8; x += 4) {
      const w = assets.clonePart('dungeon', 'wall_straight');
      w.scale.set(2, 1.6, 2);
      w.position.set(x, 0, -13);
      w.rotation.y = Math.PI / 2;
      s.add(w);
    }
    for (const x of [-9, 9]) for (let z = -11; z <= 3; z += 4) {
      const w = assets.clonePart('dungeon', z === -3 && x > 0 ? 'wall_doorway' : 'wall_straight');
      w.scale.set(2, 1.6, 2);
      w.position.set(x, 0, z);
      s.add(w);
    }
    for (const [x, z] of [[-5, -9], [5, -9], [-5, -1], [5, -1]]) {
      const p = assets.clonePart('dungeon', 'pillar');
      p.scale.set(1.6, 1.6, 1.6);
      p.position.set(x, 0, z);
      s.add(p);
    }
    const mono = assets.clonePart('monolith', 'monolith');
    mono.scale.setScalar(1.3);
    mono.position.set(0, 0, -10.5);
    s.add(mono);
    const door = assets.clonePart('dungeon', 'door_wood');
    door.scale.set(2, 1.6, 2);
    door.position.set(8.8, 0, -3);
    s.add(door);
    for (const [x, z] of [[-3, -6], [3, -6], [-6, 1], [6, 1]]) {
      const l = assets.cloneScene('lamp');
      l.scale.setScalar(9);
      l.position.set(x, 0, z);
      s.add(l);
      const pl = new THREE.PointLight(0xffa860, 10, 12, 1.6);
      pl.position.set(x, 2, z);
      s.add(pl);
      this.lights.push(pl);
    }
    const core = new THREE.PointLight(0x70c0ff, 14, 14, 1.6);
    core.position.set(0, 2.5, -9);
    s.add(core);
    this.lights.push(core);
    // 飾り：倒した獣の剥製代わりに骸弩兵と坑殻蟹のモデル（静止ポーズ）
    const crab = assets.cloneScene('crab');
    crab.position.set(-6, 0, -6);
    crab.rotation.y = 0.8;
    s.add(crab);
    const mixer = new THREE.AnimationMixer(crab);
    const clip = assets.clips('crab').find((c) => c.name === 'idle_cache');
    if (clip) mixer.clipAction(clip).play();
    mixer.update(0.5);

    this.camera.position.set(0, 1.65, 2.5);
    this.camera.lookAt(0, 1.5, -8);
    this.vScene.add(new THREE.HemisphereLight(0xffe8d0, 0x302020, 2));
    const d = new THREE.DirectionalLight(0xffd0a0, 1.5);
    d.position.set(1, 1, 0.5);
    this.vScene.add(d, this.vCam);
  }

  showWeapon(id: WeaponId) {
    if (this.rig?.id === id) return;
    if (this.rig) this.vCam.remove(this.rig.root);
    const def = WEAPONS[id];
    const model = assets.cloneScene(def.model);
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false;
      if (/^Icosphere/i.test(o.name)) o.visible = false;
    });
    const root = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = Math.PI;
    inner.add(model);
    model.position.set(-def.view.x, -def.view.y, -def.view.z);
    root.add(inner);
    root.position.set(0.05, -0.02, 0);
    this.vCam.add(root);
    const mixer = new THREE.AnimationMixer(model);
    const c = assets.clips(def.model).find((x) => x.name === def.anim.idle);
    if (c) mixer.clipAction(c).play();
    this.rig = { root, mixer, id };
  }

  open() {
    $('base').style.display = 'flex';
    audio.playBgm('base', 1.5);
    this.render();
  }
  close() {
    $('base').style.display = 'none';
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vCam.aspect = w / h;
    this.vCam.updateProjectionMatrix();
  }

  update(dt: number, r: THREE.WebGLRenderer) {
    this.t += dt;
    this.rig?.mixer.update(dt);
    for (let i = 0; i < this.lights.length; i++) this.lights[i].intensity = (i === this.lights.length - 1 ? 14 : 10) + Math.sin(this.t * 6 + i * 2) * 0.8;
    this.camera.position.x = Math.sin(this.t * 0.15) * 0.3;
    this.camera.lookAt(0, 1.4, -8);
    r.autoClear = true;
    r.render(this.scene, this.camera);
    r.autoClear = false;
    r.clearDepth();
    r.render(this.vScene, this.vCam);
  }

  render() {
    const tabs: [typeof this.tab, string][] = [
      ['sortie', '出撃準備'],
      ['forge', '工房'],
      ['mats', '素材庫'],
      ['book', '獣図鑑'],
      ['settings', '設定'],
    ];
    $('base-tabs').innerHTML = tabs.map(([k, n]) => `<button class="tab ${this.tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('');
    $('base-tabs')
      .querySelectorAll('button')
      .forEach((b) =>
        b.addEventListener('click', () => {
          this.tab = (b as HTMLElement).dataset.tab as typeof this.tab;
          audio.play('ui_select', { vol: 0.6 });
          this.render();
        }),
      );
    const body = $('base-body');
    if (this.tab === 'sortie') body.innerHTML = this.sortieHtml();
    if (this.tab === 'forge') body.innerHTML = this.forgeHtml();
    if (this.tab === 'mats') body.innerHTML = this.matsHtml();
    if (this.tab === 'book') body.innerHTML = this.bookHtml();
    if (this.tab === 'settings') body.innerHTML = this.settingsHtml();
    this.bind(body);
    $('base-stats').innerHTML = `狩猟 ${save.hunts} 回 ／ 骸鍛王討伐 ${save.bossKills} 回`;
    this.showWeapon(this.tab === 'forge' ? this.sel : save.loadout[0]);
  }

  private sortieHtml() {
    const unlocked = (Object.keys(WEAPONS) as WeaponId[]).filter((id) => save.weapons[id].unlocked);
    return `
      <h2>出撃準備</h2>
      <p class="lore">${AREA.desc}</p>
      <div class="area-card"><b>${AREA.name}</b><br><small>標的：${BOSS.name}　／　生息：${Object.values(MONSTERS).map((m) => m.name).join('・')}</small></div>
      <h3>携行する喰銃（2つまで）</h3>
      <div class="wlist">${unlocked
        .map((id) => {
          const on = save.loadout.includes(id);
          const w = WEAPONS[id];
          return `<button class="wpick ${on ? 'on' : ''}" data-pick="${id}"><b>${w.name}</b><small>${w.kind}　${w.desc}</small></button>`;
        })
        .join('')}</div>
      <button class="big" id="go">狩りに出る</button>
      <div class="controls">
        <b>操作</b>　WASD 移動 / Shift 疾走 / Space 跳躍 / C 回避ステップ / マウス 視点<br>
        左クリック 射撃（弓は長押しで引き絞り）/ 右クリック 照準 / R 装填 / 1・2・ホイール 武器切替<br>
        E 魔核を回収 / F 魔核を喰わせる（素材喰い）/ Q 喰わせる魔核を選択 / Esc 一時停止
      </div>`;
  }

  private forgeHtml() {
    const ids = Object.keys(WEAPONS) as WeaponId[];
    const id = this.sel;
    const w = WEAPONS[id];
    const st = save.weapons[id];
    let main = '';
    if (!st.unlocked) {
      main = `<div class="unlock"><p>${w.desc}</p><p>解放に必要：${costHtml(w.unlock!)}</p>
        <button class="act" data-unlock="${id}" ${canAfford(w.unlock!) ? '' : 'disabled'}>設計図を起こして解放</button></div>`;
    } else {
      main = `<p class="dim">${w.desc}</p><table class="mods">${(Object.keys(MODS) as ModId[])
        .map((m) => {
          const lv = st.mods[m];
          const md = MODS[m];
          const next = md.costs[lv];
          return `<tr><td><b>${md.name}</b> Lv${lv}/3<br><small>${md.desc(lv)}${next ? ` → ${md.desc(lv + 1)}` : ''}</small></td>
            <td>${next ? `${costHtml(next)}<br><button class="act" data-mod="${m}" ${canAfford(next) ? '' : 'disabled'}>改造</button>` : '<span class="dim">最大</span>'}</td></tr>`;
        })
        .join('')}</table>
        <div class="quirk"><b>炉の気まぐれ</b> <small>（おまけ：ランダムな小強化を1つ付与・上書き）</small><br>
        現在：${st.quirk ? `<b>${QUIRKS.find((q) => q.id === st.quirk)?.name}</b> ${QUIRKS.find((q) => q.id === st.quirk)?.desc}` : 'なし'}<br>
        ${costHtml(QUIRK_COST)} <button class="act small" data-quirk="1" ${canAfford(QUIRK_COST) ? '' : 'disabled'}>炉に投げ込む</button></div>
        <div class="stats">基礎威力 ${Math.round(w.damage * (1 + st.mods.power * 0.1))}${w.pellets > 1 ? `×${w.pellets}` : ''}　装弾 ${Math.round(w.mag * (1 + st.mods.feed * 0.15))}　弱点倍率 ×${w.weakMul}　魔核1つ＝特殊弾 ${Math.round(w.coreRounds * (1 + st.mods.gut * 0.25))}発</div>`;
    }
    return `<h2>工房</h2><div class="wtabs">${ids
      .map((x) => `<button class="wtab ${x === id ? 'on' : ''}" data-sel="${x}">${WEAPONS[x].name}${save.weapons[x].unlocked ? '' : ' 🔒'}</button>`)
      .join('')}</div>${main}`;
  }

  private matsHtml() {
    return `<h2>素材庫</h2><table class="mats">${(Object.keys(MATERIALS) as MatId[])
      .map((k) => `<tr><td><b>${MATERIALS[k].name}</b></td><td class="n">${save.mats[k]}</td><td><small>${MATERIALS[k].desc}</small></td></tr>`)
      .join('')}</table>`;
  }

  private bookHtml() {
    return `<h2>獣図鑑</h2><p class="lore">${LORE.world}</p><table class="book">${Object.values(MONSTERS)
      .map((m) => {
        const c = CORES[m.core];
        const parts = m.parts?.map((p) => p.name).join('・');
        return `<tr><td><b>${m.name}</b><br><small>${m.title}</small></td><td><span class="core-dot" style="background:#${c.color.toString(16).padStart(6, '0')}"></span>${c.name} → <b>${c.ammo}</b><br><small>${c.desc}</small>${parts ? `<br><small class="part">破壊可能部位：${parts}</small>` : ''}</td></tr>`;
      })
      .join('')}
      <tr><td><b>${BOSS.name}</b><br><small>ボス</small></td><td><small>弱点：吊られた頭骨。破壊可能部位：${BOSS.parts.map((p) => p.name).join('・')}。<br>槌頭を壊すと衝撃波が消え、胸甲を壊すと肋骨の奥が弱点になるが動きが速くなる。</small></td></tr></table>`;
  }

  private settingsHtml() {
    return `<h2>設定</h2>
      <label>マウス感度 <input type="range" id="sens" min="0.3" max="2.5" step="0.05" value="${save.sensitivity}"> <span id="sensv">${save.sensitivity.toFixed(2)}</span></label><br>
      <label>音量 <input type="range" id="vol" min="0" max="1" step="0.05" value="${save.volume}"></label><br><br>
      <p class="lore">${LORE.guild}</p>
      <p><small>使用素材の作者・ライセンスは同梱の CREDITS.md を参照。</small></p>
      <button class="act danger" id="reset">セーブデータを消去</button>`;
  }

  private bind(body: HTMLElement) {
    body.querySelectorAll<HTMLElement>('[data-pick]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.pick as WeaponId;
        const lo = save.loadout;
        if (lo.includes(id)) {
          if (lo.length > 1) lo.splice(lo.indexOf(id), 1);
        } else {
          lo.push(id);
          if (lo.length > 2) lo.shift();
        }
        persist();
        audio.play('ui_select', { vol: 0.6 });
        this.render();
      }),
    );
    body.querySelector('#go')?.addEventListener('click', () => {
      audio.play('ui_open', { vol: 0.8 });
      this.onSortie?.([...save.loadout]);
    });
    body.querySelectorAll<HTMLElement>('[data-sel]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sel = b.dataset.sel as WeaponId;
        audio.play('ui_select', { vol: 0.6 });
        this.render();
      }),
    );
    body.querySelectorAll<HTMLElement>('[data-unlock]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.unlock as WeaponId;
        const cost = WEAPONS[id].unlock!;
        if (!canAfford(cost)) return;
        pay(cost);
        save.weapons[id].unlocked = true;
        persist();
        audio.play('jingle_win', { vol: 0.5 });
        this.render();
      }),
    );
    body.querySelectorAll<HTMLElement>('[data-mod]').forEach((b) =>
      b.addEventListener('click', () => {
        const m = b.dataset.mod as ModId;
        const st = save.weapons[this.sel];
        const cost = MODS[m].costs[st.mods[m]];
        if (!cost || !canAfford(cost)) return;
        pay(cost);
        st.mods[m]++;
        persist();
        audio.play('armor_hit', { vol: 0.7 });
        this.render();
      }),
    );
    body.querySelector('[data-quirk]')?.addEventListener('click', () => {
      if (!canAfford(QUIRK_COST)) return;
      pay(QUIRK_COST);
      const st = save.weapons[this.sel];
      const pool = QUIRKS.filter((q) => q.id !== st.quirk);
      st.quirk = pool[Math.floor(Math.random() * pool.length)].id;
      persist();
      audio.play('fire_burst', { vol: 0.6 });
      this.render();
    });
    const sens = body.querySelector<HTMLInputElement>('#sens');
    sens?.addEventListener('input', () => {
      save.sensitivity = parseFloat(sens.value);
      $('sensv').textContent = save.sensitivity.toFixed(2);
      persist();
    });
    const vol = body.querySelector<HTMLInputElement>('#vol');
    vol?.addEventListener('input', () => {
      save.volume = parseFloat(vol.value);
      if (audio.ctx) audio.master.gain.value = save.volume;
      persist();
    });
    body.querySelector('#reset')?.addEventListener('click', () => {
      if (confirm('セーブデータを消去しますか？')) {
        resetSave();
        location.reload();
      }
    });
  }
}
