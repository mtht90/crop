import { ASSET_BASE } from './assets';
import * as THREE from 'three';

export const SFX = [
  'pistol_shot', 'shotgun_shot', 'shotgun_pump', 'clip_in', 'clip_out', 'dry_fire', 'shell_load',
  'bow_draw', 'bow_shoot', 'arrow_hit', 'armor_hit', 'weak_hit', 'heavy_swing', 'devour', 'dodge',
  'spark_hit', 'bounce', 'boss_projectile', 'explosion', 'explosion_small', 'fire_burst', 'poison',
  'ground_slam', 'whirlwind', 'charge', 'part_break', 'mon_pain1', 'mon_pain2', 'mon_death1', 'mon_death2',
  'mon_death3', 'mon_grunt', 'rat_attack', 'rat_death', 'boss_roar', 'boss_grunt', 'boss_growl', 'step1',
  'step2', 'ui_select', 'ui_open', 'pickup', 'jingle_win', 'jingle_lose', 'core_ready',
] as const;
export type SfxKey = (typeof SFX)[number];
export type BgmKey = 'base' | 'field' | 'boss' | 'ambience';

class AudioSys {
  ctx?: AudioContext;
  master!: GainNode;
  sfxGain!: GainNode;
  bgmGain!: GainNode;
  buffers = new Map<string, AudioBuffer>();
  bgmCur?: { src: AudioBufferSourceNode; gain: GainNode; key: BgmKey };
  ambCur?: { src: AudioBufferSourceNode; gain: GainNode };
  listener = new THREE.Vector3();
  listenerFwd = new THREE.Vector3(0, 0, -1);
  volume = { master: 0.8, sfx: 0.9, bgm: 0.45 };

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume.master;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.volume.sfx;
    this.sfxGain.connect(this.master);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.volume.bgm;
    this.bgmGain.connect(this.master);
  }

  async loadAll(onProgress?: (p: number) => void) {
    this.init();
    const list: [string, string][] = [
      ...SFX.map((k) => [k, `audio/sfx/${k}.ogg`] as [string, string]),
      ['bgm_base', 'audio/bgm/base.ogg'],
      ['bgm_field', 'audio/bgm/field.ogg'],
      ['bgm_boss', 'audio/bgm/boss.ogg'],
      ['bgm_ambience', 'audio/bgm/ambience.ogg'],
    ];
    let n = 0;
    await Promise.all(
      list.map(async ([k, f]) => {
        try {
          const r = await fetch(ASSET_BASE + f);
          const ab = await r.arrayBuffer();
          const buf = await this.ctx!.decodeAudioData(ab);
          this.buffers.set(k, buf);
        } catch (e) {
          console.warn('audio load failed', f, e);
        }
        onProgress?.(++n / list.length);
      }),
    );
  }

  resume() {
    this.init();
    if (this.ctx!.state === 'suspended') this.ctx!.resume();
  }

  setListener(pos: THREE.Vector3, fwd: THREE.Vector3) {
    this.listener.copy(pos);
    this.listenerFwd.copy(fwd);
  }

  /** pos があれば距離減衰と左右パンをかける */
  play(key: SfxKey, opts: { vol?: number; rate?: number; pos?: THREE.Vector3; maxDist?: number; offset?: number } = {}) {
    if (!this.ctx) return;
    const buf = this.buffers.get(key);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (0.96 + Math.random() * 0.08);
    const g = this.ctx.createGain();
    let vol = opts.vol ?? 1;
    let node: AudioNode = g;
    if (opts.pos) {
      const d = opts.pos.distanceTo(this.listener);
      const maxD = opts.maxDist ?? 60;
      vol *= Math.max(0, 1 - d / maxD) ** 1.5;
      if (vol <= 0.005) return;
      const pan = this.ctx.createStereoPanner();
      const to = opts.pos.clone().sub(this.listener).setY(0).normalize();
      const right = new THREE.Vector3(-this.listenerFwd.z, 0, this.listenerFwd.x).normalize();
      pan.pan.value = THREE.MathUtils.clamp(to.dot(right), -0.85, 0.85);
      g.connect(pan);
      node = pan;
    }
    g.gain.value = vol;
    src.connect(g);
    node.connect(this.sfxGain);
    src.start(0, opts.offset ?? 0);
    return src;
  }

  playBgm(key: BgmKey, fade = 1.5) {
    if (!this.ctx) return;
    if (this.bgmCur?.key === key) return;
    const now = this.ctx.currentTime;
    if (this.bgmCur) {
      const old = this.bgmCur;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + fade);
      old.src.stop(now + fade + 0.1);
      this.bgmCur = undefined;
    }
    const buf = this.buffers.get('bgm_' + key);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);
    src.connect(gain).connect(this.bgmGain);
    src.start();
    this.bgmCur = { src, gain, key };
  }

  stopBgm(fade = 1) {
    if (!this.ctx || !this.bgmCur) return;
    const now = this.ctx.currentTime;
    this.bgmCur.gain.gain.setValueAtTime(this.bgmCur.gain.gain.value, now);
    this.bgmCur.gain.gain.linearRampToValueAtTime(0, now + fade);
    this.bgmCur.src.stop(now + fade + 0.1);
    this.bgmCur = undefined;
  }

  ambience(on: boolean) {
    if (!this.ctx) return;
    if (on && !this.ambCur) {
      const buf = this.buffers.get('bgm_ambience');
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.35;
      src.connect(gain).connect(this.sfxGain);
      src.start();
      this.ambCur = { src, gain };
    } else if (!on && this.ambCur) {
      this.ambCur.src.stop();
      this.ambCur = undefined;
    }
  }
}

export const audio = new AudioSys();
