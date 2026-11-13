// ============================================================================
// Deck codes: a whole deck as a short text anyone can copy, send and type in.
//
// A code lists cards by name (any printing of a card counts as that card), so
// whoever enters it builds the deck from the printings they own. Layout:
//   "AB" + version + base32 (Crockford: no I L O U) of 16-bit entries,
//   grouped by 5 with hyphens, e.g. AB1-8Z2K4-…
// Each entry:
//   00 ss nnnnnnnnn ccc   a card of set AB1+s (AB1–AB4), number n, count c+1
//   01 eee cccccc 00000   basic energy of type e, count c
//   10 kkkkkkkk ccc 000   a raid or event card (index k in SPECIAL), count c+1
//   11 ss nnnnnnnnn ccc   a card of set AB5+s, number n, count c+1
// ============================================================================
import { byName, card, CARDS } from './cards';
import { ENERGY_TYPES, type CardDef } from './types';

const VERSION = '1';
const SETS = ['AB1', 'AB2', 'AB3', 'AB4', 'AB5'] as const;
/** raid and event cards, in the order they were added (append only: codes keep working) */
const SPECIAL = ['RAID-boneking', 'RAID-frost', 'RAID-kraken', 'RAID-herald', 'RAID-dragon', 'RAID-emperor', 'RAID-seaking', 'RAID-archlich', 'EVENT-snow', 'EVENT-wyrm', 'EVENT-ghost', 'EVENT-witch', 'EVENT-tower-sky', 'EVENT-tower-lava', 'EVENT-tower-grave', 'EVENT-tower-holy'];
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** the card a name stands for in codes (its first, plain printing) */
function baseOf(c: CardDef): CardDef {
  if (c.kind === 'energy') return c;
  if (c.id.startsWith('RAID-') || c.id.startsWith('EVENT-')) return c;
  try {
    return byName(c.name);
  } catch {
    return c;
  }
}

function toBase32(bytes: number[]): string {
  let out = '';
  let buf = 0;
  let bits = 0;
  for (const b of bytes) {
    buf = ((buf << 8) | b) & 0xfffff;
    bits += 8;
    while (bits >= 5) {
      out += ALPHA[(buf >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHA[(buf << (5 - bits)) & 31];
  return out;
}

function fromBase32(s: string): number[] | null {
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = ALPHA.indexOf(ch);
    if (v < 0) return null;
    buf = ((buf << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buf >> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return bytes;
}

/** a deck (card ids) as a code */
export function encodeDeck(ids: string[]): string {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const b = baseOf(card(id));
    counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
  }
  const words: number[] = [];
  for (const [id, n0] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const c = card(id);
    if (c.kind === 'energy' && c.basic) {
      const t = ENERGY_TYPES.indexOf(c.energyType);
      if (t < 0) continue;
      for (let n = n0; n > 0; n -= 63) words.push((1 << 14) | (t << 11) | (Math.min(63, n) << 5));
      continue;
    }
    const sp = SPECIAL.indexOf(id);
    for (let n = n0; n > 0; n -= 8) {
      const k = Math.min(8, n) - 1;
      if (sp >= 0) words.push((2 << 14) | (sp << 6) | (k << 3));
      else {
        const m = /^AB(\d)-(\d+)$/.exec(id);
        if (!m) continue;
        // sets AB1–AB4 use kind 00, AB5–AB8 kind 11 (two bits for the set either way)
        const si = Number(m[1]) - 1;
        words.push(((si < 4 ? 0 : 3) << 14) | ((si & 3) << 12) | (Number(m[2]) << 3) | k);
      }
    }
  }
  const raw = toBase32(words.flatMap((w) => [w >> 8, w & 255]));
  return `AB${VERSION}-${raw.match(/.{1,5}/g)!.join('-')}`;
}

export interface DecodedDeck {
  /** what the code asks for, by card name (energy by its own name) */
  cards: { name: string; id: string; n: number }[];
  total: number;
}

/** a code back to card names and counts (null when it is not a valid code) */
export function decodeDeck(code: string): DecodedDeck | null {
  const s = code
    .toUpperCase()
    .replace(/[OＯ]/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '');
  if (!s.startsWith('AB' + VERSION)) return null;
  const bytes = fromBase32(s.slice(3));
  if (!bytes || bytes.length < 2) return null;
  const out = new Map<string, { name: string; id: string; n: number }>();
  const add = (id: string, n: number) => {
    const c = CARDS[id];
    if (!c) return false;
    const e = out.get(id) ?? { name: c.name, id, n: 0 };
    e.n += n;
    out.set(id, e);
    return true;
  };
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const w = (bytes[i] << 8) | bytes[i + 1];
    const kind = w >> 14;
    if (kind === 0 || kind === 3) {
      const set = SETS[(kind === 3 ? 4 : 0) + ((w >> 12) & 3)];
      const no = (w >> 3) & 511;
      if (!set || !add(`${set}-${String(no).padStart(3, '0')}`, (w & 7) + 1)) return null;
    } else if (kind === 1) {
      const t = ENERGY_TYPES[(w >> 11) & 7];
      if (!t || !add(`AB1-E${t}`, (w >> 5) & 63)) return null;
    } else if (kind === 2) {
      const id = SPECIAL[(w >> 6) & 255];
      if (!id || !add(id, ((w >> 3) & 7) + 1)) return null;
    } else return null;
  }
  const cards = [...out.values()];
  return cards.length ? { cards, total: cards.reduce((a, c) => a + c.n, 0) } : null;
}

export interface CodeLine {
  /** the card the code names (its plain printing) */
  id: string;
  name: string;
  need: number;
  /** how many of them can come from the player's own cards */
  have: number;
}

export interface BuiltFromCode {
  lines: CodeLine[];
  /** the deck from what the player owns (fancy printings first) */
  cards: string[];
  need: number;
  have: number;
}

/** build what a code asks for out of the player's collection */
export function buildFromCode(d: DecodedDeck, owned: (cid: string) => number, printings: (name: string) => CardDef[]): BuiltFromCode {
  const used = new Map<string, number>();
  const cards: string[] = [];
  const lines: CodeLine[] = [];
  for (const e of d.cards) {
    const c = card(e.id);
    let have = 0;
    if (c.kind === 'energy' && c.basic) {
      for (let i = 0; i < e.n; i++) cards.push(e.id);
      have = e.n;
    } else if (c.id.startsWith('RAID-') || c.id.startsWith('EVENT-')) {
      have = Math.min(e.n, owned(c.id));
      for (let i = 0; i < have; i++) cards.push(c.id);
    } else {
      for (const p of printings(c.name)) {
        while (have < e.n && owned(p.id) - (used.get(p.id) ?? 0) > 0) {
          used.set(p.id, (used.get(p.id) ?? 0) + 1);
          cards.push(p.id);
          have++;
        }
        if (have >= e.n) break;
      }
    }
    lines.push({ id: e.id, name: e.name, need: e.n, have });
  }
  return { lines, cards, need: d.total, have: cards.length };
}
