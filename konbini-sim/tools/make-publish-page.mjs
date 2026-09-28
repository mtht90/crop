// Turn the Vite build into a publish page (no html/head/body wrapper) with JS and CSS inlined.
import fs from 'fs';
import path from 'path';
const dir = process.argv[2];
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = [...html.matchAll(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g)].map((m) => m[1]);
const css = [...html.matchAll(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/g)].map((m) => m[1]);
const icon = html.match(/<link rel="icon"[^>]*>/)?.[0] ?? '';
let out = `<title>まいにちマート</title>\n${icon}\n<style>\n:root { color-scheme: dark; --ground: #0b0f0d; }\nhtml, body { height: 100%; background: var(--ground); }\n`;
for (const c of css) out += fs.readFileSync(path.join(dir, c), 'utf8') + '\n';
out += '</style>\n<div id="app"><canvas id="view"></canvas><div id="ui"></div></div>\n';
for (const j of js) out += `<script type="module">\n${fs.readFileSync(path.join(dir, j), 'utf8').replace(/<\/script/g, '<\\/script')}\n</script>\n`;
fs.writeFileSync(path.join(dir, 'publish.html'), out);
for (const f of [...js, ...css]) fs.rmSync(path.join(dir, f));
fs.rmSync(path.join(dir, 'index.html'));
console.log('publish.html', (fs.statSync(path.join(dir, 'publish.html')).size / 1e6).toFixed(2), 'MB; inlined', js, css);
