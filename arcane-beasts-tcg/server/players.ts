// ============================================================================
// Player records (anonymous id + secret), stored in one JSON file.
//   • a device holds {id, secret}; the server keeps only a hash of the secret
//   • a transfer code (10 minutes, one use) hands the identity to another device
//   • online rank is kept here (the same ladder as the CPU ranked mode)
// ============================================================================
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { applyRanked, ensureSeason, freshRank, RANKS, type RankChange, type RankState } from '../src/state/ranked';
import { PORTRAITS, type OnlineProfile } from '../src/online/protocol';
import { judgeName } from '../src/online/names';
import { validAvatar } from '../src/online/avatar';
import { maskEmail, type GoogleIdentity } from './google';
import type { PlayerBackend } from './remote';

export interface PlayerRecord {
  id: string;
  secrets: string[]; // sha256 hashes
  name: string;
  portrait: string;
  rank: RankState;
  games: number;
  wins: number;
  losses: number;
  createdAt: number;
  lastSeen: number;
  /** sha256 of the Google account id, once signed up with Google */
  google?: string;
  /** the e-mail, masked, for display only */
  googleMail?: string;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** a built-in portrait key or an uploaded picture that passed the check */
export const portraitOk = (s: unknown): s is string => typeof s === 'string' && (PORTRAITS.includes(s) || validAvatar(s));

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
          p.rank = { ...freshRank(), ...p.rank };
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
      p.rank = { ...freshRank(), ...p.rank };
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
      rank: freshRank(),
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
    if (ensureSeason(p.rank)) this.save(p);
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
    return { id: p.id, name: p.name, portrait: p.portrait, rank: p.rank, games: p.games, google: p.googleMail };
  }

  rankLabel(p: PlayerRecord) {
    return RANKS[p.rank.rank];
  }

  /** record a finished ranked game; returns the change shown to the player */
  recordRanked(p: PlayerRecord, win: boolean): RankChange {
    const change = applyRanked(p.rank, win);
    p.games++;
    if (win) p.wins++;
    else p.losses++;
    this.save(p);
    return change;
  }
  recordCasual(p: PlayerRecord, win: boolean) {
    p.games++;
    if (win) p.wins++;
    else p.losses++;
    this.save(p);
  }

  // ---- Google accounts ----------------------------------------------------
  /**
   * Google sign-in for the player on this connection.
   *   new   — nobody used this Google account yet: it is joined to `p`
   *   same  — `p` already belongs to it
   *   login — it belongs to another player: the device switches to that one (new secret)
   *   null  — `p` already belongs to a different Google account
   */
  googleSignIn(p: PlayerRecord, who: GoogleIdentity): { mode: 'new' | 'same' | 'login'; player: PlayerRecord; secret?: string } | null {
    const key = hash(`google:${who.sub}`);
    const owner = [...this.players.values()].find((x) => x.google === key);
    if (owner && owner.id === p.id) {
      p.googleMail = maskEmail(who.email);
      this.save(p);
      return { mode: 'same', player: p };
    }
    if (owner) {
      const secret = randomBytes(24).toString('base64url');
      owner.secrets.push(hash(secret));
      if (owner.secrets.length > 5) owner.secrets.shift();
      owner.googleMail = maskEmail(who.email);
      this.save(owner);
      return { mode: 'login', player: owner, secret };
    }
    if (p.google) return null;
    p.google = key;
    p.googleMail = maskEmail(who.email);
    this.save(p);
    return { mode: 'new', player: p };
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
    const secret = randomBytes(24).toString('base64url');
    p.secrets.push(hash(secret));
    if (p.secrets.length > 5) p.secrets.shift();
    this.save(p);
    return { player: p, secret };
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
