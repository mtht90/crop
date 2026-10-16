const KEY = 'skyward.save.v1';
const SKEY = 'skyward.settings.v1';
const RKEY = 'skyward.records.v1';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode 等 */ } };

export const Save = {
  load: () => read(KEY),
  store: (data) => write(KEY, { ...data, savedAt: Date.now() }),
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
  settings: () => read(SKEY),
  storeSettings: (s) => write(SKEY, s),
  records: () => read(RKEY) || {},
  storeRecord(diff, time, falls) {
    const r = this.records();
    const prev = r[diff];
    if (!prev || time < prev.time) r[diff] = { time, falls, at: Date.now() };
    r.clears = (r.clears || 0) + 1;
    write(RKEY, r);
    return !prev || time < prev.time;
  },
  bestHeight(h) {
    const r = this.records();
    if (h !== undefined && h > (r.bestHeight || 0)) { r.bestHeight = h; write(RKEY, r); }
    return r.bestHeight || 0;
  },
};

export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
