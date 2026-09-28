import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveInput, isAllowedUrl, searchUrl } = require('../dist/main/url.js');

test('スキーム付きの URL はそのまま', () => {
  assert.equal(resolveInput('https://example.com/a?b=1', 'google'), 'https://example.com/a?b=1');
  assert.equal(resolveInput('http://example.com', 'google'), 'http://example.com');
  assert.equal(resolveInput('file:///tmp/a.html', 'google'), 'file:///tmp/a.html');
  assert.equal(resolveInput('about:blank', 'google'), 'about:blank');
});

test('ドメイン名には https:// を補う', () => {
  assert.equal(resolveInput('example.com', 'google'), 'https://example.com');
  assert.equal(resolveInput('www.example.co.jp/path?q=1', 'google'), 'https://www.example.co.jp/path?q=1');
  assert.equal(resolveInput('  example.com  ', 'google'), 'https://example.com');
  assert.equal(resolveInput('example.com:8443/x', 'google'), 'http://example.com:8443/x');
});

test('localhost と IP アドレスには http:// を補う', () => {
  assert.equal(resolveInput('localhost', 'google'), 'http://localhost');
  assert.equal(resolveInput('localhost:3000/app', 'google'), 'http://localhost:3000/app');
  assert.equal(resolveInput('192.168.0.1', 'google'), 'http://192.168.0.1');
  assert.equal(resolveInput('127.0.0.1:8080', 'google'), 'http://127.0.0.1:8080');
});

test('それ以外は検索', () => {
  assert.equal(resolveInput('electron browser', 'google'), 'https://www.google.com/search?q=electron%20browser');
  assert.equal(resolveInput('天気', 'duckduckgo'), `https://duckduckgo.com/?q=${encodeURIComponent('天気')}`);
  assert.equal(resolveInput('hello', 'bing'), 'https://www.bing.com/search?q=hello');
  assert.equal(resolveInput('what is example.com', 'yahoo_jp'), 'https://search.yahoo.co.jp/search?p=what%20is%20example.com');
  assert.equal(resolveInput('javascript:alert(1)', 'google'), 'https://www.google.com/search?q=javascript%3Aalert(1)');
  assert.equal(resolveInput('', 'google'), 'about:blank');
});

test('許可されたスキームだけを開く', () => {
  assert.ok(isAllowedUrl('https://example.com'));
  assert.ok(isAllowedUrl('file:///tmp/a'));
  assert.ok(!isAllowedUrl('javascript:alert(1)'));
  assert.ok(!isAllowedUrl('mailto:a@example.com'));
  assert.ok(!isAllowedUrl('not a url'));
});

test('searchUrl は未知のエンジンで Google にフォールバック', () => {
  assert.equal(searchUrl('a b', 'unknown'), 'https://www.google.com/search?q=a%20b');
});
