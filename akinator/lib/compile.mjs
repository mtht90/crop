// データファイル(data/questions.txt, data/entities/*.txt)を読み込み、
// エンジンが使うDBオブジェクトへコンパイルする。
//
// エンティティファイルの書式:
//   @P                      ← 以降の行のドメイン (P/C/A/L/F/O/S)
//   名前/別名/別名 | tag tag ?tag -tag
//     tag  : 当てはまる
//     ?tag : 場合による・微妙
//     -tag : 明確に当てはまらない
//     *    : 超有名 (事前確率を上げる)
import fs from 'node:fs';
import path from 'node:path';

const DOMAINS = ['P', 'C', 'A', 'L', 'F', 'O', 'S'];
const FAMOUS_WEIGHT = 3;

export function parseQuestions(text) {
  const questions = [];
  const groups = [];
  const implies = new Map(); // tag -> [tags]
  const defaults = []; // {domain, group, tag}
  const aliases = new Map();
  const extraTags = new Set(); // 質問はないが記述に使ってよいタグ

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) {
      const [cmd, ...rest] = line.slice(1).split(/\s+/);
      if (cmd === 'group') {
        groups.push({ name: rest[0], tags: rest.slice(1) });
      } else if (cmd === 'imply') {
        const i = rest.indexOf('=>');
        for (const l of rest.slice(0, i)) {
          implies.set(l, [...(implies.get(l) || []), ...rest.slice(i + 1)]);
        }
      } else if (cmd === 'default') {
        defaults.push({ domain: rest[0], group: rest[1], tag: rest[2] });
      } else if (cmd === 'tags') {
        for (const t of rest) extraTags.add(t);
      } else if (cmd === 'alias') {
        aliases.set(rest[0], rest[2]);
      } else {
        throw new Error(`unknown directive: ${line}`);
      }
      continue;
    }
    const [tag, scope, q, label] = line.split('|').map((s) => s.trim());
    if (!q) throw new Error(`bad question line: ${line}`);
    questions.push({
      tag,
      scope: scope === '*' ? null : scope.split(',').map((s) => s.trim()),
      text: q,
      label: label || null,
    });
  }
  return { questions, groups, implies, defaults, aliases, extraTags };
}

function expand(tags, implies) {
  const out = new Set();
  const stack = [...tags];
  while (stack.length) {
    const t = stack.pop();
    if (out.has(t)) continue;
    out.add(t);
    for (const n of implies.get(t) || []) stack.push(n);
  }
  return out;
}

export function parseEntities(text, spec, file, warn) {
  const out = [];
  let domain = null;
  let lineNo = 0;
  for (const raw of text.split('\n')) {
    lineNo++;
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('@')) {
      domain = line.slice(1).trim();
      if (!DOMAINS.includes(domain)) throw new Error(`${file}:${lineNo} bad domain ${domain}`);
      continue;
    }
    if (!domain) throw new Error(`${file}:${lineNo} domain not set`);
    const bar = line.indexOf('|');
    const names = (bar < 0 ? line : line.slice(0, bar)).split('/').map((s) => s.trim()).filter(Boolean);
    const words = bar < 0 ? [] : line.slice(bar + 1).trim().split(/\s+/).filter(Boolean);
    const pos = [];
    const maybe = [];
    const neg = [];
    for (let w of words) {
      let bucket = pos;
      if (w.startsWith('?')) { bucket = maybe; w = w.slice(1); }
      else if (w.startsWith('-')) { bucket = neg; w = w.slice(1); }
      w = spec.aliases.get(w) || w;
      if (w !== 'famous' && !spec.known.has(w)) warn(`${file}:${lineNo} unknown tag "${w}" (${names[0]})`);
      bucket.push(w);
    }
    const t = expand(['D:' + domain, ...pos], spec.implies);
    for (const d of spec.defaults) {
      if (d.domain !== domain) continue;
      const g = spec.groups.find((x) => x.name === d.group);
      if (!g.tags.some((x) => t.has(x))) t.add(d.tag);
    }
    const famous = t.delete('famous');
    out.push({
      n: names[0],
      a: names.slice(1),
      d: domain,
      w: famous ? FAMOUS_WEIGHT : 1,
      t: [...t],
      m: maybe.filter((x) => !t.has(x)),
      x: neg,
    });
  }
  return out;
}

export function compile(dataDir, warn = () => {}) {
  const spec = parseQuestions(fs.readFileSync(path.join(dataDir, 'questions.txt'), 'utf8'));
  spec.known = new Set([
    ...spec.questions.map((q) => q.tag),
    ...spec.groups.flatMap((g) => g.tags),
    ...[...spec.implies.values()].flat(),
    ...spec.implies.keys(),
    ...spec.extraTags,
  ]);
  const entDir = path.join(dataDir, 'entities');
  const files = fs.readdirSync(entDir).filter((f) => f.endsWith('.txt')).sort();
  const entities = [];
  const seen = new Map();
  for (const f of files) {
    for (const e of parseEntities(fs.readFileSync(path.join(entDir, f), 'utf8'), spec, f, warn)) {
      const key = e.d + ':' + e.n;
      if (seen.has(key)) {
        warn(`duplicate entity "${e.n}" in ${f} (first in ${seen.get(key)})`);
        continue;
      }
      seen.set(key, f);
      entities.push(e);
    }
  }
  return {
    version: Date.now(),
    questions: spec.questions,
    groups: spec.groups.map((g) => g.tags),
    entities,
  };
}
