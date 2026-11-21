// Downloads the third-party art packs from their official itch.io pages into idle/assets-src/
// (git-ignored). Skips anything already present, so local copies placed by hand are used as-is.
//
//  - Ækashics Librarium Static Battlers (name-your-own-price, free download allowed)
//  - Cozy UI Pack by dobo_ui (the free DEMO file; if you own the full pack, unzip it into
//    idle/assets-src/cozy-ui/ yourself and it will be picked up instead)
//
// The packs' licenses forbid redistributing the source files, which is why they are fetched from
// the author's page at build time instead of being committed to this public repository.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets-src');

const PACKS = [
  {
    name: 'Ækashics Librarium (static battlers)',
    page: 'https://aekashics.itch.io/aekashics-librarium-librarium-static-batch-megapack',
    file: /Static Battlers\.zip$/,
    dest: path.join(SRC, 'librarium'),
    check: 'Aekashics Librarium Static Battlers/Sideview Batch Battlers',
    keep: (entry) => entry.includes('Sideview Batch Battlers/'),
  },
  {
    name: 'Cozy UI Pack (dobo_ui)',
    page: 'https://dobo-ui.itch.io/cozy-ui',
    file: /Cozy.*UI.*\.zip$/i,
    preferFree: true,
    dest: path.join(SRC, 'cozy-ui'),
    check: '.',
    keep: () => true,
  },
];

class Jar {
  cookies = new Map();
  store(res) {
    const list = res.headers.getSetCookie?.() ?? [];
    for (const c of list) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      this.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function req(jar, url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (asset-fetch)', Cookie: jar.header(), ...(opts.headers ?? {}) },
  });
  jar.store(res);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

const csrfOf = (html) => /name="csrf_token" value="([^"]+)"/.exec(html)?.[1];

async function downloadPack(pack) {
  const jar = new Jar();
  const page = await (await req(jar, pack.page)).text();
  const csrf = csrfOf(page);
  const body = new URLSearchParams({ csrf_token: csrf });
  const { url: dlPage } = await (await req(jar, pack.page + '/download_url', { method: 'POST', body })).json();
  const dlHtml = await (await req(jar, dlPage)).text();
  const csrf2 = csrfOf(dlHtml) ?? csrf;
  const uploads = [...dlHtml.matchAll(/data-upload_id="(\d+)"[\s\S]*?class="name"[^>]*>([^<]+)</g)].map((m) => ({ id: m[1], name: m[2] }));
  const up = uploads.find((u) => pack.file.test(u.name)) ?? uploads[0];
  if (!up) throw new Error('no downloadable file found on ' + pack.page);
  console.log(`  downloading ${up.name}`);
  const fileRes = await req(jar, `${pack.page}/file/${up.id}?source=game_download`, {
    method: 'POST',
    body: new URLSearchParams({ csrf_token: csrf2 }),
    headers: { Referer: dlPage, 'X-Requested-With': 'XMLHttpRequest' },
  });
  const { url } = await fileRes.json();
  const zipRes = await fetch(url);
  if (!zipRes.ok) throw new Error('zip download failed ' + zipRes.status);
  const buf = Buffer.from(await zipRes.arrayBuffer());
  const zip = new AdmZip(buf);
  let n = 0;
  for (const ent of zip.getEntries()) {
    if (ent.isDirectory || !pack.keep(ent.entryName)) continue;
    const out = path.join(pack.dest, ent.entryName);
    if (!out.startsWith(pack.dest)) continue; // zip-slip guard
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, ent.getData());
    n++;
  }
  console.log(`  extracted ${n} files`);
}

for (const pack of PACKS) {
  const probe = path.join(pack.dest, pack.check);
  const present = fs.existsSync(probe) && fs.readdirSync(probe).length > 0;
  if (present) {
    console.log(`✓ ${pack.name}: already present`);
    continue;
  }
  console.log(`↓ ${pack.name}: fetching from ${pack.page}`);
  await downloadPack(pack);
}
