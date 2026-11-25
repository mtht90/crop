/* 共同スクラッチマップ Service Worker（vite.config.ts がビルド時に生成） */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const APP_CACHE = `app-${VERSION}`;
const TILE_CACHE = 'tiles-v1';
const TILE_HOSTS = ['tiles.openfreemap.org'];
const MAX_TILES = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('app-') && k !== APP_CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API・SSE はキャッシュしない
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ingest/')) return;

  // 地図タイル・スタイル・フォント: stale-while-revalidate（オフラインでも見たことのある場所は表示）
  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      (async () => {
        const c = await caches.open(TILE_CACHE);
        const cached = await c.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              c.put(req, res.clone());
              if (Math.random() < 0.02) trimTiles();
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 画面遷移: ネットワーク優先、オフラインならキャッシュの index.html（SPA）
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/index.html')) || Response.error()));
    return;
  }

  // ビルド成果物（ハッシュ付き）: キャッシュ優先
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && url.pathname.startsWith('/assets/')) (await caches.open(APP_CACHE)).put(req, res.clone());
      return res;
    })(),
  );
});
