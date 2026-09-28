export type GameEvent =
  | { type: 'toast'; text: string; kind?: 'info' | 'good' | 'warn' | 'ach' }
  | { type: 'achievement'; id: string }
  | { type: 'comet-spawn' }
  | { type: 'prestige'; layer: string }
  | { type: 'research-done'; id: string }
  | { type: 'expedition-done'; text: string }
  | { type: 'challenge-done'; id: string; comp: number }
  | { type: 'reset' };

type Listener = (e: GameEvent) => void;

export class Emitter {
  private listeners: Listener[] = [];

  on(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }
}
