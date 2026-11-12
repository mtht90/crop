'use strict';

// Link previews (Open Graph). Guards against SSRF: only http(s), every hop's
// address is resolved and checked, and private / loopback ranges are refused.

const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');

const MAX_BYTES = 512 * 1024;
const TIMEOUT = 5000;
const cache = new Map(); // url -> { at, data }

function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateAddress(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
}

async function safeLookup(hostname) {
  if (net.isIP(hostname)) {
    if (privateAddress(hostname)) throw new Error('blocked address');
    return { address: hostname, family: net.isIPv6(hostname) ? 6 : 4 };
  }
  const list = await dns.lookup(hostname, { all: true });
  const ok = list.find((a) => !privateAddress(a.address));
  if (!ok || list.some((a) => privateAddress(a.address))) throw new Error('blocked address');
  return ok;
}

function fetchHtml(url, hops = 0) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error('bad url'));
    }
    if (!/^https?:$/.test(u.protocol) || hops > 3) return reject(new Error('refused'));
    safeLookup(u.hostname).then(({ address, family }) => {
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.get(u, {
        timeout: TIMEOUT,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; LynqPreview/1.0)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'ja,en;q=0.8' },
        // Pin the connection to the address we checked.
        lookup: (_host, opts, cb) => (opts?.all ? cb(null, [{ address, family }]) : cb(null, address, family)),
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(fetchHtml(new URL(res.headers.location, u).href, hops + 1));
        }
        if (res.statusCode !== 200 || !/text\/html|xhtml/.test(res.headers['content-type'] || '')) {
          res.resume();
          return reject(new Error(`status ${res.statusCode}`));
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          chunks.push(c);
          if (size > MAX_BYTES) res.destroy();
        });
        res.on('close', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), url: u.href }));
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    }, reject);
  });
}

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/\s+/g, ' ').trim();

function meta(html, keys) {
  for (const key of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decode(content);
  }
  return '';
}

async function preview(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.data;
  let data = null;
  try {
    const { html, url: finalUrl } = await fetchHtml(url);
    const head = html.slice(0, 200000);
    const title = meta(head, ['og:title', 'twitter:title']) || decode(head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '');
    if (title) {
      let image = meta(head, ['og:image', 'twitter:image', 'og:image:url']);
      if (image) {
        try {
          image = new URL(image, finalUrl).href;
          if (!image.startsWith('https://')) image = '';
        } catch {
          image = '';
        }
      }
      data = {
        url,
        title: [...title].slice(0, 120).join(''),
        desc: [...meta(head, ['og:description', 'description', 'twitter:description'])].slice(0, 200).join(''),
        site: [...(meta(head, ['og:site_name']) || new URL(finalUrl).hostname)].slice(0, 60).join(''),
        image: image.slice(0, 1000),
      };
    }
  } catch {
    data = null;
  }
  cache.set(url, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return data;
}

module.exports = { preview, privateAddress };
