// Cloudflare Pages: put the prebuilt game (web/) and its art and sound (public/)
// into one folder, site/, with caching rules. No install or build is needed.
import { cpSync, rmSync, writeFileSync } from 'node:fs';
rmSync('site', { recursive: true, force: true });
cpSync('public', 'site', { recursive: true });
cpSync('web', 'site', { recursive: true });
writeFileSync(
  'site/_headers',
  `/assets/*
  Cache-Control: public, max-age=604800
/assets/index-*
  Cache-Control: public, max-age=31536000, immutable
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
`,
);
console.log('site/ ready');
