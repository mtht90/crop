import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assignTiers, bump, decay, pageKey, HALF_LIFE_MS, WEIGHTS, DEFAULT_TIER_OPTIONS } = require('../dist/main/frecency.js');

const NOW = 1_700_000_000_000;
const OLD = NOW - 10 * 60_000; // 10 分前に開いたタブ

const tab = (id, score, extra = {}) => ({ id, score, pinned: false, active: false, openedAt: OLD, prevTier: null, ...extra });
const tiersOf = (tabs, opts) => Object.fromEntries(assignTiers(tabs, NOW, opts));

test('スコアは半減期ごとに半分になる', () => {
  const s = bump(undefined, 4, NOW);
  assert.equal(decay(s, NOW), 4);
  assert.ok(Math.abs(decay(s, NOW + HALF_LIFE_MS) - 2) < 1e-9);
  assert.ok(Math.abs(decay(s, NOW + 2 * HALF_LIFE_MS) - 1) < 1e-9);
  // 加点は減衰後の値に足される
  assert.ok(Math.abs(decay(bump(s, 1, NOW + HALF_LIFE_MS), NOW + HALF_LIFE_MS) - 3) < 1e-9);
});

test('戻ってきた行動は、開いただけより重い', () => {
  assert.ok(WEIGHTS.return > WEIGHTS.visit);
});

test('pageKey はフラグメントと末尾のスラッシュを無視する', () => {
  assert.equal(pageKey('https://example.com/a/#top'), pageKey('https://example.com/a'));
  assert.equal(pageKey('https://example.com/'), 'https://example.com/');
  assert.notEqual(pageKey('https://example.com/a?x=1'), pageKey('https://example.com/a?x=2'));
  assert.equal(pageKey('about:blank'), null);
  assert.equal(pageKey('data:text/html,hi'), null);
});

test('よく戻るページは hero、開いたきりのページは compact になる', () => {
  const tiers = tiersOf([tab(1, 8.5), tab(2, 3.5), tab(3, 1), tab(4, 1), tab(5, 3.5), tab(6, 1)]);
  assert.equal(tiers[1], 'hero');
  assert.equal(tiers[2], 'regular');
  assert.equal(tiers[3], 'compact');
  assert.equal(tiers[5], 'regular');
});

test('表示中・開いたばかり・固定のタブはまとめない', () => {
  const tiers = tiersOf([
    tab(1, 1, { active: true }),
    tab(2, 1, { openedAt: NOW - 1000 }),
    tab(3, 0, { pinned: true }),
    tab(4, 1),
    tab(5, 1),
  ]);
  assert.equal(tiers[1], 'regular');
  assert.equal(tiers[2], 'regular');
  assert.equal(tiers[3], 'hero');
  assert.equal(tiers[4], 'compact');
});

test('タブが少ないときはまとめない', () => {
  const tiers = tiersOf([tab(1, 1), tab(2, 1), tab(3, 1)]);
  assert.deepEqual(Object.values(tiers), ['regular', 'regular', 'regular']);
});

test('hero の数はタブ数に応じて制限され、スコアの高い順に選ばれる', () => {
  const tabs = [tab(1, 7), tab(2, 9), tab(3, 8), tab(4, 2), tab(5, 2), tab(6, 2)];
  const tiers = tiersOf(tabs);
  // 6 タブの 1/3 = 2 枠
  assert.equal(tiers[2], 'hero');
  assert.equal(tiers[3], 'hero');
  assert.equal(tiers[1], 'regular');
});

test('しきい値付近でティアが行ったり来たりしない (ヒステリシス)', () => {
  const o = DEFAULT_TIER_OPTIONS;
  const between = (o.heroEnter + o.heroExit) / 2;
  const others = [tab(2, 2), tab(3, 2), tab(4, 2)];
  // hero でなかったタブは昇格しない
  assert.equal(tiersOf([tab(1, between, { prevTier: 'regular' }), ...others])[1], 'regular');
  // hero だったタブは降格しない
  assert.equal(tiersOf([tab(1, between, { prevTier: 'hero' }), ...others])[1], 'hero');

  const mid = (o.compactEnter + o.compactExit) / 2;
  const many = [tab(2, 3), tab(3, 3), tab(4, 3), tab(5, 3)];
  assert.equal(tiersOf([tab(1, mid, { prevTier: 'regular' }), ...many])[1], 'regular');
  assert.equal(tiersOf([tab(1, mid, { prevTier: 'compact' }), ...many])[1], 'compact');
});
