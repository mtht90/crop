// itch.io から Tiny Swords (Free Pack) をダウンロードする(CIでのビルド用)。
// 素材は再配布できないため、リポジトリには含めず、ビルドのたびに配布元から取得する。
// 使い方: node scripts/fetch-tiny-swords.mjs <保存先zip>
import fs from 'node:fs';

const PAGE = 'https://pixelfrog-assets.itch.io/tiny-swords';
const out = process.argv[2] ?? 'tiny-swords.zip';
const jar = new Map();

async function req(url, init = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0 (asset fetch for build)', ...(init.headers ?? {}) };
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(url, { ...init, headers, redirect: 'follow' });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}
const csrf = (html) => html.match(/name="csrf_token" value="([^"]+)"/)?.[1];

const page = await (await req(PAGE)).text();
const form = new URLSearchParams({ csrf_token: csrf(page) ?? '' });
const { url: dlPage } = await (await req(`${PAGE}/download_url`, { method: 'POST', body: form })).json();
const html = await (await req(dlPage)).text();
// 「Tiny Swords (Free Pack).zip」のアップロードIDを探す
const m = [...html.matchAll(/data-upload_id="(\d+)"[\s\S]{0,400}?class="name"[^>]*>([^<]+)</g)];
const free = m.find((x) => /Free Pack/i.test(x[2]));
if (!free) throw new Error('Free Pack が見つかりませんでした');
const form2 = new URLSearchParams({ csrf_token: csrf(html) ?? '' });
const { url } = await (await req(`${PAGE}/file/${free[1]}?source=game_download`, { method: 'POST', body: form2 })).json();
const zip = Buffer.from(await (await fetch(url)).arrayBuffer());
fs.writeFileSync(out, zip);
console.log(`${free[2].trim()} を ${out} に保存しました(${(zip.length / 1e6).toFixed(1)}MB)`);
