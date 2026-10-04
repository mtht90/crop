// claude.ai の Artifact として公開するためのビルド後処理。
// Artifact 側が <html><head><body> の骨組みを付けるので、中身だけを取り出して dist-artifact/ に置く。
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const pick = (tag) => html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*)</${tag}>`))[1];
const head = pick('head').replace(/<meta [^>]*>\s*/g, '');
const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const rest = head.replace(title, '');
const scripts = rest.match(/<script[\s\S]*?<\/script>/g) ?? [];
const headNoScripts = scripts.reduce((s, sc) => s.replace(sc, ''), rest);

rmSync('dist-artifact', { recursive: true, force: true });
mkdirSync('dist-artifact');
writeFileSync('dist-artifact/index.html', [title, headNoScripts.trim(), pick('body').trim(), ...scripts].join('\n'));
cpSync('dist/assets', 'dist-artifact/assets', { recursive: true });
console.log('dist-artifact/index.html を作成しました');
