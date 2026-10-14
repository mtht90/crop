import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { accentFromThemeColor, dominantColor, hostColor, parseColor } = require('../dist/main/color.js');

/** 単色 (上半分) + 白 (下半分) の BGRA 画像 */
function image(width, height, [r, g, b], ratio = 0.5) {
  const data = new Uint8Array(width * height * 4).fill(255);
  for (let y = 0; y < height * ratio; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = b;
      data[i + 1] = g;
      data[i + 2] = r;
    }
  }
  return data;
}

const hue = (hex) => {
  const [r, g, b] = parseColor(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

test('スクリーンショットの目立つ色を代表色にする', () => {
  const color = dominantColor(image(40, 30, [20, 120, 220]), 40, 30);
  assert.ok(color);
  assert.ok(Math.abs(hue(color) - 210) < 12, `hue ${hue(color)}`);
});

test('白・グレーだけのページは代表色なし', () => {
  assert.equal(dominantColor(image(40, 30, [128, 128, 128]), 40, 30), null);
  assert.equal(dominantColor(new Uint8Array(40 * 30 * 4).fill(255), 40, 30), null);
});

test('theme-color は彩度のある色だけ使う', () => {
  assert.ok(accentFromThemeColor('#e91e63'));
  assert.ok(accentFromThemeColor('rgb(0, 150, 136)'));
  assert.equal(accentFromThemeColor('#ffffff'), null);
  assert.equal(accentFromThemeColor('#000'), null);
  assert.equal(accentFromThemeColor(null), null);
});

test('ホスト名からの色は同じサイトで常に同じ', () => {
  assert.equal(hostColor('https://example.com/a'), hostColor('https://example.com/b'));
  assert.notEqual(hostColor('https://example.com/'), hostColor('https://example.org/'));
  assert.match(hostColor('https://example.com/'), /^#[0-9a-f]{6}$/);
});
