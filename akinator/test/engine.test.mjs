import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, parseQuestions } from '../lib/compile.mjs';
import { Engine, recordLearning, A, normName } from '../public/engine.js';
import { play, mulberry32 } from './simulate.mjs';
import { sanitize } from '../tools/generate.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const warnings = [];
const db = compile(path.join(root, 'data'), (w) => warnings.push(w));

test('data compiles without warnings', () => {
  assert.deepEqual(warnings, []);
  assert.ok(db.entities.length > 1500);
});

test('implications and defaults are applied', () => {
  const e = db.entities.find((x) => x.n === '大谷翔平');
  for (const t of ['mlb', 'baseball', 'athlete', 'asia', 'human', 'living', 'alive']) assert.ok(e.t.includes(t), t);
  const k = db.entities.find((x) => x.n === '織田信長');
  assert.ok(k.t.includes('dead') && !k.t.includes('alive'));
});

test('self-play guesses most targets', () => {
  const engine = new Engine(db);
  const rng = mulberry32(7);
  let wins = 0;
  const N = 40;
  for (let i = 0; i < N; i++) if (play(engine, Math.floor(rng() * engine.E), rng, 0.1).win) wins++;
  assert.ok(wins / N >= 0.85, `win rate ${wins}/${N}`);
});

test('learning adds a new entity and it can be guessed', () => {
  let learned = {};
  const answers = { 'D:P': A.YES, male: A.YES, jp: A.YES, youtuber: A.YES, era21: A.YES, glasses: A.YES, comedian: A.NO };
  for (let i = 0; i < 3; i++) learned = recordLearning(learned, { name: 'テスト配信者X', answers, domain: 'P', win: false });
  const engine = new Engine(db, learned, { minVotes: 2 });
  const e = engine.findByName('テスト配信者X');
  assert.ok(e >= 0);
  const g = engine.newGame(mulberry32(1));
  for (const [tag, a] of Object.entries(answers)) g.answer(engine.qIndex.get(tag), a);
  assert.ok(g.ranking(5).some((r) => r.e === e));
});

test('minVotes hides under-voted new entities', () => {
  const learned = recordLearning({}, { name: '一票だけ', answers: {}, domain: 'P', win: false });
  assert.equal(new Engine(db, learned, { minVotes: 2 }).findByName('一票だけ'), -1);
});

test('generator sanitizer drops unknown tags and duplicates', () => {
  const spec = parseQuestions(fs.readFileSync(path.join(root, 'data', 'questions.txt'), 'utf8'));
  spec.known = new Set([...spec.questions.map((q) => q.tag), ...spec.groups.flatMap((g) => g.tags), ...[...spec.implies.values()].flat(), ...spec.implies.keys(), ...spec.extraTags]);
  const out = sanitize('```\n- 新人A | m jp era21 active actor bogus\n大谷翔平 | m jp mlb era21\n説明文です\n新人B | x\n```', spec, 'P', new Set([normName('大谷翔平')]));
  assert.deepEqual(out, ['新人A | m jp era21 active actor']);
});
