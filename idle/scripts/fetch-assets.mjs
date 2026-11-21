// Downloads every third-party asset the game uses into idle/assets-src/ (git-ignored), straight from
// each author's official distribution page. Skips anything already present, so hand-placed copies
// are used as-is. See CREDITS.md for the licenses.
//
// Several of these licenses forbid redistributing the source files, which is why they are fetched at
// build time instead of being committed to this public repository.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets-src');
const UA = 'Mozilla/5.0 (asset-fetch)';

class Jar {
  cookies = new Map();
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
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
  const res = await fetch(url, { ...opts, redirect: 'follow', headers: { 'User-Agent': UA, Cookie: jar.header(), ...(opts.headers ?? {}) } });
  jar.store(res);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}
const csrfOf = (html) => /name="csrf_token" value="([^"]+)"/.exec(html)?.[1];

/** Free / name-your-own-price itch.io download → zip buffer */
async function itchZip(page, fileRe) {
  const jar = new Jar();
  const html = await (await req(jar, page)).text();
  const csrf = csrfOf(html);
  const { url: dlPage } = await (await req(jar, page + '/download_url', { method: 'POST', body: new URLSearchParams({ csrf_token: csrf }) })).json();
  const dlHtml = await (await req(jar, dlPage)).text();
  const uploads = [...dlHtml.matchAll(/data-upload_id="(\d+)"[\s\S]*?class="name"[^>]*>([^<]+)</g)].map((m) => ({ id: m[1], name: m[2] }));
  const up = uploads.find((u) => !fileRe || fileRe.test(u.name)) ?? uploads[0];
  if (!up) throw new Error('no downloadable file on ' + page);
  console.log(`  ${up.name}`);
  const { url } = await (
    await req(jar, `${page}/file/${up.id}?source=game_download`, {
      method: 'POST',
      body: new URLSearchParams({ csrf_token: csrfOf(dlHtml) ?? csrf }),
      headers: { Referer: dlPage, 'X-Requested-With': 'XMLHttpRequest' },
    })
  ).json();
  return bytes(url);
}
/** Kenney.nl (CC0) asset page → zip buffer */
async function kenneyZip(slug) {
  const jar = new Jar();
  const page = `https://kenney.nl/assets/${slug}`;
  const html = await (await req(jar, page)).text();
  const id = /data-download-id='([0-9a-f]+)'/.exec(html)?.[1];
  const { url } = await (await req(jar, `https://kenney.nl/download-link/${id}`, { headers: { Referer: page } })).json();
  return bytes(url, jar);
}
async function bytes(url, jar = new Jar()) {
  const res = await req(jar, url);
  return Buffer.from(await res.arrayBuffer());
}

function unzipTo(buf, dest, keep) {
  const zip = new AdmZip(buf);
  let n = 0;
  for (const ent of zip.getEntries()) {
    const name = ent.entryName;
    if (ent.isDirectory || name.includes('__MACOSX') || !keep(name)) continue;
    const out = path.join(dest, name);
    if (!out.startsWith(dest)) continue; // zip-slip guard
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, ent.getData());
    n++;
  }
  return n;
}

const png = (...dirs) => (n) => n.endsWith('.png') && dirs.some((d) => n.includes(d));
const CP = 'https://free-game-assets.itch.io/'; // CraftPix's official itch.io page

const PACKS = [
  // --- characters / UI (required by the brief) ---
  { name: 'Ækashics Librarium (static battlers)', dir: 'librarium', get: () => itchZip('https://aekashics.itch.io/aekashics-librarium-librarium-static-batch-megapack', /Static Battlers\.zip$/), keep: (n) => n.includes('Sideview Batch Battlers/') },
  // --- UI kit & painted icons (Ravenmore) ---
  { name: 'Ravenmore Fantasy UI Elements (PSD)', dir: 'ravenmore', file: 'ADOM-OGA-UI-SmartObject.psd', get: () => bytes('https://opengameart.org/sites/default/files/ADOM-OGA-UI-SmartObject.psd') },
  { name: 'Ravenmore Fantasy Icon Pack', dir: 'ravenmore/icon-pack', get: () => bytes('https://opengameart.org/sites/default/files/RavenmoreIconPack.02.2014.zip'), keep: (n) => n.startsWith('128/') && n.endsWith('.png') },
  { name: 'Ravenmore Fantasy Weapon & Armor Icons', dir: 'ravenmore/weapons-armor', get: () => itchZip('https://ravenmore.itch.io/fantasy-weapon-armor-icons', /128px_free/), keep: (n) => n.endsWith('.png') },
  // --- CraftPix freebies: battle backgrounds, effects, items ---
  { name: 'CraftPix Free Forest Battle Backgrounds', dir: 'craftpix/forest-bg', get: () => itchZip(CP + 'free-forest-battle-backgrounds'), keep: (n) => /game_background_\d\.png$/.test(n) || n.endsWith('license.txt') },
  { name: 'CraftPix Free Elven Land Battle Backgrounds', dir: 'craftpix/elven-bg', get: () => itchZip(CP + 'free-elven-land-2d-battle-backgrounds'), keep: (n) => /game_background_\d\.png$/.test(n) || n.endsWith('license.txt') },
  { name: 'CraftPix Free Vampire Battle Backgrounds', dir: 'craftpix/vampire-bg', get: () => itchZip(CP + 'free-vampires-locations-battle-background-pack'), keep: (n) => /PNG\/\d\/[a-z ]+\.png$/.test(n) },
  { name: 'CraftPix Free Elemental Attack Effects', dir: 'craftpix/slash-fx', get: () => itchZip(CP + 'free-elemental-attack-effects-2d-pack'), keep: (n) => n.endsWith('.png') && n.includes('/PNG/') },
  { name: 'CraftPix Free Cartoon Smoke Effects', dir: 'craftpix/smoke-fx', get: () => itchZip(CP + 'free-2d-cartoon-smoke-effects-pack'), keep: png('Smoke/PNG', 'Smoke Explosion/PNG', 'Poisonous Smoke/PNG') },
  { name: 'CraftPix Free Animated Explosions', dir: 'craftpix/explosion-fx', get: () => itchZip(CP + 'free-animated-explosion-sprite-pack'), keep: (n) => n.endsWith('.png') },
  { name: 'CraftPix Free Fire & Water Magic Spells', dir: 'craftpix/spell-fx', get: () => itchZip(CP + 'free-fire-water-magic-spell-vector-pack'), keep: png('Fire Spell/PNG', 'Water Spell/PNG', 'Fire Arrow/PNG', 'Water Arrow/PNG', 'Water Ball/PNG') },
  { name: 'CraftPix Free Game Coins', dir: 'craftpix/coins', get: () => itchZip(CP + 'free-game-coins-sprite'), keep: png('PNG/Gold') },
  { name: 'CraftPix Free Crystals', dir: 'craftpix/crystals', get: () => itchZip(CP + 'free-crystals-2d-game-objects'), keep: png('PNG/simple') },
  // --- icons (CC BY 3.0) ---
  { name: 'game-icons.net', dir: 'game-icons', get: () => bytes('https://game-icons.net/archives/svg/zip/ffffff/transparent/game-icons.net.svg.zip'), keep: (n) => n.endsWith('.svg') || n.endsWith('license.txt') },
  // --- audio (CC0) ---
  { name: 'Kenney Interface Sounds', dir: 'kenney/interface-sounds', get: () => kenneyZip('interface-sounds'), keep: (n) => n.endsWith('.ogg') },
  { name: 'Kenney Impact Sounds', dir: 'kenney/impact-sounds', get: () => kenneyZip('impact-sounds'), keep: (n) => n.endsWith('.ogg') },
  { name: 'Kenney RPG Audio', dir: 'kenney/rpg-audio', get: () => kenneyZip('rpg-audio'), keep: (n) => n.endsWith('.ogg') },
  { name: 'Kenney Music Jingles', dir: 'kenney/music-jingles', get: () => kenneyZip('music-jingles'), keep: (n) => n.endsWith('.ogg') },
  { name: 'Fairy Adventure (MintoDog, OpenGameArt)', dir: 'music', file: 'fairy_adventure.ogg', get: () => bytes('https://opengameart.org/sites/default/files/fairy_adventure_bpm140_0.ogg') },
  { name: 'Battle Theme A (cynicmusic, OpenGameArt)', dir: 'music', file: 'battle_theme_a.mp3', get: () => bytes('https://opengameart.org/sites/default/files/battleThemeA.mp3') },
];

let failed = 0;
for (const p of PACKS) {
  const dest = path.join(SRC, p.dir);
  const present = p.file ? fs.existsSync(path.join(dest, p.file)) : fs.existsSync(dest) && fs.readdirSync(dest).length > 0;
  if (present) {
    console.log(`✓ ${p.name}`);
    continue;
  }
  console.log(`↓ ${p.name}`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const buf = await p.get();
      fs.mkdirSync(dest, { recursive: true });
      if (p.file) fs.writeFileSync(path.join(dest, p.file), buf);
      else console.log(`  extracted ${unzipTo(buf, dest, p.keep)} files`);
      break;
    } catch (e) {
      console.warn(`  attempt ${attempt} failed: ${e.message}`);
      if (attempt === 3) failed++;
      else await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}
if (failed) {
  console.error(`${failed} asset pack(s) could not be downloaded`);
  process.exit(1);
}
