import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addPart, buildPlayList, changeTimeSignature, createScore, decompose, eventTicks, measureCount, midiOf,
  pitchForLetter, transposePitch, writeEvent, type NoteEvent,
} from '../src/renderer/model.ts';
import { scoreToMidi } from '../src/renderer/midi.ts';
import { scoreToMusicXML } from '../src/renderer/musicxml.ts';

const note = (dur: NoteEvent['dur'], midiStep: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B' = 'C', octave = 4, dots = 0): NoteEvent =>
  ({ dur, dots, rest: false, pitches: [{ step: midiStep, alter: 0, octave }] });

function sumTicks(evs: NoteEvent[]) { return evs.reduce((a, e) => a + eventTicks(e), 0); }

test('新規楽譜は休符で満たされている', () => {
  const s = createScore();
  addPart(s, 'Piano', 'piano', ['treble', 'bass'], 4);
  assert.equal(measureCount(s), 4);
  for (const st of s.parts[0].staves) for (const m of st.measures) assert.equal(sumTicks(m.events), 1920);
});

test('4分音符を書き込むと残りは休符になり小節長が保たれる', () => {
  const s = createScore();
  addPart(s, 'Piano', 'piano', ['treble'], 2);
  let r = writeEvent(s, 0, 0, 0, note('q'));
  assert.deepEqual([r.measure, r.tick], [0, 480]);
  r = writeEvent(s, 0, r.measure, r.tick, note('q', 'D'));
  const m = s.parts[0].staves[0].measures[0];
  assert.equal(sumTicks(m.events), 1920);
  assert.equal(m.events[0].rest, false);
  assert.equal(m.events[1].pitches[0].step, 'D');
  assert.equal(m.events[2].rest, true);
});

test('小節をまたぐ音はタイで分割され、小節が自動追加される', () => {
  const s = createScore();
  addPart(s, 'Vn', 'violin', ['treble'], 1);
  const r = writeEvent(s, 0, 0, 1440, note('h'));
  assert.equal(measureCount(s), 2);
  const [m0, m1] = s.parts[0].staves[0].measures;
  assert.equal(m0.events.at(-1)!.tie, true);
  assert.equal(m1.events[0].rest, false);
  assert.equal(m1.events[0].tie, undefined);
  assert.equal(sumTicks(m1.events), 1920);
  assert.deepEqual([r.measure, r.tick], [1, 480]);
  const play = buildPlayList(s);
  assert.equal(play.length, 1);
  assert.equal(play[0].ticks, 960);
});

test('長い音で短い音を上書きすると隙間は休符で埋まる', () => {
  const s = createScore();
  addPart(s, 'Vn', 'violin', ['treble'], 1);
  let r = writeEvent(s, 0, 0, 0, note('8'));
  r = writeEvent(s, 0, 0, r.tick, note('8'));
  r = writeEvent(s, 0, 0, r.tick, note('8'));
  writeEvent(s, 0, 0, 0, note('q', 'G', 4, 1)); // 付点4分で 3 つの 8分を上書き
  const m = s.parts[0].staves[0].measures[0];
  assert.equal(sumTicks(m.events), 1920);
  assert.equal(m.events[0].dots, 1);
  assert.equal(m.events[1].rest, true);
});

test('音名入力は直前の音に近いオクターブを選び、調号を反映する', () => {
  assert.equal(midiOf(pitchForLetter('B', 0, 60)), 59);
  assert.equal(midiOf(pitchForLetter('G', 0, 60)), 55);
  assert.equal(midiOf(pitchForLetter('A', 0, 60)), 57);
  assert.equal(pitchForLetter('F', 1, 60).alter, 1); // ト長調
  assert.equal(pitchForLetter('B', -1, 60).alter, -1); // ヘ長調
});

test('半音移動とオクターブ移動', () => {
  const c4 = { step: 'C' as const, alter: 0, octave: 4 };
  assert.equal(midiOf(transposePitch(c4, 1, 0)), 61);
  assert.equal(transposePitch(c4, 1, 0).alter, 1);
  assert.equal(transposePitch(c4, -1, 0).step, 'B');
  assert.equal(transposePitch(c4, 12, 0).octave, 5);
  assert.equal(transposePitch({ step: 'A', alter: 0, octave: 4 }, 1, -1).step, 'B'); // ヘ長調では B♭
});

test('decompose は付点を含む標準音価に分解する', () => {
  assert.deepEqual(decompose(1440), [{ dur: 'h', dots: 1 }]);
  assert.equal(decompose(1920 - 120).reduce((a, d) => a + eventTicks(d), 0), 1800);
});

test('拍子変更で内容が保たれる', () => {
  const s = createScore();
  addPart(s, 'Vn', 'violin', ['treble'], 2);
  let r = { measure: 0, tick: 0 };
  for (let i = 0; i < 8; i++) r = writeEvent(s, 0, r.measure, r.tick, note('q', 'E'));
  changeTimeSignature(s, 3, 4);
  assert.equal(measureCount(s), 4); // 入力で自動追加された 3 小節目を含む 4/4×3 → 3/4×4
  const play = buildPlayList(s);
  assert.equal(play.length, 8);
  for (const m of s.parts[0].staves[0].measures) assert.equal(sumTicks(m.events), 1440);
});

test('MIDI と MusicXML の書き出し', () => {
  const s = createScore({ title: 'T&<>' });
  addPart(s, 'Piano', 'piano', ['treble', 'bass'], 1);
  writeEvent(s, 0, 0, 0, note('q'));
  writeEvent(s, 1, 0, 0, note('h', 'C', 3));
  const mid = scoreToMidi(s);
  assert.equal(String.fromCharCode(...mid.slice(0, 4)), 'MThd');
  const xml = scoreToMusicXML(s);
  assert.match(xml, /<score-partwise/);
  assert.match(xml, /T&amp;&lt;&gt;/);
  assert.match(xml, /<staves>2<\/staves>/);
});

test('休符は拍に揃えてまとめられる', () => {
  const s = createScore();
  addPart(s, 'Vn', 'violin', ['treble'], 1);
  writeEvent(s, 0, 0, 0, note('q'));
  const m = s.parts[0].staves[0].measures[0];
  assert.deepEqual(m.events.map((e) => (e.rest ? 'r' : 'n') + e.dur), ['nq', 'rq', 'rh']);
  const s34 = createScore({ timeSig: { num: 3, den: 4 } });
  addPart(s34, 'Vn', 'violin', ['treble'], 1);
  assert.deepEqual(s34.parts[0].staves[0].measures[0].events.map((e) => e.dur + '.'.repeat(e.dots)), ['h.']);
});
