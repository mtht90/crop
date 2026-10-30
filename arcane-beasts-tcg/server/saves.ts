// ============================================================================
// Save transfer: a device uploads its whole save and gets a short code; another
// device enters the code (within an hour, once) and receives the save.
//   • the save is opaque JSON to the server (only its size is checked)
//   • kept in memory and mirrored to one JSON file, so a restart inside the hour
//     does not lose it on hosts with a persistent disk
// ============================================================================
import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** no 0/O, 1/I: easy to read aloud and to type */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const SAVE_CODE_LENGTH = 8;
export const SAVE_TTL_MS = 60 * 60 * 1000;
/** a full collection is well under this */
export const SAVE_MAX_BYTES = 600_000;
const MAX_ENTRIES = 5000;

interface Entry {
  data: string;
  expires: number;
}

/** "abcd-efgh" / "ABCD EFGH" → "ABCDEFGH" */
export const normalizeSaveCode = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '');

export class SaveTransfers {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {
    if (file && existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Entry>;
        for (const [k, v] of Object.entries(raw)) if (v && typeof v.data === 'string' && v.expires > this.now()) this.entries.set(k, v);
      } catch {
        /* a broken file only loses pending transfers */
      }
    }
  }

  get size() {
    return this.entries.size;
  }

  private sweep() {
    const t = this.now();
    for (const [k, v] of this.entries) if (v.expires <= t) this.entries.delete(k);
  }

  private flush() {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.entries)));
      renameSync(tmp, this.file);
    } catch {
      /* memory still has it */
    }
  }

  /** store a save; returns its code, or an error message */
  create(data: string): { code: string; expires: number } | { error: string } {
    if (data.length > SAVE_MAX_BYTES) return { error: 'データが大きすぎます' };
    try {
      const v = JSON.parse(data) as { collection?: unknown; coins?: unknown };
      if (!v || typeof v !== 'object' || typeof v.coins !== 'number' || typeof v.collection !== 'object') return { error: 'セーブデータの形式が正しくありません' };
    } catch {
      return { error: 'セーブデータの形式が正しくありません' };
    }
    this.sweep();
    if (this.entries.size >= MAX_ENTRIES) return { error: '混み合っています。少し待ってからもう一度お試しください' };
    let code: string;
    do {
      code = Array.from({ length: SAVE_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    } while (this.entries.has(code));
    const expires = this.now() + SAVE_TTL_MS;
    this.entries.set(code, { data, expires });
    this.flush();
    return { code, expires };
  }

  /** hand the save over and forget it (one use) */
  take(code: string): string | null {
    this.sweep();
    const key = normalizeSaveCode(code);
    const e = this.entries.get(key);
    if (!e) return null;
    this.entries.delete(key);
    this.flush();
    return e.data;
  }
}

/** a simple per-address limit, so codes cannot be guessed by brute force */
export class RateLimit {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}
  allow(key: string): boolean {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => x > t - this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 10000) for (const [k, v] of this.hits) if (!v.some((x) => x > t - this.windowMs)) this.hits.delete(k);
    return true;
  }
}
