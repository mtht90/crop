import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const grid = (url, size, n = 3) => { const out = []; for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) out.push({ url, x: i * size, z: j * size, rot: Math.floor(rnd() * 4) * Math.PI / 2 }); return out; };
const scatter = (urls, count, R = 4.6, s = [1, 1]) => Array.from({ length: count }, () => ({ url: urls[Math.floor(rnd() * urls.length)], x: (rnd() * 2 - 1) * R, z: (rnd() * 2 - 1) * R, rot: rnd() * 6.28, s: s[0] + rnd() * (s[1] - s[0]) }));
const W = '/wp/', H = '/obs/hw/';
const SETS = {
  stone: [...grid(W + 'floor_tile_large.gltf.glb', 4), ...scatter([W + 'floor_tile_small_decorated.gltf.glb'], 0)],
  wood: [...grid(W + 'floor_wood_large.gltf.glb', 4)],
  meadow: [...grid(W + 'tileLarge_forest.gltf.glb', 6, 2), ...scatter([W + 'plantA_forest.gltf.glb', W + 'plantB_forest.gltf.glb'], 22, 4.6, [1.4, 2]).map((o) => ({ ...o, y: 1 })), ...scatter([W + 'tree_forest.gltf.glb'], 5, 4.6, [0.8, 1]).map((o) => ({ ...o, y: 1 })), ...scatter([W + 'rocksA_forest.gltf.glb', W + 'rocksB_forest.gltf.glb'], 8, 4.6).map((o) => ({ ...o, y: 1 }))],
  desert: [...grid(W + 'tileLarge_desert.gltf.glb', 6, 2), ...scatter([W + 'plantA_desert.gltf.glb', W + 'plantB_desert.gltf.glb'], 14, 4.6, [1.4, 2]).map((o) => ({ ...o, y: 1 })), ...scatter([W + 'rocksA_desert.gltf.glb', W + 'rocksB_desert.gltf.glb'], 10, 4.6).map((o) => ({ ...o, y: 1 }))],
  cave: [...grid(W + 'floor_dirt_large_rocky.gltf.glb', 4), ...scatter([W + 'rubble_half.gltf.glb'], 5, 4.6, [0.6, 0.9])],
  grave: [...grid(H + 'floor_dirt.gltf', 4), ...scatter([H + 'gravestone.gltf', H + 'grave_A.gltf', H + 'gravemarker_A.gltf', H + 'pumpkin_orange.gltf', H + 'bone_A.gltf', H + 'bone_B.gltf', H + 'candle_triple.gltf', H + 'skull.gltf'], 18, 4.6, [1, 1.3])],
  treasure: [...grid(W + 'floor_tile_large.gltf.glb', 4), ...scatter([W + 'coin_stack_large.gltf.glb', W + 'coin_stack_medium.gltf.glb', W + 'coin.gltf.glb', W + 'diamond_teamBlue.gltf.glb', W + 'diamond_teamRed.gltf.glb', W + 'diamond_teamYellow.gltf.glb'], 22, 4.6, [1, 1.4])],
};
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5300/'); await p.waitForFunction(() => window.ready && window.renderDiorama);
fs.mkdirSync('out/wall', { recursive: true });
for (const [k, items] of Object.entries(SETS)) {
  if (process.argv[2] && !process.argv[2].split(',').includes(k)) continue;
  const img = await p.evaluate(([items]) => window.renderDiorama(items, { area: 4.6, pitch: 1.15 }), [items]);
  fs.writeFileSync(`out/wall/${k}.png`, Buffer.from(img.split(',')[1], 'base64'));
  console.log(k);
}
await b.close();
