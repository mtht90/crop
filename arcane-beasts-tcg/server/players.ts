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
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

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

  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
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

  create(name?: string, portrait?: string): { player: PlayerRecord; secret: string } {
    const secret = randomBytes(24).toString('base64url');
    const player: PlayerRecord = {
      id: randomUUID(),
      secrets: [hash(secret)],
      name: String(name ?? '').trim() ? cleanName(name) : `ななし${randomInt(100, 1000)}`,
      portrait: portrait && PORTRAITS.includes(portrait) ? portrait : PORTRAITS[0],
      rank: freshRank(),
      games: 0,
      wins: 0,
      losses: 0,
      createdAt: this.now(),
      lastSeen: this.now(),
    };
    this.players.set(player.id, player);
    this.save();
    return { player, secret };
  }

  /** the record for a valid id+secret, else null */
  authenticate(id: string | undefined, secret: string | undefined): PlayerRecord | null {
    if (!id || !secret) return null;
    const p = this.players.get(id);
    if (!p || !p.secrets.includes(hash(secret))) return null;
    p.lastSeen = this.now();
    if (ensureSeason(p.rank)) this.save();
    return p;
  }

  get(id: string) {
    return this.players.get(id) ?? null;
  }

  rename(p: PlayerRecord, name: string, portrait?: string) {
    p.name = cleanName(name);
    if (portrait && PORTRAITS.includes(portrait)) p.portrait = portrait;
    this.save();
  }

  profile(p: PlayerRecord): OnlineProfile {
    return { id: p.id, name: p.name, portrait: p.portrait, rank: p.rank, games: p.games };
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
    this.save();
    return change;
  }
  recordCasual(p: PlayerRecord, win: boolean) {
    p.games++;
    if (win) p.wins++;
    else p.losses++;
    this.save();
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
    this.save();
    return { player: p, secret };
  }

  // ---- persistence --------------------------------------------------------
  save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 400);
  }
  flush() {
    if (!this.file) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      writeFileSync(tmp, JSON.stringify([...this.players.values()]));
      renameSync(tmp, this.file);
    } catch (e) {
      console.error('could not save players:', e);
    }
  }
}
