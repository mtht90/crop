// esbuild で main / preload / renderer をバンドルし dist/ に出力する
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, 'renderer'), { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2022' };
await build({ ...common, entryPoints: [path.join(root, 'src/main/main.ts')], outfile: path.join(dist, 'main.js'), platform: 'node', format: 'cjs', external: ['electron'] });
await build({ ...common, entryPoints: [path.join(root, 'src/main/preload.ts')], outfile: path.join(dist, 'preload.js'), platform: 'node', format: 'cjs', external: ['electron'] });
await build({ ...common, entryPoints: [path.join(root, 'src/renderer/app.ts')], outfile: path.join(dist, 'renderer/app.js'), platform: 'browser', format: 'iife', minify: true });

for (const f of ['index.html', 'styles.css']) cpSync(path.join(root, 'src/renderer', f), path.join(dist, 'renderer', f));
const proc = path.join(path.dirname(require.resolve('spessasynth_lib')), 'spessasynth_processor.min.js');
cpSync(proc, path.join(dist, 'renderer/spessasynth_processor.min.js'));
console.log('build ok');
