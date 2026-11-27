// itch.io の無料（または0円で買える）アセットパックをダウンロードする。
// 使い方: node scripts/fetch-itch.mjs <ページURL> <ファイル名に含まれる文字列(正規表現)> <保存先>
//         node scripts/fetch-itch.mjs <ページURL> --list   … ダウンロードできるファイル一覧を表示
import fs from 'node:fs';

const [PAGE, pattern, out] = process.argv.slice(2);
if (!PAGE || !pattern) {
  console.error('usage: fetch-itch.mjs <page> <pattern|--list> [out]');
  process.exit(1);
}
const jar = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(url, init = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const headers = { 'User-Agent': 'Mozilla/5.0 (asset fetch for build)', ...(init.headers ?? {}) };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(url, { ...init, headers, redirect: 'follow' });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';');
      const j = kv.indexOf('=');
      jar.set(kv.slice(0, j).trim(), kv.slice(j + 1).trim());
    }
    if (res.status === 429) {
      await sleep(15000 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res;
  }
  throw new Error(`429 が続きました: ${url}`);
}
const csrf = (html) => html.match(/name="csrf_token" value="([^"]+)"/)?.[1] ?? '';

const page = await (await req(PAGE)).text();
const { url: dlPage } = await (
  await req(`${PAGE}/download_url`, { method: 'POST', body: new URLSearchParams({ csrf_token: csrf(page) }) })
).json();
const html = await (await req(dlPage)).text();
const uploads = [...html.matchAll(/data-upload_id="(\d+)"[\s\S]{0,600}?class="name"[^>]*>([^<]+)</g)].map((m) => ({
  id: m[1],
  name: m[2].trim(),
}));
if (pattern === '--list') {
  for (const u of uploads) console.log(u.id, u.name);
  process.exit(0);
}
const hit = uploads.find((u) => new RegExp(pattern, 'i').test(u.name));
if (!hit) throw new Error(`"${pattern}" に合うファイルがありません: ${uploads.map((u) => u.name).join(', ')}`);
await sleep(2000);
const { url } = await (
  await req(`${PAGE}/file/${hit.id}?source=game_download`, {
    method: 'POST',
    body: new URLSearchParams({ csrf_token: csrf(html) }),
  })
).json();
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
fs.writeFileSync(out, buf);
console.log(`${hit.name} を ${out} に保存しました (${(buf.length / 1e6).toFixed(1)}MB)`);
