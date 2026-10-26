import * as THREE from 'three';
import { AudioEngine } from './audio/audio';
import { Input } from './core/input';
import { addToCooler, coolerCapacity, registerCatch, release } from './core/progress';
import { clearSave, loadSave, newSave, writeSave, type CatchRecord, type SaveData } from './core/save';
import { RARITY_LABEL, WEATHER_LABEL, type Species, type Weather, WEATHERS } from './data/types';
import { FishingController } from './fishing/fishing';
import { HOOK_HOLD_LABEL } from './sim/fight';
import { FishPopulation } from './fishing/population';
import { FishPreview } from './render/preview';
import { GameClock } from './sim/environment';
import type { FishInstance } from './sim/individual';
import { Rng } from './sim/rng';
import { showCatch } from './ui/catchPanel';
import { openDex } from './ui/dexPanel';
import { Hud } from './ui/hud';
import { TouchControls } from './ui/touch';
import { fishModelsReady, modelIdsFor, preloadFishModels, UNDERWATER } from './render/fishMesh';
import { SPOTS } from './data/spots';
import { speciesForSpot } from './data/species';
import { openMap, openPause, openTackle, titleScreen } from './ui/menus';
import { Modals } from './ui/modal';
import { openShop } from './ui/shopPanel';
import { openNpc } from './ui/npcPanel';
import { NpcLayer } from './world/npcs';
import { NPCS } from './data/npcs';
import { Atmosphere } from './world/atmosphere';
import { HUT, SPAWN, currentArea, onDock, setArea, waterDepth } from './world/shape';
import { LakeWorld } from './world/lakeWorld';
import { CoastWorld } from './world/coastWorld';
import type { FishingWorld } from './world/common';
import { LAKE } from './world/shapes/lake';
import { COAST } from './world/shapes/coast';
import type { FishModelId } from './data/types';
import { Player } from './world/player';

type Mode = 'title' | 'walk' | 'fish';

const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legend: 4 };

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 6000);
  private input: Input;
  private save: SaveData;
  private clock: GameClock;
  private atmo: Atmosphere;
  private world!: FishingWorld;
  /** 今いる釣り場の魚のモデル */
  private areaModels: FishModelId[] = [];
  private npcs!: NpcLayer;
  private player: Player;
  private audio = new AudioEngine();
  private fishing: FishingController;
  private hud: Hud;
  private modals: Modals;
  private preview = new FishPreview();
  private touch: TouchControls;
  private danger: HTMLDivElement;
  private strain: HTMLDivElement;
  private baseFov = 70;
  private mode: Mode = 'title';
  private title: HTMLElement | null = null;
  private headlamp = new THREE.SpotLight(0xfff0d8, 0, 45, 0.55, 0.6, 1.2);
  private fishYaw = 0;
  private last = performance.now();
  private hudTimer = 0;
  private population: FishPopulation;
  private lastPlayerPos = { x: 0, z: 0 };
  private playerSpeed = 0;
  private saveTimer = 0;
  private titleT = 0;
  private suppressPause = false;
  private catchOpen = false;
  private mobile = false;
  private touchState: { mode: 'walk' | 'fish'; canFish: boolean; nearHut: boolean; talk?: boolean } = { mode: 'walk', canFish: false, nearHut: false };

  constructor(app: HTMLElement, private uiRoot: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const low = new URLSearchParams(location.search).get('q') === 'low';
    // スマホは描画負荷を抑える（解像度と影）
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(low ? 0.5 : mobile ? Math.min(1.25, devicePixelRatio) : Math.min(1.5, devicePixelRatio));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = !low;
    this.mobile = mobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    app.append(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);

    this.save = loadSave() ?? newSave();
    const rng = new Rng();
    this.clock = new GameClock(this.save.clock, rng);
    this.atmo = new Atmosphere(this.scene, this.renderer);
    this.atmo.setWeather(this.clock.weather, true);
    if (this.mobile) this.atmo.sun.shadow.mapSize.set(1024, 1024);
    this.atmo.onThunder = (d, p) => this.audio.thunder(d, p);
    const qa = new URLSearchParams(location.search).get('area');
    if (qa) this.save.area = qa;
    if (!SPOTS.some((s) => s.id === this.save.area && s.implemented)) this.save.area = 'lake';
    this.buildWorld(this.save.area);
    this.player = new Player(SPAWN.x, SPAWN.z, SPAWN.yaw, this.world.colliders);
    this.scene.add(this.camera);
    this.camera.add(this.headlamp);
    this.headlamp.position.set(0, 0, 0);
    this.headlamp.target.position.set(0, -0.3, -1);
    this.camera.add(this.headlamp.target);

    this.hud = new Hud(uiRoot);
    this.danger = document.createElement('div');
    this.danger.className = 'danger';
    uiRoot.append(this.danger);
    this.strain = document.createElement('div');
    this.strain.className = 'strain';
    uiRoot.prepend(this.strain);
    this.touch = new TouchControls(uiRoot, this.input, () => {
      if (!this.modals.isOpen && this.mode !== 'title') this.openPause();
    });
    this.modals = new Modals(uiRoot);
    this.modals.onChange = (open) => {
      this.input.enabled = !open;
      if (open) {
        this.suppressPause = true;
        this.input.unlock();
      } else if (this.mode !== 'title') {
        this.input.lock();
      }
    };

    this.fishing = new FishingController(this.scene, this.camera, this.save, this.clock, this.audio, {
      toast: (t, k) => this.hud.toast(t, k),
      onCatch: (f, s, r) => void this.onCatch(f, s, r),
      onLost: () => this.persist(),
    });
    this.fishing.rod.setTackle(this.fishing.lureDef);
    this.population = new FishPopulation(this.scene, new Rng(), (x, z, size) => this.fishing.fx.ripple(x, z, size));
    this.fishing.population = this.population;
    let spookTold = false;
    this.population.onPlayerSpooked = () => {
      if (spookTold || this.save.stats.caught >= 2) return;
      spookTold = true;
      this.hud.toast('足音で魚が逃げた。水辺では静かに歩こう', 'info');
    };

    this.renderer.domElement.addEventListener('click', () => {
      this.audio.init();
      if (this.mode !== 'title' && !this.modals.isOpen) this.input.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.mode !== 'title' && !this.modals.isOpen && !this.suppressPause && !this.catchOpen) this.openPause();
      this.suppressPause = false;
    });
    const resize = () => {
      this.camera.aspect = innerWidth / innerHeight;
      // 縦持ちでは横の視野が狭くなるので画角を広げる
      this.baseFov = this.camera.aspect < 1 ? 88 : 70;
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    };
    addEventListener('resize', resize);
    resize();
    addEventListener('beforeunload', () => this.persist());

    this.applySettings();
    this.devOverrides();
    if (this.mode === 'title') this.showTitle();
    this.renderer.setAnimationLoop(() => this.frame());
    (window as unknown as { __game: Game }).__game = this;
  }

  /** 釣り場の地形・見た目を作る（前の釣り場は片付ける） */
  private buildWorld(id: string): void {
    setArea(id === 'coast' ? COAST : LAKE);
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    this.world = id === 'coast' ? new CoastWorld() : new LakeWorld();
    this.scene.add(this.world.group);
    this.npcs ??= new NpcLayer(this.scene);
    void this.npcs.setArea(id, this.world.colliders);
    this.areaModels = modelIdsFor(speciesForSpot(id));
    void preloadFishModels(this.areaModels);
  }

  /** マップから別の釣り場へ移動する */
  private travel(id: string): void {
    const spot = SPOTS.find((s) => s.id === id);
    if (!spot || !spot.implemented || id === this.save.area) return;
    this.exitFishing();
    this.population.clear();
    this.save.area = id;
    this.buildWorld(id);
    this.player.setColliders(this.world.colliders);
    this.player.x = SPAWN.x;
    this.player.z = SPAWN.z;
    this.player.yaw = SPAWN.yaw;
    this.player.pitch = -0.05;
    this.player.y = this.player.groundAt(SPAWN.x, SPAWN.z);
    this.lastPlayerPos = { x: SPAWN.x, z: SPAWN.z };
    // 活き餌の小魚は釣り場ごとに違う
    this.fishing.rod.setTackle(this.fishing.lureDef);
    this.hud.toast(`${spot.name}に着いた`, 'good');
    this.persist();
  }

  /** 湖を泳ぐ魚と水の見え方（天気で濁り、偏光グラスで照り返しが減る） */
  private updateWaterLife(dt: number, t: number): void {
    const glasses = this.save.gear.includes('polarized');
    const clear = { sunny: 1, cloudy: 0.85, fog: 0.7, rain: 0.5, storm: 0.3 }[this.clock.weather];
    const night = this.atmo.night;
    this.world.setClarity(clear * (glasses ? 1 : 0.65) * (1 - 0.6 * night), glasses ? 0.4 : 1);
    UNDERWATER.uMurk.value = (0.22 / clear) * (glasses ? 0.6 : 1);
    // 海は青く、湖は緑がかる
    if (currentArea().sea) UNDERWATER.uWaterCol.value.setRGB(0.04, 0.12, 0.16).multiplyScalar(1 - 0.85 * night);
    else UNDERWATER.uWaterCol.value.setRGB(0.07, 0.13, 0.11).multiplyScalar(1 - 0.85 * night);
    if (this.mode === 'title' || !fishModelsReady(this.areaModels) || dt <= 0) return;
    const p = this.player;
    // 瞬間移動（開始・寝て起きた等）は歩いたことにしない
    const step = Math.hypot(p.x - this.lastPlayerPos.x, p.z - this.lastPlayerPos.z);
    const moved = step > 2 ? 0 : step / dt;
    this.playerSpeed += (Math.min(10, moved) - this.playerSpeed) * Math.min(1, dt * 6);
    this.lastPlayerPos = { x: p.x, z: p.z };
    this.population.update(
      dt,
      { x: p.x, z: p.z, speed: this.playerSpeed, onDock: onDock(p.x, p.z) },
      { time: this.clock.timeBand, weather: this.clock.weather, season: this.clock.season },
      t,
    );
  }

  /** 開発・確認用：?start&hour=17&weather=rain&fish=1 */
  private devOverrides(): void {
    const q = new URLSearchParams(location.search);
    if (q.has('nolock')) {
      this.input.forceLocked = true;
      this.input.locked = true;
    }
    if (q.has('hour')) this.clock.setTime(Number(q.get('hour')) * 60);
    const w = q.get('weather') as Weather | null;
    if (w && WEATHERS.includes(w)) {
      this.clock.weather = w;
      this.atmo.setWeather(w, true);
    }
    if (q.has('start')) {
      this.mode = 'walk';
      if (q.has('yaw')) this.player.yaw = Number(q.get('yaw'));
      if (q.has('pitch')) this.player.pitch = Number(q.get('pitch'));
      if (q.has('x')) {
        this.player.x = Number(q.get('x'));
        this.player.z = Number(q.get('z'));
        this.player.y = this.player.groundAt(this.player.x, this.player.z);
      }
      if (q.has('fish')) this.enterFishing();
    }
  }

  private showTitle(): void {
    this.mode = 'title';
    this.hud.setVisible(false);
    this.title?.remove();
    this.title = titleScreen(this.uiRoot, !!loadSave(), (fresh) => {
      // 読み込み中の表示。モデルの読み込みに失敗してもゲームは始める
      const btns = this.title?.querySelectorAll('button');
      btns?.forEach((b) => ((b as HTMLButtonElement).disabled = true));
      const first = btns?.[0] as HTMLButtonElement | undefined;
      if (first) first.textContent = '読み込み中…';
      void preloadFishModels(this.areaModels)
        .catch((e) => console.warn('fish models failed', e))
        .then(() => this.start(fresh));
    });
    this.audio.setMood('title');
  }

  private start(fresh: boolean): void {
    {
      this.audio.init();
      if (fresh) {
        clearSave();
        Object.assign(this.save, newSave());
        this.clock.day = this.save.clock.day;
        this.clock.weather = this.save.clock.weather;
        this.clock.setTime(this.save.clock.minutes);
        this.atmo.setWeather(this.clock.weather, true);
      }
      // 最初から始めた時など、表示中の釣り場とセーブの現在地が違えば作り直す
      if (currentArea().id !== this.save.area) {
        this.population.clear();
        this.buildWorld(this.save.area);
        this.player.setColliders(this.world.colliders);
      }
      this.title?.remove();
      this.title = null;
      this.mode = 'walk';
      this.hud.setVisible(true);
      this.player.x = SPAWN.x;
      this.player.z = SPAWN.z;
      this.player.yaw = SPAWN.yaw;
      this.player.pitch = -0.05;
      this.player.y = this.player.groundAt(SPAWN.x, SPAWN.z);
      this.input.lock();
      const t = this.input.touch;
      const name = SPOTS.find((s) => s.id === this.save.area)?.name ?? '翠ヶ湖';
      this.hud.toast(t ? `${name}へようこそ。水辺で「釣る」を押して釣りを始めよう` : `${name}へようこそ。水辺で F を押して釣りを始めよう`, 'good');
      if (fresh) this.hud.toast(t ? '釣った魚は図鑑に登録される。小屋で売って道具を揃えよう' : '釣った魚は図鑑(Tab)に登録される。小屋(E)で売って道具を揃えよう', 'info');
      this.persist();
    }
  }

  private applySettings(): void {
    const s = this.save.settings;
    this.audio.setVolumes({ master: s.master, bgm: s.bgm, sfx: s.sfx });
    this.fishing.feel = s.feel;
  }

  /**
   * 魚に引かれる体感：視点ごと前へ・魚の方へ持っていかれ、衝撃で前のめりになり、
   * 強く引かれるほど視界が狭まる（振動の代わり）
   */
  private applyPullFeel(): void {
    const F = this.mode === 'fish' ? this.save.settings.feel : 0;
    const lean = this.fishing.lean * F;
    const lu = this.fishing.lurch * F;
    const pan = this.fishing.fishPan;
    if (lean > 0.001 || Math.abs(lu) > 0.001) {
      this.camera.translateZ(-(lean * 0.18 + lu * 0.16));
      this.camera.position.y -= lean * 0.05 + lu * 0.06;
      this.camera.rotation.x -= lean * 0.07 + lu * 0.07;
      this.camera.rotation.y -= pan * lean * 0.07;
      this.camera.rotation.z -= pan * (lean * 0.04 + lu * 0.03);
    }
    const fov = this.baseFov * (1 - Math.min(0.12, lean * 0.04 + Math.max(0, lu) * 0.05));
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.strain.style.opacity = String(Math.min(0.9, lean * 0.55 + Math.max(0, lu) * 0.35));
  }

  private persist(): void {
    this.save.clock = this.clock.toState();
    writeSave(this.save);
  }

  private openPause(): void {
    openPause(this.modals, this.save, {
      onSettings: () => {
        this.applySettings();
        this.persist();
      },
      onReset: () => {
        clearSave();
        location.reload();
      },
      onTitle: () => {
        this.persist();
        this.modals.close(true);
        this.input.enabled = true;
        this.exitFishing();
        this.showTitle();
      },
    });
  }

  private enterFishing(): void {
    this.mode = 'fish';
    this.fishYaw = this.player.yaw;
    this.fishing.enter(this.player);
  }

  private exitFishing(): void {
    if (this.mode === 'fish') this.fishing.exit();
    if (this.mode !== 'title') this.mode = 'walk';
  }

  private canFishHere(): boolean {
    const f = this.player.forward();
    for (const d of [2.5, 4, 6]) {
      if (waterDepth(this.player.x + f.x * d, this.player.z + f.z * d) > 0.4) return true;
    }
    return false;
  }

  private nearHut(): boolean {
    const doorX = HUT.x - HUT.d / 2 - 1.2;
    return Math.hypot(this.player.x - doorX, this.player.z - HUT.z) < 4;
  }

  private async onCatch(fish: FishInstance, s: Species, record: CatchRecord): Promise<void> {
    const res = registerCatch(this.save, fish, s, record);
    this.audio.land(RARITY_RANK[s.rarity]);
    if (fish.colorId || fish.patternId) this.audio.sparkle();
    if (s.rarity === 'legend') this.hud.toast(`伝説の魚 — ${s.name}`, 'big');
    else if (RARITY_RANK[s.rarity] >= 2) this.hud.toast(`${RARITY_LABEL[s.rarity]} — ${s.name}`, 'big');
    this.catchOpen = true;
    const full = this.save.cooler.length >= coolerCapacity(this.save);
    const choice = await showCatch(this.modals, this.preview, s, fish, res, full, record.hook ? HOOK_HOLD_LABEL[record.hook] : undefined);
    this.catchOpen = false;
    if (choice === 'keep' && addToCooler(this.save, fish, record)) {
      this.hud.toast(`${s.name}をクーラーに入れた`, 'good');
    } else {
      const v = release(this.save, fish);
      this.hud.toast(`リリースした（放流協力金 +¥${v}）`, 'good');
      this.fishing.fx.splash(this.camera.position.x + this.player.forward().x * 2, this.camera.position.z + this.player.forward().z * 2, 0.4);
    }
    this.persist();
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const paused = this.modals.isOpen || this.mode === 'title';
    const input = this.input;

    if (!paused) {
      const changed = this.clock.advance(dt);
      if (changed) {
        this.atmo.setWeather(this.clock.weather);
        this.hud.toast(`天気が変わった：${WEATHER_LABEL[this.clock.weather]}`, 'info');
        this.persist();
      }
    }

    // グローバルキー（モーダルを閉じたキーで別の操作をしない）
    const fresh = now - this.modals.lastClosed > 150;
    if (this.mode !== 'title' && !this.modals.isOpen && fresh) {
      if (input.hit('Tab')) openDex(this.modals, this.preview, this.save);
      else if (input.hit('KeyI') && !this.fishing.busy) openTackle(this.modals, this.save, () => (this.fishing.rod.setTackle(this.fishing.lureDef), this.persist()));
      else if (input.hit('KeyM')) openMap(this.modals, this.save, (id) => this.travel(id));
    }

    const sens = this.save.settings.sensitivity;
    if (this.mode === 'title') {
      this.titleT += dt;
      this.camera.position.set(Math.cos(this.titleT * 0.03) * 60 + 20, 9, Math.sin(this.titleT * 0.03) * 60 + 10);
      this.camera.lookAt(-30, 2, 0);
    } else if (this.mode === 'walk') {
      if (input.enabled) {
        const cl = input.cursorLook(dt);
        input.mouseDX += cl.dx;
        input.mouseDY += cl.dy;
        this.player.look(input, sens);
        this.player.move(input, dt);
      }
      this.player.applyTo(this.camera);
      let prompt: string | null = null;
      const npc = this.npcs.nearest(this.player.x, this.player.z);
      if (npc) {
        prompt = `<b>[E]</b> ${npc.name}に話しかける`;
        if (input.hit('KeyE') && input.enabled) {
          openNpc(this.modals, this.save, npc, this.clock.day, {
            onDeliver: (r) => {
              this.audio.coin();
              this.npcs.emote(npc.id);
              this.hud.toast(`依頼達成！ +¥${r.toLocaleString('ja-JP')}`, 'good');
              this.persist();
            },
          });
          this.persist();
        }
      } else if (this.nearHut()) {
        prompt = `<b>[E]</b> ${currentArea().id === 'coast' ? '釣具店' : '釣り小屋'}に入る`;
        if (input.hit('KeyE') && input.enabled) {
          openShop(this.modals, this.save, {
            onChange: () => this.persist(),
            coin: () => this.audio.coin(),
            rest: (hrs) => {
              if (hrs === 'morning') this.clock.sleep();
              else this.clock.advanceMinutes(hrs * 60);
              this.atmo.setWeather(this.clock.weather, true);
              this.hud.toast(hrs === 'morning' ? `${this.clock.day}日目の朝になった` : `${hrs}時間休んだ`, 'info');
              this.persist();
            },
          });
        }
      } else if (this.canFishHere()) {
        prompt = '<b>[F]</b> 釣りをする';
        if (input.hit('KeyF') && input.enabled) this.enterFishing();
      }
      if (!input.active && !this.modals.isOpen) prompt = 'クリックで操作を再開';
      this.hud.setGuide(null);
      this.touchState = { mode: 'walk', canFish: prompt?.includes('釣りをする') ?? false, nearHut: !!npc || this.nearHut(), talk: !!npc };
      this.hud.setPrompt(prompt);
      this.hud.setKeys([
        ['W A S D', '移動'],
        ['Shift', '走る'],
        ['Tab', '図鑑'],
        ['I', 'タックル'],
        ['M', 'マップ'],
        ['Esc', 'メニュー'],
      ]);
    } else if (this.mode === 'fish') {
      if (input.enabled) {
        const ph = this.fishing.phase;
        if (ph === 'ready' && !input.touch) {
          // 構え：PCは視点を動かして狙う（スマホは画面を引っぱるとそのままキャストの狙いになる）
          const cl = input.cursorLook(dt);
          input.mouseDX += cl.dx;
          input.mouseDY += cl.dy;
          this.player.look(input, sens, { center: this.fishYaw, range: 1.4 });
        } else if (ph === 'water' || ph === 'fight' || ph === 'net') {
          // 投げた後はマウス・ドラッグで竿を操作するので、視点は仕掛け・魚を自動で追う
          const hint = this.fishing.cameraYawHint;
          if (hint !== null) {
            let d = hint - this.player.yaw;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            this.player.yaw += d * Math.min(1, dt * (ph === 'water' ? 1.2 : 2.5));
          }
          this.player.pitch += ((ph === 'net' ? -0.3 : -0.16) - this.player.pitch) * Math.min(1, dt * 2);
        }
        if (fresh && input.hit('KeyF') && !this.fishing.busy) this.exitFishing();
        if (fresh && input.hit('KeyR') && this.fishing.lureDef.pack && this.fishing.phase === 'ready') {
          this.fishing.cycleFloat();
          this.hud.toast(this.save.floatDepth > 0 ? `ウキ下 ${this.save.floatDepth}m` : 'ウキなし（底まで沈める）', 'info');
        }
      }
      this.player.applyTo(this.camera, 0);
      // 魚の引きで画面が揺れる・体ごと持っていかれる。
      // 竿はカメラに付いているので、竿先の位置から糸を描く前にカメラを動かし終える
      const sh = this.fishing.shake;
      if (sh > 0.001) {
        const t = now / 1000;
        this.camera.position.x += Math.sin(t * 53) * sh * 0.025;
        this.camera.position.y += Math.sin(t * 61 + 1) * sh * 0.02;
        this.camera.rotation.z += Math.sin(t * 37) * sh * 0.012;
      }
      this.applyPullFeel();
      this.camera.updateMatrixWorld();
      if (!paused) this.fishing.update(dt, input, this.player, sens);
      this.hud.setPrompt(!input.active && !this.modals.isOpen ? 'クリックで操作を再開' : null);
      this.touchState = { mode: 'fish', canFish: false, nearHut: false };
      this.hud.setGuide(this.fishing.guide(input.touch));
      const ph = this.fishing.phase;
      this.hud.setKeys(
        ph === 'net'
          ? [['マウスを上へ', '抜き上げる']]
          : ph === 'fight'
          ? [
              ['左長押し', '巻く'],
              ['マウス上下', '竿を立てる／寝かせる'],
              ['マウス左右', '竿を倒す（魚と逆へ）'],
              ['ホイール', 'ドラグ調整'],
            ]
          : ph === 'water'
            ? [
                ['左長押し', '巻く（Shiftでゆっくり）'],
                ['マウスを上へ振る', '誘い／アワセ'],
                ['マウスを下げる', '竿を寝かせる'],
              ]
            : [
                ['左ドラッグ', '引っぱって離す（反対へ飛ぶ）'],
                ['R', 'ウキ下（エサ）'],
                ['I', 'タックル'],
                ['F', '釣りをやめる'],
                ['Tab', '図鑑'],
              ],
      );
    }

    // 世界の更新
    this.atmo.update(dt, this.clock.hour, this.camera, this.renderer);
    this.world.update(dt, this.atmo.wave);
    if (this.mode !== 'title') {
      // 今日の依頼がまだ済んでいない人の頭に「！」
      const marks = new Set<string>();
      for (const n of NPCS) if (n.area === this.save.area && !(this.save.requests[n.id]?.day === this.clock.day && this.save.requests[n.id]?.done)) marks.add(n.id);
      this.npcs.update(dt, this.player, marks);
    }
    this.updateWaterLife(dt, now / 1000);
    if (this.world.water.material.uniforms.sunDirection) this.world.water.material.uniforms.sunDirection.value.copy(this.atmo.sunDir);
    const night = this.atmo.night;
    for (const l of this.world.nightLights) l.intensity = night * 14;
    for (const m of this.world.windowMats) m.emissiveIntensity = night * 1.5;
    this.headlamp.intensity = night > 0.55 && this.mode !== 'title' ? 18 * night : 0;
    this.hud.flash.style.opacity = String(this.atmo.flashLevel * 0.35);
    const dg = this.mode === 'fish' ? this.fishing.danger : 0;
    this.danger.style.opacity = String(dg * (0.6 + 0.4 * Math.sin(now / 90)));
    this.touch.update({
      mode: this.mode === 'title' || this.modals.isOpen ? 'hidden' : this.touchState.mode,
      phase: this.fishing.phase,
      canFish: this.touchState.canFish,
      nearHut: this.touchState.nearHut,
      talk: !!this.touchState.talk,
      isBait: !!this.fishing.lureDef.pack,
      hasBite: this.fishing.hasBite,
    });
    // 海は波音が大きい
    this.audio.setAmbient({ wind: this.atmo.wave, rain: this.atmo.rainAmount, night, water: this.mode === 'title' ? 0.5 : currentArea().sea ? 1.8 : 1 });
    this.audio.setMood(this.mode === 'title' ? 'title' : this.clock.weather === 'storm' ? 'storm' : night > 0.6 ? 'night' : 'day');
    this.audio.tick();

    // HUD（間引いて更新）
    this.hudTimer -= dt;
    if (this.hudTimer <= 0 && this.mode !== 'title') {
      this.hudTimer = 1 / 12;
      this.hud.setStatus({
        day: this.clock.day,
        clock: this.clock.label,
        time: this.clock.timeBand,
        weather: this.clock.weather,
        season: this.clock.season,
        money: this.save.money,
        cooler: `${this.save.cooler.length}/${coolerCapacity(this.save)}`,
      });
      this.hud.setFishing(this.mode === 'fish' ? this.fishing.hud() : null, this.save.settings.showStamina);
    }
    if (this.mode === 'fish' && ['aiming', 'net'].includes(this.fishing.phase)) this.hud.setFishing(this.fishing.hud(), this.save.settings.showStamina);

    this.saveTimer += dt;
    if (this.saveTimer > 30 && this.mode !== 'title') {
      this.saveTimer = 0;
      this.persist();
    }
    if (this.mode !== 'fish') this.fishing.fx.update(dt);

    input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
}
