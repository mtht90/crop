// ============================================================================
// Player names for online play: what is allowed. Shared by the server (which
// decides) and the lobby (which only warns early).
//   • insults, sexual and discriminatory words are refused
//   • names that pose as the staff ("運営", "admin"…) are refused
//   • the check looks through spaces, symbols, katakana/hiragana, full-width
//     letters and look-alike characters (sh1t, ｓｈｉｔ, シネ, し.ね …)
// The server can add its own words with the NG_WORDS environment variable
// (comma separated).
// ============================================================================

export type NameVerdict = { ok: true; name: string } | { ok: false; reason: 'empty' | 'ng' | 'staff'; message: string };

/** words that are never allowed (hiragana / lower-case latin, matched after normalising) */
const NG = [
  // 暴言
  'しね', 'しんでしまえ', 'しねよ', 'ころす', 'ころしてやる', 'ころせ', 'きえろ', 'じさつ', 'しにたい', 'くたばれ', 'うざい', 'きもい', 'ぶす', 'でぶ', 'はげ', 'ばかやろう', 'あほんだら', 'くず', 'くそ', 'かす', 'ごみくず', 'ざこ',
  // 性的
  'ちんこ', 'ちんぽ', 'ちんちん', 'まんこ', 'おまんこ', 'おっぱい', 'せっくす', 'せっくる', 'えっち', 'えろ', 'ぽるの', 'おなにー', 'ふぇら', 'ぱいずり', 'ちくび', 'れいぷ', 'ごうかん', 'ちかん', 'ろり', 'しょた', 'ふたなり', 'しこしこ', 'ぶっかけ', 'なかだし',
  // 差別
  'きちがい', 'きちげえ', 'かたわ', 'めくら', 'つんぼ', 'ちょんこ', 'ちゃんころ', 'しなちく', 'がいじ', 'えた', 'ほも', 'おかま',
  // 英語
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'rape', 'rapist', 'porn', 'sex', 'nazi', 'hitler', 'killyourself', 'kys', 'suicide', 'cum', 'penis', 'vagina', 'tits', 'boob', 'anal',
];

/** names that make you look like the people running the game */
const STAFF = ['運営', '管理人', '管理者', '公式', 'うんえい', 'うんえいいん', 'かんりにん', 'かんりしゃ', 'こうしき', 'admin', 'administrator', 'moderator', 'gm', 'gamemaster', 'staff', 'official', 'system', 'support', 'claude', 'anthropic'];

/** look-alike characters → the letter they stand for */
const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

/** the form a name is compared in */
export function normalizeName(raw: string): string {
  let s = raw.normalize('NFKC').toLowerCase();
  // katakana → hiragana
  s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  // look-alikes first (so "sh1t" → "shit"), then everything that is not a letter goes
  s = s.replace(/[0134578@$!|+]/g, (c) => LOOKALIKE[c] ?? c);
  s = s.replace(/[ー〜～゛゜]/g, '');
  s = s.replace(/[^\p{L}\p{N}]/gu, '');
  // "shiiit" → "shit"
  s = s.replace(/(.)\1{2,}/gu, '$1$1');
  return s;
}

const extra = (): string[] => {
  const e = typeof process !== 'undefined' ? process.env?.NG_WORDS : undefined;
  return e ? e.split(',').map((w) => normalizeName(w)).filter(Boolean) : [];
};

/** short words only count when they are (nearly) the whole name — "ero" is in "hero", "rape" in "grape" */
const SHORT = new Set(['gm', 'kys', 'fag', 'sex', 'cum', 'anal', 'tits', 'boob', 'dick', 'cock', 'rape', 'porn', 'えろ', 'えた', 'くず', 'かす', 'くそ', 'ほも', 'ろり', 'しょた', 'しね', 'ざこ', 'はげ', 'ぶす', 'でぶ']);

function hits(norm: string, words: string[], whole = false): boolean {
  for (const w of words) {
    if (!w) continue;
    if (SHORT.has(w) || whole) {
      if (/^[a-z]+$/.test(w)) {
        // latin: the word alone, or with a plural / y ("sexy")
        if (norm === w || norm === w + 's' || norm === w + 'y') return true;
      } else if (norm.includes(w) && norm.length <= w.length + (whole ? 3 : 2)) return true;
    } else if (norm.includes(w)) return true;
  }
  return false;
}

/** the cleaned name if it may be used */
export function judgeName(raw: unknown): NameVerdict {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 12);
  const norm = normalizeName(name);
  if (!norm) return { ok: false, reason: 'empty', message: '名前を入力してください' };
  if (hits(norm, NG) || hits(norm, extra())) return { ok: false, reason: 'ng', message: 'その名前は使えません' };
  // latin staff names with digits around them ("admin01", "01gm") — but not "ecosystem"
  const plain = name.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (STAFF.some((w) => /^[a-z]+$/.test(w) && new RegExp(`^\\d*${w}\\d*$`).test(plain))) return { ok: false, reason: 'staff', message: '運営と間違えやすい名前は使えません' };
  if (hits(norm, STAFF, true)) return { ok: false, reason: 'staff', message: '運営と間違えやすい名前は使えません' };
  return { ok: true, name };
}
