/**
 * 内蔵デモ曲の「楽譜」。シンセ演奏と譜面作成の両方がこのデータを使うので、
 * 譜面のノーツは必ず実際に鳴っている音（メロディ・キック・スネア・フィル）の上に来る。
 */

export type SectionKind = 'intro' | 'verse' | 'pre' | 'chorus' | 'inter' | 'break' | 'outro';
export type DrumStyle = 'light' | 'verse' | 'build' | 'full' | 'rock' | 'half';

export interface SectionDef {
  kind: SectionKind;
  /** 1小節ごとのコード名 */
  chords: string[];
  drums: DrumStyle;
  /** 最後の小節の後半2拍にスネアのフィル */
  fill?: boolean;
  /** メロディ（小節は | 区切り、音符は 音名:長さ(8分音符単位)、休符は r） */
  melody: string;
  /** メロディの音色 */
  voice: 'vocal' | 'riff';
  arp?: boolean;
}

export interface MelodyNote {
  beat: number;
  dur: number;
  pitch: number;
}

export interface Section extends SectionDef {
  index: number;
  start: number;
  bars: number;
  end: number;
  notes: MelodyNote[];
}

export interface DrumHit {
  beat: number;
  type: 'kick' | 'snare' | 'hat' | 'open' | 'crash';
  vel: number;
  /** フィルの一部 */
  fill: boolean;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  sections: Section[];
  /** 最後のキメ（全員で鳴らす和音）の拍 */
  endBeat: number;
  lengthBeats: number;
  drums: DrumHit[];
}

export const CHORDS: Record<string, number[]> = {
  C: [48, 52, 55, 59],
  Dm: [50, 53, 57, 60],
  Em: [52, 55, 59, 62],
  F: [53, 57, 60, 64],
  G: [55, 59, 62, 65],
  Am: [57, 60, 64, 67],
};

const NOTE_OFFSETS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchOf(name: string): number {
  const m = name.match(/^([A-G])([#b]?)(-?\d)$/);
  if (!m) throw new Error(`音名が不正: ${name}`);
  return 12 * (Number(m[3]) + 1) + NOTE_OFFSETS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** "E5:2 G5:1 r:1 | ..." → 音符列（拍単位）。各小節は 8分×8 ちょうどでなければエラー */
export function parseMelody(text: string, startBeat: number, bars: number): MelodyNote[] {
  const barTexts = text.split('|').map((b) => b.trim());
  if (barTexts.length !== bars) throw new Error(`メロディの小節数 ${barTexts.length} がセクションの ${bars} 小節と合いません`);
  const notes: MelodyNote[] = [];
  barTexts.forEach((bt, bi) => {
    let pos = 0;
    for (const tok of bt.split(/\s+/).filter(Boolean)) {
      const [name, durText] = tok.split(':');
      const dur = Number(durText) / 2;
      if (!(dur > 0)) throw new Error(`長さが不正: ${tok}`);
      if (name !== 'r') notes.push({ beat: startBeat + bi * 4 + pos, dur, pitch: pitchOf(name) });
      pos += dur;
    }
    if (Math.abs(pos - 4) > 1e-9) throw new Error(`小節 ${bi + 1} の長さが ${pos} 拍です: "${bt}"`);
  });
  return notes;
}

function drumPattern(style: DrumStyle, barInSection: number): { kick: number[]; snare: number[]; hat: number[]; open: number[] } {
  // 16分単位の位置
  switch (style) {
    case 'light':
      return { kick: [0, 8], snare: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [] };
    case 'verse':
      return { kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [] };
    case 'build':
      return barInSection % 4 < 2
        ? { kick: [0, 4, 8, 12], snare: [8], hat: [2, 6, 10, 14], open: [] }
        : { kick: [0, 4, 8, 12], snare: [0, 4, 8, 12], hat: [2, 6, 10, 14], open: [] };
    case 'full':
      return { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 4, 8, 12], open: [2, 6, 10, 14] };
    case 'rock':
      return { kick: [0, 3, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [] };
    case 'half':
      return { kick: [0, 10], snare: [8], hat: [0, 4, 8, 12], open: [] };
  }
}

export function buildSong(id: string, title: string, bpm: number, defs: SectionDef[]): Song {
  const sections: Section[] = [];
  let beat = 0;
  defs.forEach((d, index) => {
    const bars = d.chords.length;
    const s: Section = { ...d, index, start: beat, bars, end: beat + bars * 4, notes: parseMelody(d.melody, beat, bars) };
    sections.push(s);
    beat = s.end;
  });
  const endBeat = beat;
  const drums: DrumHit[] = [];
  for (const s of sections) {
    for (let bar = 0; bar < s.bars; bar++) {
      const b0 = s.start + bar * 4;
      const isFillBar = !!s.fill && bar === s.bars - 1;
      const p = drumPattern(s.drums, bar);
      const add = (steps: number[], type: DrumHit['type'], vel: number) => {
        for (const st of steps) {
          if (isFillBar && st >= 8 && type !== 'kick') continue;
          drums.push({ beat: b0 + st / 4, type, vel, fill: false });
        }
      };
      add(p.kick, 'kick', 1);
      add(p.snare, 'snare', 0.7);
      add(p.hat, 'hat', 0.8);
      add(p.open, 'open', 0.8);
      if (isFillBar) for (let st = 8; st < 16; st++) drums.push({ beat: b0 + st / 4, type: 'snare', vel: 0.35 + (st - 8) * 0.08, fill: true });
    }
    if (s.index > 0 && s.kind !== 'verse') drums.push({ beat: s.start, type: 'crash', vel: 1, fill: false });
  }
  drums.push({ beat: endBeat, type: 'crash', vel: 1, fill: false }, { beat: endBeat, type: 'kick', vel: 1, fill: false });
  drums.sort((a, b) => a.beat - b.beat);
  return { id, title, bpm, sections, endBeat, lengthBeats: endBeat, drums };
}

export function sectionAt(song: Song, beat: number): Section {
  for (const s of song.sections) if (beat < s.end) return s;
  return song.sections[song.sections.length - 1];
}

// ---------------------------------------------------------------------------- 楽曲

const STARLIGHT_HOOK = [
  'C6:1 A5:1 F5:1 A5:1 C6:1 A5:1 G5:1 A5:1',
  'B5:1 G5:1 D5:1 G5:1 B5:1 G5:1 A5:1 B5:1',
  'B5:1 G5:1 E5:1 G5:1 B5:1 G5:1 A5:1 G5:1',
  'A5:2 E5:1 C5:1 E5:2 r:2',
].join(' | ');
const STARLIGHT_VERSE = [
  'r:2 C5:1 D5:1 E5:2 F5:1 E5:1',
  'D5:3 C5:1 B4:2 r:2',
  'r:2 B4:1 C5:1 D5:2 E5:1 G5:1',
  'E5:3 D5:1 C5:2 r:2',
  'r:2 C5:1 D5:1 E5:2 F5:1 A5:1',
  'G5:3 F5:1 E5:1 D5:1 r:2',
  'E5:1 E5:1 D5:1 C5:1 D5:2 E5:2',
  'G5:4 r:4',
].join(' | ');
const STARLIGHT_PRE = ['D5:1 D5:1 F5:1 A5:1 G5:2 F5:2', 'E5:1 E5:1 G5:1 B5:1 A5:2 G5:2', 'F5:1 G5:1 A5:1 C6:1 B5:1 A5:1 G5:1 F5:1', 'G5:4 r:4'].join(' | ');
const STARLIGHT_CHORUS = [
  'A4:1 C5:1 F5:2 E5:1 F5:1 G5:2',
  'G5:2 A5:1 G5:1 D5:2 r:1 D5:1',
  'E5:1 G5:1 B5:2 A5:1 G5:1 E5:2',
  'E5:3 D5:1 C5:4',
  'A4:1 C5:1 F5:2 E5:1 F5:1 A5:2',
  'B5:2 A5:1 G5:1 A5:2 B5:1 C6:1',
  'C6:4 G5:1 E5:1 D5:1 E5:1',
  'C5:6 r:2',
].join(' | ');
const STARLIGHT_OUTRO = ['C6:1 A5:1 F5:1 A5:1 C6:1 A5:1 G5:1 A5:1', 'B5:1 G5:1 D5:1 G5:1 B5:1 G5:1 A5:1 B5:1', 'B5:1 G5:1 E5:1 G5:1 B5:1 G5:1 A5:1 G5:1', 'C6:8'].join(' | ');

export const STARLIGHT: Song = buildSong('starlight', 'Starlight Signal', 128, [
  { kind: 'intro', chords: ['F', 'G', 'Em', 'Am'], drums: 'light', melody: STARLIGHT_HOOK, voice: 'riff', arp: true, fill: true },
  { kind: 'verse', chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'], drums: 'verse', melody: STARLIGHT_VERSE, voice: 'vocal' },
  { kind: 'pre', chords: ['Dm', 'Em', 'F', 'G'], drums: 'build', melody: STARLIGHT_PRE, voice: 'vocal', fill: true },
  { kind: 'chorus', chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'], drums: 'full', melody: STARLIGHT_CHORUS, voice: 'vocal', arp: true },
  { kind: 'inter', chords: ['F', 'G', 'Em', 'Am'], drums: 'full', melody: STARLIGHT_HOOK, voice: 'riff', arp: true, fill: true },
  { kind: 'verse', chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'], drums: 'verse', melody: STARLIGHT_VERSE, voice: 'vocal' },
  { kind: 'pre', chords: ['Dm', 'Em', 'F', 'G'], drums: 'build', melody: STARLIGHT_PRE, voice: 'vocal', fill: true },
  { kind: 'chorus', chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'], drums: 'full', melody: STARLIGHT_CHORUS, voice: 'vocal', arp: true },
  { kind: 'chorus', chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'], drums: 'full', melody: STARLIGHT_CHORUS, voice: 'vocal', arp: true, fill: true },
  { kind: 'outro', chords: ['F', 'G', 'Em', 'C'], drums: 'full', melody: STARLIGHT_OUTRO, voice: 'riff', arp: true },
]);

const NEON_RIFF = ['A5:1 A5:1 C6:1 A5:1 E6:1 A5:1 D6:1 C6:1', 'A5:1 A5:1 C6:1 A5:1 F6:1 A5:1 E6:1 C6:1', 'G5:1 G5:1 C6:1 G5:1 E6:1 G5:1 D6:1 C6:1', 'B5:1 G5:1 D6:1 G5:1 D6:0.5 E6:0.5 D6:1 B5:2'];
const NEON_VERSE = [
  'A5:2 G5:1 E5:1 r:1 E5:1 G5:1 A5:1',
  'C6:2 A5:1 F5:1 r:2 F5:1 G5:1',
  'G5:2 E5:1 C5:1 r:1 C5:1 D5:1 E5:1',
  'D5:3 B4:1 r:2 D5:1 E5:1',
  'A5:2 G5:1 E5:1 r:1 E5:1 G5:1 A5:1',
  'C6:2 D6:1 C6:1 A5:2 F5:1 G5:1',
  'E5:1 G5:1 C6:2 B5:1 A5:1 G5:1 E5:1',
  'G5:6 r:2',
].join(' | ');
const NEON_PRE = [
  'D5:1.5 F5:1.5 A5:1 D6:2 C6:2',
  'E5:1.5 G5:1.5 B5:1 E6:2 D6:2',
  'F5:1.5 A5:1.5 C6:1 F6:2 E6:2',
  'D6:2 B5:2 G5:2 r:2',
  'D6:1 C6:1 A5:1 F5:1 A5:1 C6:1 D6:2',
  'E6:1 D6:1 B5:1 G5:1 B5:1 D6:1 E6:2',
  'F6:1 E6:1 C6:1 A5:1 C6:1 E6:1 F6:1 G6:1',
  'G6:4 r:4',
].join(' | ');
const NEON_CHORUS = [
  'C6:1 C6:1 A5:1 C6:1 F6:2 E6:2',
  'D6:1 D6:1 B5:1 D6:1 G6:2 F6:1 E6:1',
  'E6:1 D6:1 B5:1 G5:1 B5:1 D6:1 E6:1 G6:1',
  'A6:4 G6:1 E6:1 C6:1 A5:1',
  'C6:1 C6:1 A5:1 C6:1 F6:2 E6:2',
  'D6:1 D6:1 B5:1 D6:1 G6:2 A6:1 B6:1',
  'C7:2 B6:1 A6:1 E6:2 C6:1 D6:1',
  'A6:6 r:2',
].join(' | ');
const NEON_BREAK = ['F6:8', 'G6:8', 'E6:8', 'A6:4 r:4'].join(' | ');
const NEON_OUTRO = [NEON_RIFF[0], NEON_RIFF[1], NEON_RIFF[2], 'A5:8'].join(' | ');

export const NEON: Song = buildSong('neon', 'Neon Parade', 172, [
  { kind: 'intro', chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'], drums: 'rock', melody: [...NEON_RIFF, ...NEON_RIFF].join(' | '), voice: 'riff', fill: true },
  { kind: 'verse', chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'], drums: 'verse', melody: NEON_VERSE, voice: 'vocal' },
  { kind: 'pre', chords: ['Dm', 'Em', 'F', 'G', 'Dm', 'Em', 'F', 'G'], drums: 'build', melody: NEON_PRE, voice: 'vocal', fill: true },
  { kind: 'chorus', chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'Am', 'Am'], drums: 'full', melody: NEON_CHORUS, voice: 'vocal', arp: true },
  { kind: 'break', chords: ['F', 'G', 'Em', 'Am'], drums: 'half', melody: NEON_BREAK, voice: 'vocal', arp: true, fill: true },
  { kind: 'verse', chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'], drums: 'rock', melody: NEON_VERSE, voice: 'vocal' },
  { kind: 'pre', chords: ['Dm', 'Em', 'F', 'G', 'Dm', 'Em', 'F', 'G'], drums: 'build', melody: NEON_PRE, voice: 'vocal', fill: true },
  { kind: 'chorus', chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'Am', 'Am'], drums: 'full', melody: NEON_CHORUS, voice: 'vocal', arp: true, fill: true },
  { kind: 'outro', chords: ['Am', 'F', 'C', 'Am'], drums: 'rock', melody: NEON_OUTRO, voice: 'riff' },
]);

export const SONGS: Record<string, Song> = { starlight: STARLIGHT, neon: NEON };
