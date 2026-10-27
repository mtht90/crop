// ============================================================================
// Player records (anonymous id + secret), stored in one JSON file.
//   • a device holds {id, secret}; the server keeps only a hash of the secret
//   • a transfer code (10 minutes, one use) hands the identity to another device
//   • the online record (games, wins, losses) is kept here
// ============================================================================
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PORTRAITS, type OnlineProfile } from '../src/online/protocol';
import { judgeName } from '../src/online/names';
import type { PlayerBackend } from './remote';

export interface PlayerRecord {
  id: string;
  secrets: string[]; // sha256 hashes
  name: string;
  portrait: string;
  /** left over from the old ranked mode (no longer used) */
  rank?: unknown;
  games: number;
  wins: number;
  losses: number;
  createdAt: number;
  lastSeen: number;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** a built-in portrait key or an uploaded picture that passed the check */
export const portraitOk = (s: unknown): s is string => typeof s === 'string' && PORTRAITS.includes(s);

export const cleanName = (s: unknown) => {
  const t = String(s ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 12);
  return t || 'ななし';
};

export class PlayerStore {
  private players = new Map<string, PlayerRecord>();
  private transfers = new Map<string, { id: string; expires: number }>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** players changed since the last successful write to the database */
  private dirty = new Set<string>();
  private remoteBusy: Promise<void> | null = null;

  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
    private readonly backend: PlayerBackend | null = null,
  ) {
    if (file && existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf8')) as PlayerRecord[];
        for (const p of data) {
          this.players.set(p.id, p);
        }
      } catch (e) {
        console.error('players file unreadable, starting empty:', e);
      }
    }
  }

  get size() {
    return this.players.size;
  }

  /** load the hosted database (if one is set up) and merge it over the local file */
  async init() {
    if (!this.backend) return;
    const list = await this.backend.loadAll();
    for (const p of list) {
      this.players.set(p.id, p);
    }
    // anything only the local file knew (an earlier run without a database) moves up
    for (const p of this.players.values()) if (!list.some((x) => x.id === p.id)) this.dirty.add(p.id);
    if (this.dirty.size) this.save();
  }

  create(name?: string, portrait?: string): { player: PlayerRecord; secret: string } {
    const secret = randomBytes(24).toString('base64url');
    const player: PlayerRecord = {
      id: randomUUID(),
      secrets: [hash(secret)],
      name: ((v) => (v.ok ? cleanName(v.name) : `ななし${randomInt(100, 1000)}`))(judgeName(name)),
      portrait: portrait && PORTRAITS.includes(portrait) ? portrait : PORTRAITS[0],
      games: 0,
      wins: 0,
      losses: 0,
      createdAt: this.now(),
      lastSeen: this.now(),
    };
    this.players.set(player.id, player);
    this.save(player);
    return { player, secret };
  }

  /** the record for a valid id+secret, else null */
  authenticate(id: string | undefined, secret: string | undefined): PlayerRecord | null {
    if (!id || !secret) return null;
    const p = this.players.get(id);
    if (!p || !p.secrets.includes(hash(secret))) return null;
    p.lastSeen = this.now();
    // names saved before the filter existed
    if (!judgeName(p.name).ok) {
      p.name = `ななし${randomInt(100, 1000)}`;
      this.save(p);
    }
    // pictures uploaded when that was still allowed
    if (!PORTRAITS.includes(p.portrait)) {
      p.portrait = PORTRAITS[0];
      this.save(p);
    }
    return p;
  }

  get(id: string) {
    return this.players.get(id) ?? null;
  }

  rename(p: PlayerRecord, name: string, portrait?: string) {
    p.name = cleanName(name);
    if (portrait && portraitOk(portrait)) p.portrait = portrait;
    this.save(p);
  }

  profile(p: PlayerRecord): OnlineProfile {
    return { id: p.id, name: p.name, portrait: p.portrait, games: p.games, wins: p.wins, losses: p.losses };
  }

  recordCasual(p: PlayerRecord, win: boolean) {
    p.games++;
    if (win) p.wins++;
    else p.losses++;
    this.save(p);
  }

  /** a fresh secret for another device of `p` (the oldest of more than 5 stops working) */
  newSecret(p: PlayerRecord): string {
    const secret = randomBytes(24).toString('base64url');
    p.secrets.push(hash(secret));
    if (p.secrets.length > 5) p.secrets.shift();
    this.save(p);
    return secret;
  }

  // ---- transfer codes -----------------------------------------------------
  createTransfer(p: PlayerRecord): { code: string; expires: number } {
    for (const [c, t] of this.transfers) if (t.id === p.id || t.expires < this.now()) this.transfers.delete(c);
    let code = '';
    do {
      code = Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    } while (this.transfers.has(code));
    const expires = this.now() + 10 * 60_000;
    this.transfers.set(code, { id: p.id, expires });
    return { code, expires };
  }

  /** consume a transfer code: the new device gets its own secret */
  redeem(code: string): { player: PlayerRecord; secret: string } | null {
    const key = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
    const t = this.transfers.get(key);
    if (!t || t.expires < this.now()) return null;
    this.transfers.delete(key);
    const p = this.players.get(t.id);
    if (!p) return null;
    return { player: p, secret: this.newSecret(p) };
  }

  // ---- persistence --------------------------------------------------------
  save(changed?: PlayerRecord) {
    if (changed) this.dirty.add(changed.id);
    if ((!this.file && !this.backend) || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 400);
  }
  /** write everything now (the file at once; the database in the background — await `close()` to wait for it) */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.file) {
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        const tmp = this.file + '.tmp';
        writeFileSync(tmp, JSON.stringify([...this.players.values()]));
        renameSync(tmp, this.file);
      } catch (e) {
        console.error('could not save players:', e);
      }
    }
    if (this.backend) void this.flushRemote();
  }
  /** push the changed players to the database; a failed write is retried later */
  flushRemote(): Promise<void> {
    if (!this.backend) return Promise.resolve();
    if (this.remoteBusy) return this.remoteBusy;
    const ids = [...this.dirty];
    if (!ids.length) return Promise.resolve();
    this.dirty.clear();
    const backend = this.backend;
    this.remoteBusy = backend
      .saveMany(ids.map((id) => this.players.get(id)).filter((p): p is PlayerRecord => !!p))
      .catch((e) => {
        console.error('could not save players to the database (will retry):', e instanceof Error ? e.message : e);
        for (const id of ids) this.dirty.add(id);
        setTimeout(() => this.save(), 15_000).unref?.();
      })
      .finally(() => {
        this.remoteBusy = null;
        // changes that arrived while writing
        if (this.dirty.size && !this.timer) this.save();
      });
    return this.remoteBusy;
  }
  /** everything written, including the database (used when the server is shutting down) */
  async close() {
    this.flush();
    for (let i = 0; i < 3 && (this.remoteBusy || this.dirty.size); i++) {
      await (this.remoteBusy ?? this.flushRemote());
    }
  }
}
