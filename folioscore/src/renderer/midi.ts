import { buildPlayList, TPQ, type Score } from './model.ts';
import { instrumentById } from './instruments.ts';

/** パート番号 → MIDI チャンネル（10ch=ドラムを避ける） */
export function channelForPart(partIdx: number): number {
  const ch = partIdx % 15;
  return ch >= 9 ? ch + 1 : ch;
}

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return bytes;
}

function track(events: { tick: number; data: number[] }[]): number[] {
  events.sort((a, b) => a.tick - b.tick);
  const body: number[] = [];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(e.tick - last), ...e.data);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  const len = body.length;
  return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...body];
}

function textMeta(type: number, text: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  return [0xff, type, ...vlq(bytes.length), ...bytes];
}

/** 楽譜を Standard MIDI File (format 1) に変換 */
export function scoreToMidi(score: Score): Uint8Array {
  const usPerQ = Math.round(60_000_000 / score.tempo);
  const den = Math.log2(score.timeSig.den);
  const conductor = [
    { tick: 0, data: textMeta(0x03, score.title) },
    { tick: 0, data: [0xff, 0x51, 3, (usPerQ >> 16) & 255, (usPerQ >> 8) & 255, usPerQ & 255] },
    { tick: 0, data: [0xff, 0x58, 4, score.timeSig.num, den, 24, 8] },
    { tick: 0, data: [0xff, 0x59, 2, score.keySig & 255, 0] },
  ];
  const notes = buildPlayList(score);
  const tracks = [track(conductor)];
  score.parts.forEach((part, pi) => {
    const ch = channelForPart(pi);
    const inst = instrumentById(part.instrument);
    const evs: { tick: number; data: number[] }[] = [
      { tick: 0, data: textMeta(0x03, part.name) },
      { tick: 0, data: [0xc0 | ch, inst.program] },
      { tick: 0, data: [0xb0 | ch, 7, Math.round((part.volume / 100) * 127)] },
    ];
    for (const n of notes) {
      if (n.part !== pi) continue;
      evs.push({ tick: n.startTick, data: [0x90 | ch, n.midi, 90] });
      // 同時刻の note-off を note-on より先に並べるため 1tick 手前で切る
      evs.push({ tick: n.startTick + n.ticks - 1, data: [0x80 | ch, n.midi, 0] });
    }
    tracks.push(track(evs));
  });
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, (TPQ >> 8) & 255, TPQ & 255];
  return new Uint8Array([...header, ...tracks.flat()]);
}
