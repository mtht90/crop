/**
 * 外部 GPS ロガーのペイロードを GeoPoint に変換する。
 * ここで得た座標はサーバー内でセル化した直後に捨てる（保存しない）。
 */
import type { GeoPoint } from '../../../shared/cells.js';

export interface ParsedBatch {
  /** 端末ごとの「直前セル」を分けるためのキー */
  device: string;
  points: GeoPoint[];
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

function parseTime(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v; // 秒 or ミリ秒
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return fallback;
}

/**
 * Overland: { locations: GeoJSON Feature<Point>[] }
 * properties.timestamp (ISO8601), properties.horizontal_accuracy (m), properties.device_id
 */
export function parseOverland(body: unknown, now = Date.now()): ParsedBatch[] {
  const locations = (body as { locations?: unknown })?.locations;
  if (!Array.isArray(locations)) return [];
  const byDevice = new Map<string, GeoPoint[]>();
  for (const f of locations) {
    const geom = (f as any)?.geometry;
    const props = (f as any)?.properties ?? {};
    if (geom?.type !== 'Point' || !Array.isArray(geom.coordinates)) continue;
    const lng = num(geom.coordinates[0]);
    const lat = num(geom.coordinates[1]);
    if (lat === undefined || lng === undefined) continue;
    const device = typeof props.device_id === 'string' && props.device_id ? props.device_id.slice(0, 64) : 'overland';
    const accuracy = num(props.horizontal_accuracy);
    const p: GeoPoint = { lat, lng, t: parseTime(props.timestamp, now), accuracy };
    (byDevice.get(device) ?? byDevice.set(device, []).get(device)!).push(p);
  }
  return [...byDevice].map(([device, points]) => ({ device, points }));
}

/**
 * OwnTracks: { _type: "location", lat, lon, acc, tst, tid }（配列で来ることもある）
 * location 以外の _type（transition, waypoint, lwt 等）は無視する。
 */
export function parseOwnTracks(body: unknown, deviceHeader?: string, now = Date.now()): ParsedBatch[] {
  const items = Array.isArray(body) ? body : [body];
  const byDevice = new Map<string, GeoPoint[]>();
  for (const m of items) {
    if (!m || typeof m !== 'object' || (m as any)._type !== 'location') continue;
    const lat = num((m as any).lat);
    const lng = num((m as any).lon);
    if (lat === undefined || lng === undefined) continue;
    const tid = typeof (m as any).tid === 'string' ? (m as any).tid : undefined;
    const device = (deviceHeader || tid || 'owntracks').slice(0, 64);
    const p: GeoPoint = { lat, lng, t: parseTime((m as any).tst, now), accuracy: num((m as any).acc) };
    (byDevice.get(device) ?? byDevice.set(device, []).get(device)!).push(p);
  }
  return [...byDevice].map(([device, points]) => ({ device, points }));
}
