export interface Settings {
  /** ノーツスピード 1.0 - 12.0（本家と同じスケール） */
  noteSpeed: number;
  /** タイミング調整(ms)。+ でノーツが遅れて来る */
  offsetMs: number;
  /** 6キー（左から） */
  keys: string[];
  /** フリックキー */
  flickKeys: string[];
  /** フリック判定にレーンキーの押下を必要とする */
  flickNeedsLane: boolean;
  sfxVolume: number;
  musicVolume: number;
  /** 背景動画の暗さ 0 - 1 */
  bgDim: number;
  showVideo: boolean;
  showFastLate: boolean;
  showKeyHints: boolean;
  failOnZeroLife: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  noteSpeed: 9.5,
  offsetMs: 0,
  keys: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
  flickKeys: ['Space'],
  flickNeedsLane: true,
  sfxVolume: 0.7,
  musicVolume: 80,
  bgDim: 0.7,
  showVideo: true,
  showFastLate: true,
  showKeyHints: true,
  failOnZeroLife: false,
};

export function normalizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? (raw as Partial<Settings>) : {}) };
  if (!Array.isArray(s.keys) || s.keys.length !== 6) s.keys = [...DEFAULT_SETTINGS.keys];
  if (!Array.isArray(s.flickKeys) || !s.flickKeys.length) s.flickKeys = [...DEFAULT_SETTINGS.flickKeys];
  s.noteSpeed = Math.min(12, Math.max(1, Number(s.noteSpeed) || DEFAULT_SETTINGS.noteSpeed));
  return s;
}

/** ノーツが画面奥から判定ラインに届くまでの秒数（Sonolus版 pjsekai エンジンと同じ式） */
export function noteDuration(speed: number): number {
  const u = (12 - speed) / 11;
  return 0.35 + 3.65 * Math.pow(Math.max(0, u), 1.31);
}

/** KeyboardEvent.code を表示用の文字に */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Space',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    ShiftLeft: 'LShift',
    ShiftRight: 'RShift',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
  };
  return map[code] ?? code;
}
