import { Decimal, dec } from './decimal';
import { defaultState, SAVE_VERSION, type GameState } from './state';

export const SAVE_KEY = 'stellar-frontier-save';
const BACKUP_KEY = 'stellar-frontier-save-backup';
const DEC_PREFIX = '#D:';
const INF = '#INF';
const NEG_INF = '#-INF';

function encode(v: unknown): unknown {
  if (v instanceof Decimal) return DEC_PREFIX + v.toString();
  if (typeof v === 'number') {
    if (v === Infinity) return INF;
    if (v === -Infinity) return NEG_INF;
    if (Number.isNaN(v)) return 0;
    return v;
  }
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = encode(val);
    return out;
  }
  return v;
}

function decode(v: unknown): unknown {
  if (typeof v === 'string') {
    if (v.startsWith(DEC_PREFIX)) return dec(v.slice(DEC_PREFIX.length));
    if (v === INF) return Infinity;
    if (v === NEG_INF) return -Infinity;
    return v;
  }
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = decode(val);
    return out;
  }
  return v;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Decimal);
}

/** 読み込んだデータを既定値に重ね、欠けた項目や型の壊れた項目を補う */
function mergeDefaults(def: unknown, loaded: unknown): unknown {
  if (loaded === undefined || loaded === null) return def;
  if (def instanceof Decimal) return loaded instanceof Decimal ? loaded : dec(loaded as string | number);
  if (Array.isArray(def)) {
    if (!Array.isArray(loaded)) return def;
    if (def.length > 0 && typeof def[0] === 'number') {
      // 施設数など固定長の数値配列
      const out = def.slice();
      for (let i = 0; i < Math.min(def.length, loaded.length); i++) {
        const n = Number(loaded[i]);
        out[i] = Number.isFinite(n) ? n : def[i];
      }
      return out;
    }
    return loaded;
  }
  if (isPlainObject(def)) {
    if (!isPlainObject(loaded)) return def;
    const keys = Object.keys(def);
    if (keys.length === 0) return loaded; // Record<string, number> のような可変キーの辞書
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = mergeDefaults(def[k], loaded[k]);
    return out;
  }
  if (typeof def === 'number') {
    const n = typeof loaded === 'number' ? loaded : Number(loaded);
    return Number.isNaN(n) ? def : n;
  }
  if (typeof def === 'boolean') return typeof loaded === 'boolean' ? loaded : def;
  if (typeof def === 'string') return typeof loaded === 'string' ? loaded : def;
  // null 既定値 (research.current, challenges.active など)
  return loaded;
}

export function serialize(s: GameState): string {
  return JSON.stringify(encode(s));
}

export function deserialize(json: string): GameState {
  const raw = decode(JSON.parse(json));
  const merged = mergeDefaults(defaultState(), raw) as GameState;
  return migrate(merged);
}

function migrate(s: GameState): GameState {
  // 将来のバージョンアップ時にここで変換する
  s.version = SAVE_VERSION;
  return s;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function exportSave(s: GameState): string {
  return toBase64(serialize(s));
}

export function importSave(text: string): GameState {
  const trimmed = text.trim();
  const json = trimmed.startsWith('{') ? trimmed : fromBase64(trimmed);
  return deserialize(json);
}

export function saveToStorage(s: GameState): boolean {
  try {
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(BACKUP_KEY, prev);
    localStorage.setItem(SAVE_KEY, serialize(s));
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage(): GameState | null {
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try {
      const text = localStorage.getItem(key);
      if (text) return deserialize(text);
    } catch {
      // 壊れていたらバックアップを試す
    }
  }
  return null;
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // 何もしない
  }
}
