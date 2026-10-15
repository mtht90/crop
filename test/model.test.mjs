import { test } from 'node:test';
import assert from 'node:assert/strict';

const { arrange, siteKey, siteLabel } = await import('../dist/renderer/model.js');

let nextId = 1;
const tab = (url, tier = 'regular', extra = {}) => ({
  id: nextId++,
  title: url,
  url,
  favicon: null,
  loading: false,
  canGoBack: false,
  canGoForward: false,
  zoomPercent: 100,
  audible: false,
  muted: false,
  pinned: false,
  tier,
  score: 1,
  returns: 0,
  accent: null,
  thumbVersion: 0,
  error: false,
  ...extra,
});

const shape = (a) =>
  a.entries.map((e) => (e.kind === 'tab' ? e.tab.url : `[${e.key}: ${e.tabs.map((t) => t.url).join(', ')}]`));

test('siteKey は www を除いたホスト名、ファイルはフォルダ', () => {
  assert.equal(siteKey('https://www.example.com/a'), 'example.com');
  assert.equal(siteKey('http://docs.example.com/'), 'docs.example.com');
  assert.equal(siteKey('file:///home/me/notes/a.html'), 'file:/home/me/notes');
  assert.equal(siteLabel('file:/home/me/notes'), 'notes');
  assert.equal(siteKey('about:blank'), null);
});

test('並び順はタブの順番のまま (頻度で並べ替えない)', () => {
  const tabs = [tab('https://a.com/'), tab('https://b.com/', 'hero'), tab('https://c.com/')];
  assert.deepEqual(shape(arrange(tabs)), ['https://a.com/', 'https://b.com/', 'https://c.com/']);
});

test('固定したページは先頭', () => {
  const tabs = [tab('https://a.com/'), tab('https://b.com/', 'regular', { pinned: true })];
  assert.deepEqual(shape(arrange(tabs)), ['https://b.com/', 'https://a.com/']);
});

test('同じサイトの通常のページは、最初のページの位置にまとまる', () => {
  const tabs = [tab('https://x.com/1'), tab('https://a.com/'), tab('https://x.com/2'), tab('https://b.com/')];
  assert.deepEqual(shape(arrange(tabs)), ['[x.com: https://x.com/1, https://x.com/2]', 'https://a.com/', 'https://b.com/']);
});

test('よく戻るページはまとめずに単独で見せる', () => {
  const tabs = [tab('https://x.com/1', 'hero'), tab('https://x.com/2'), tab('https://x.com/3')];
  assert.deepEqual(shape(arrange(tabs)), ['https://x.com/1', '[x.com: https://x.com/2, https://x.com/3]']);
});

test('あまり見ないページは束へ。ただし同じサイトのまとまりがあればそこに入る', () => {
  const tabs = [tab('https://x.com/1'), tab('https://x.com/2', 'compact'), tab('https://y.com/', 'compact'), tab('https://z.com/1', 'compact'), tab('https://z.com/2', 'compact')];
  const a = arrange(tabs);
  assert.deepEqual(shape(a), ['[x.com: https://x.com/1, https://x.com/2]']);
  // 通常のページを含まないサイト (z.com) はまとめず、束に残す
  assert.deepEqual(a.compact.map((t) => t.url), ['https://y.com/', 'https://z.com/1', 'https://z.com/2']);
});
