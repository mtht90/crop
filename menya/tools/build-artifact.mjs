// index.html と CSS/JS を1枚にまとめた公開用ページを作る: node tools/build-artifact.mjs <出力先.html>
import fs from 'fs';
import path from 'path';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const body = html.split('<body>')[1].split('</body>')[0]
  .replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>\n${fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/script/g, '<\\/script')}\n</script>`);
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const page = `<title>麺屋インク</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${fs.readFileSync(path.join(root, 'style.css'), 'utf8')}\n</style>\n${body}`;
fs.writeFileSync(process.argv[2], page);
console.log(process.argv[2], (page.length / 1024).toFixed(0) + 'KB');
