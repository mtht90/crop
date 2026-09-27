/** 型付きイベントバス。ゲーム内のシステム同士はここを経由して疎結合に連携する */
export type GameEvents = {
  'money:changed': { money: number; delta: number; reason: string };
  'reputation:changed': { value: number; delta: number };
  'xp:gained': { amount: number; level: number; leveledUp: boolean };
  'item:sold': { itemUid: string; price: number; cost: number };
  'item:bought': { itemUid: string; price: number };
  'item:placed': { itemUid: string };
  'item:priced': { itemUid: string; price: number };
  'item:cleaned': { itemUid: string };
  'item:repaired': { itemUid: string; success: boolean };
  'fake:detected': { itemUid: string };
  'fake:bought': { itemUid: string };
  'customer:left': { happy: boolean };
  'day:started': { day: number };
  'day:opened': { day: number };
  'day:ended': { day: number };
  'fixture:bought': { id: string };
  'upgrade:bought': { id: string };
  'toast': { text: string; kind?: 'info' | 'good' | 'bad' | 'warn'; icon?: string };
  'objective:done': { id: string };
};

type Handler<T> = (payload: T) => void;

class EventBus {
  private map = new Map<string, Set<Handler<any>>>();
  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type)!.add(fn);
    return () => this.map.get(type)?.delete(fn);
  }
  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]) {
    this.map.get(type)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`[event ${type}]`, e); }
    });
  }
}

export const events = new EventBus();
export const toast = (text: string, kind: GameEvents['toast']['kind'] = 'info', icon?: string) => events.emit('toast', { text, kind, icon });
