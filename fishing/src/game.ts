import * as THREE from 'three';
import { AudioEngine } from './audio/audio';
import { Input } from './core/input';
import { addToCooler, coolerCapacity, registerCatch, release } from './core/progress';
import { clearSave, loadSave, newSave, writeSave, type CatchRecord, type SaveData } from './core/save';
import { RARITY_LABEL, WEATHER_LABEL, type Species, type Weather, WEATHERS } from './data/types';
import { FishingController } from './fishing/fishing';
import { FishPreview } from './render/preview';
import { GameClock } from './sim/environment';
import type { FishInstance } from './sim/individual';
import { Rng } from './sim/rng';
import { showCatch } from './ui/catchPanel';
import { openDex } from './ui/dexPanel';
import { Hud } from './ui/hud';
import { TouchControls } from './ui/touch';
import { preloadFishModels } from './render/fishMesh';
import { openMap, openPause, openTackle, titleScreen } from './ui/menus';
import { Modals } from './ui/modal';
import { openShop } from './ui/shopPanel';
import { Atmosphere } from './world/atmosphere';
import { HUT, SPAWN, waterDepth } from './world/lakeShape';
import { LakeWorld } from './world/lakeWorld';
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
  private world: LakeWorld;
  private player: Player;
  private audio = new AudioEngine();
  private fishing: FishingController;
  private hud: Hud;
  private modals: Modals;
  private preview = new FishPreview();
  private touch: TouchControls;
  private danger: HTMLDivElement;
  private mode: Mode = 'title';
  private title: HTMLElement | null = null;
  private headlamp = new THREE.SpotLight(0xfff0d8, 0, 45, 0.55, 0.6, 1.2);
  private fishYaw = 0;
  private last = performance.now();
  private hudTimer = 0;
  private saveTimer = 0;
  private titleT = 0;
  private suppressPause = false;
  private catchOpen = false;
  private touchState: { mode: 'walk' | 'fish'; canFish: boolean; nearHut: boolean } = { mode: 'walk', canFish: false, nearHut: false };

  constructor(app: HTMLElement, private uiRoot: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const low = new URLSearchParams(location.search).get('q') === 'low';
    this.renderer.setPixelRatio(low ? 0.5 : Math.min(1.5, devicePixelRatio));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    app.append(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);

    this.save = loadSave() ?? newSave();
    const rng = new Rng();
    this.clock = new GameClock(this.save.clock, rng);
    this.atmo = new Atmosphere(this.scene, this.renderer);
    this.atmo.setWeather(this.clock.weather, true);
    this.atmo.onThunder = (d, p) => this.audio.thunder(d, p);
    this.world = new LakeWorld();
    this.scene.add(this.world.group);
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
    void preloadFishModels();
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

    this.renderer.domElement.addEventListener('click', () => {
      this.audio.init();
      if (this.mode !== 'title' && !this.modals.isOpen) this.input.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.mode !== 'title' && !this.modals.isOpen && !this.suppressPause && !this.catchOpen) this.openPause();
      this.suppressPause = false;
    });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    addEventListener('beforeunload', () => this.persist());

    this.applySettings();
    this.devOverrides();
    if (this.mode === 'title') this.showTitle();
    this.renderer.setAnimationLoop(() => this.frame());
    (window as unknown as { __game: Game }).__game = this;
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
    this.title = titleScreen(this.uiRoot, !!loadSave(), (fresh) => void preloadFishModels().then(() => this.start(fresh)));
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
      this.title?.remove();
      this.title = null;
      this.mode = 'walk';
      this.hud.setVisible(true);
      this.player.x = SPAWN.x;
      this.player.z = SPAWN.z;
      this.player.yaw = SPAWN.yaw;
      this.player.pitch = -0.05;
      this.input.lock();
      const t = this.input.touch;
      this.hud.toast(t ? '翠ヶ湖へようこそ。水辺で「釣る」を押して釣りを始めよう' : '翠ヶ湖へようこそ。水辺で F を押して釣りを始めよう', 'good');
      if (fresh) this.hud.toast(t ? '釣った魚は図鑑に登録される。小屋で売って道具を揃えよう' : '釣った魚は図鑑(Tab)に登録される。小屋(E)で売って道具を揃えよう', 'info');
      this.persist();
    }
  }

  private applySettings(): void {
    const s = this.save.settings;
    this.audio.setVolumes({ master: s.master, bgm: s.bgm, sfx: s.sfx });
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
    if (s.rarity === 'legend') this.hud.toast(`伝説の魚 ${s.name} を釣り上げた！！`, 'big');
    else if (RARITY_RANK[s.rarity] >= 2) this.hud.toast(`${RARITY_LABEL[s.rarity]}！ ${s.name}`, 'big');
    this.catchOpen = true;
    const full = this.save.cooler.length >= coolerCapacity(this.save);
    const choice = await showCatch(this.modals, this.preview, s, fish, res, full);
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
      else if (input.hit('KeyI') && !this.fishing.busy) openTackle(this.modals, this.save, () => (this.fishing.rod.setLureColor(this.fishing.lureDef.color), this.persist()));
      else if (input.hit('KeyM')) openMap(this.modals, this.save);
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
      if (this.nearHut()) {
        prompt = '<b>[E]</b> 釣り小屋に入る';
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
      this.touchState = { mode: 'walk', canFish: prompt?.includes('釣り') ?? false, nearHut: this.nearHut() };
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
      const fighting = this.fishing.phase === 'fight';
      if (input.enabled) {
        if (fighting) {
          // ファイト中はマウス左右で竿を操作し、視点は魚を追う
          const hint = this.fishing.cameraYawHint;
          if (hint !== null) {
            let d = hint - this.player.yaw;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            this.player.yaw += d * Math.min(1, dt * 2.5);
          }
          this.player.pitch -= input.mouseDY * 0.0022 * sens;
          this.player.pitch = Math.max(-0.9, Math.min(0.5, this.player.pitch));
        } else if (this.fishing.phase !== 'landing') {
          const cl = input.cursorLook(dt);
          input.mouseDX += cl.dx;
          input.mouseDY += cl.dy;
          this.player.look(input, sens, { center: this.fishYaw, range: 1.4 });
        }
        if (fresh && input.hit('KeyF') && !this.fishing.busy) this.exitFishing();
        if (fresh && input.hit('KeyR') && this.fishing.lureDef.pack && this.fishing.phase === 'ready') {
          this.fishing.cycleFloat();
          this.hud.toast(this.save.floatDepth > 0 ? `ウキ下 ${this.save.floatDepth}m` : 'ウキなし（底まで沈める）', 'info');
        }
      }
      this.player.applyTo(this.camera, 0);
      if (!paused) this.fishing.update(dt, input, this.player, sens);
      // 魚の引きで画面が揺れる
      const sh = this.fishing.shake;
      if (sh > 0.001) {
        const t = now / 1000;
        this.camera.position.x += Math.sin(t * 53) * sh * 0.025;
        this.camera.position.y += Math.sin(t * 61 + 1) * sh * 0.02;
        this.camera.rotation.z += Math.sin(t * 37) * sh * 0.012;
      }
      this.hud.setPrompt(!input.active && !this.modals.isOpen ? 'クリックで操作を再開' : null);
      this.touchState = { mode: 'fish', canFish: false, nearHut: false };
      const ph = this.fishing.phase;
      this.hud.setKeys(
        ph === 'fight'
          ? [
              ['左長押し', '巻く'],
              ['マウス左右', '竿を倒す'],
              ['ホイール', 'ドラグ調整'],
            ]
          : ph === 'water'
            ? [
                ['左長押し', '巻く（Shiftでゆっくり）'],
                ['右クリック', 'アクション / アワセ'],
              ]
            : [
                ['左長押し→離す', 'キャスト'],
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
      isBait: !!this.fishing.lureDef.pack,
      hasBite: this.fishing.hasBite,
    });
    this.audio.setAmbient({ wind: this.atmo.wave, rain: this.atmo.rainAmount, night, water: this.mode === 'title' ? 0.5 : 1 });
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
    if (this.mode === 'fish' && this.fishing.phase === 'charging') this.hud.setFishing(this.fishing.hud(), this.save.settings.showStamina);

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
