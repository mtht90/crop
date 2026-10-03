// ============================================================================
// Custom avatars: a small picture the player uploads. It travels (and is
// stored) as a data URL in the `portrait` field, in place of a portrait key.
// The browser shrinks it to a 128px square first; the server checks it again.
// ============================================================================

/** longest data URL the server accepts (≈ 18 KB of picture) */
export const AVATAR_MAX_CHARS = 24_000;

const HEAD = /^data:image\/(jpeg|png|webp);base64,/;

/** is this a custom avatar (rather than the key of a built-in portrait)? */
export const isAvatarUrl = (s: unknown): s is string => typeof s === 'string' && s.startsWith('data:image/');

/** true when the string really is a small jpeg / png / webp image */
export function validAvatar(s: unknown): s is string {
  if (typeof s !== 'string' || s.length > AVATAR_MAX_CHARS) return false;
  const m = HEAD.exec(s);
  if (!m) return false;
  const body = s.slice(m[0].length);
  if (body.length < 64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return false;
  // the first bytes must be the image's own signature, whatever the label says
  const b = atob(body.slice(0, 24));
  const kind = m[1];
  if (kind === 'jpeg') return b.charCodeAt(0) === 0xff && b.charCodeAt(1) === 0xd8 && b.charCodeAt(2) === 0xff;
  if (kind === 'png') return b.startsWith('\x89PNG');
  return b.startsWith('RIFF') && b.slice(8, 12) === 'WEBP';
}
