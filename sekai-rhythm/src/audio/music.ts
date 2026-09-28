/** 楽曲の再生元（YouTube / 内蔵シンセ）の共通インターフェース */
export interface MusicSource {
  readonly kind: 'youtube' | 'synth';
  /** 読み込みと頭出し。失敗したら例外（メッセージはユーザー向け） */
  prepare(at: number): Promise<void>;
  play(): void;
  pause(): void;
  seek(t: number): void;
  /** 再生中なら音源の現在位置（秒）。停止中・バッファ中は null */
  mediaTime(): number | null;
  /** 再生しようとしているがバッファ中 */
  stalled(): boolean;
  setVolume(v: number): void;
  duration(): number;
  destroy(): void;
}
