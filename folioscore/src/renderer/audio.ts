import { WorkletSynthesizer, audioBufferToWav } from 'spessasynth_lib';
import { BasicMIDI } from 'spessasynth_core';
import { buildPlayList, TPQ, type PlayNote, type Score } from './model.ts';
import { channelForPart, scoreToMidi } from './midi.ts';
import { instrumentById } from './instruments.ts';

/** 同梱 SoundFont を使った再生エンジン */
export class AudioEngine {
  ctx: AudioContext | null = null;
  synth: WorkletSynthesizer | null = null;
  private processorUrl = '';
  private soundBank: ArrayBuffer | null = null;
  private timer: number | null = null;
  private raf = 0;
  private programs = new Map<number, number>();
  playing = false;
  status = '音源を読み込み中…';

  async init(processorCode: string, soundBank: ArrayBuffer): Promise<void> {
    this.soundBank = soundBank;
    this.processorUrl = URL.createObjectURL(new Blob([processorCode], { type: 'text/javascript' }));
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule(this.processorUrl);
    const synth = new WorkletSynthesizer(this.ctx);
    synth.connect(this.ctx.destination);
    await synth.soundBankManager.addSoundBank(soundBank.slice(0), 'main');
    await synth.isReady;
    this.synth = synth;
    this.status = '音源: MuseScore General';
  }

  get ready(): boolean { return !!this.synth; }

  private async resume() {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  private setProgram(ch: number, program: number) {
    if (this.programs.get(ch) === program) return;
    this.synth!.programChange(ch, program);
    this.programs.set(ch, program);
  }

  applyParts(score: Score) {
    if (!this.synth) return;
    score.parts.forEach((p, i) => {
      const ch = channelForPart(i);
      this.setProgram(ch, instrumentById(p.instrument).program);
      this.synth!.controllerChange(ch, 7, Math.round((p.volume / 100) * 127));
    });
  }

  /** 入力時・鍵盤クリック時の発音 */
  async previewNotes(score: Score, partIdx: number, midis: number[], ms = 450) {
    if (!this.synth || !this.ctx || this.playing) return;
    await this.resume();
    this.applyParts(score);
    const ch = channelForPart(partIdx);
    const t = this.ctx.currentTime;
    for (const m of midis) {
      this.synth.noteOff(ch, m);
      this.synth.noteOn(ch, m, 92);
      this.synth.noteOff(ch, m, { time: t + ms / 1000 });
    }
  }

  /** 楽器の試聴フレーズ（音域の中央付近でアルペジオ＋和音） */
  async auditionInstrument(instrumentId: string, channel = 15) {
    if (!this.synth || !this.ctx) return;
    await this.resume();
    const inst = instrumentById(instrumentId);
    this.setProgram(channel, inst.program);
    this.synth.controllerChange(channel, 7, 110);
    const center = Math.round((inst.range[0] + inst.range[1]) / 2 / 12) * 12; // 中央付近の C
    const phrase = [0, 4, 7, 12, 7, 4, 0];
    const t0 = this.ctx.currentTime + 0.05;
    phrase.forEach((iv, i) => {
      const t = t0 + i * 0.28;
      this.synth!.noteOn(channel, center + iv, 95, { time: t });
      this.synth!.noteOff(channel, center + iv, { time: t + 0.26 });
    });
    const tc = t0 + phrase.length * 0.28 + 0.05;
    for (const iv of [0, 4, 7, 12]) {
      this.synth.noteOn(channel, center + iv, 85, { time: tc });
      this.synth.noteOff(channel, center + iv, { time: tc + 1.4 });
    }
  }

  /** 再生開始。onTick には現在の絶対ティックが渡される */
  async play(score: Score, startTick: number, onTick: (tick: number) => void, onEnd: () => void) {
    if (!this.synth || !this.ctx) return;
    this.stop();
    await this.resume();
    this.applyParts(score);
    const notes = buildPlayList(score).filter((n) => n.startTick + n.ticks > startTick);
    const secPerTick = 60 / score.tempo / TPQ;
    const t0 = this.ctx.currentTime + 0.12;
    const endTick = Math.max(startTick, ...notes.map((n) => n.startTick + n.ticks));
    const timeOf = (tick: number) => t0 + (tick - startTick) * secPerTick;
    let i = 0;
    this.playing = true;
    const synth = this.synth;
    const ctx = this.ctx;
    const schedule = () => {
      const horizon = ctx.currentTime + 0.35;
      while (i < notes.length && timeOf(Math.max(notes[i].startTick, startTick)) < horizon) {
        const n: PlayNote = notes[i++];
        const ch = channelForPart(n.part);
        const on = timeOf(Math.max(n.startTick, startTick));
        const off = timeOf(n.startTick + n.ticks) - 0.005;
        synth.noteOn(ch, n.midi, 90, { time: on });
        synth.noteOff(ch, n.midi, { time: off });
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 40);
    const frame = () => {
      if (!this.playing) return;
      const tick = startTick + (ctx.currentTime - t0) / secPerTick;
      if (tick >= endTick + TPQ / 2) {
        this.stop();
        onEnd();
        return;
      }
      onTick(Math.max(startTick, tick));
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    cancelAnimationFrame(this.raf);
    if (this.playing && this.synth) {
      const synth = this.synth;
      synth.stopAll(true);
      // 予約済みの発音が残らないよう、先読み区間が過ぎた後にもう一度止める
      setTimeout(() => { if (!this.playing) synth.stopAll(true); }, 450);
    }
    this.playing = false;
  }

  /** オフラインレンダリングで WAV を作成 */
  async renderWav(score: Score): Promise<Uint8Array> {
    if (!this.soundBank) throw new Error('音源が読み込まれていません');
    const notes = buildPlayList(score);
    const endTick = Math.max(TPQ, ...notes.map((n) => n.startTick + n.ticks));
    const seconds = (endTick / TPQ) * (60 / score.tempo) + 2.5;
    const sampleRate = 44100;
    const octx = new OfflineAudioContext({ numberOfChannels: 2, sampleRate, length: Math.ceil(seconds * sampleRate) });
    await octx.audioWorklet.addModule(this.processorUrl);
    const synth = new WorkletSynthesizer(octx);
    synth.connect(octx.destination);
    const midi = BasicMIDI.fromArrayBuffer(scoreToMidi(score).buffer as ArrayBuffer);
    await synth.startOfflineRender({ midiSequence: midi, loopCount: 0, soundBankList: [{ bankOffset: 0, soundBankBuffer: this.soundBank.slice(0) }] });
    const buf = await octx.startRendering();
    // ピークを約 -1 dBFS に揃える
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    if (peak > 0) {
      const gain = 0.89 / peak;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= gain;
      }
    }
    const blob = audioBufferToWav(buf, { normalizeAudio: false, metadata: { title: score.title } });
    return new Uint8Array(await blob.arrayBuffer());
  }
}
