import { MusicSource } from './music';

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(t: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(v: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
  getVideoData?(): { title?: string; author?: string };
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PLAYING = 1;
const BUFFERING = 3;

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const timer = setTimeout(() => {
      apiPromise = null;
      reject(new Error('YouTube に接続できませんでした（ネットワークを確認してください）'));
    }, 15000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timer);
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      clearTimeout(timer);
      apiPromise = null;
      reject(new Error('YouTube API を読み込めませんでした（ネットワークを確認してください）'));
    };
    document.head.append(s);
  });
  return apiPromise;
}

function errorMessage(code: number): string {
  switch (code) {
    case 2:
      return '動画IDが不正です';
    case 5:
      return 'この動画は再生できません（HTML5プレイヤーエラー）';
    case 100:
      return '動画が見つかりません（削除または非公開）';
    case 101:
    case 150:
    case 153:
      return 'この動画は埋め込み再生が許可されていません。別の動画（公式MVの別アップロード等）を指定してください';
    default:
      return `YouTube エラー (${code})`;
  }
}

export class YouTubeMusic implements MusicSource {
  readonly kind = 'youtube' as const;
  private player: YTPlayer | null = null;
  private wrap: HTMLElement;
  private host: HTMLElement;
  private wantPlaying = false;
  private stateWaiters: ((s: number) => void)[] = [];
  private volume: number;
  onError: (msg: string) => void = () => {};

  constructor(
    container: HTMLElement,
    private videoId: string,
    volume: number,
  ) {
    this.volume = volume;
    this.wrap = document.createElement('div');
    this.wrap.className = 'yt-wrap';
    this.host = document.createElement('div');
    this.wrap.append(this.host);
    container.append(this.wrap);
  }

  private waitState(pred: (s: number) => boolean, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.stateWaiters = this.stateWaiters.filter((w) => w !== fn);
        resolve();
      };
      const fn = (s: number) => {
        if (pred(s)) done();
      };
      const timer = setTimeout(done, timeoutMs);
      this.stateWaiters.push(fn);
    });
  }

  async prepare(at: number): Promise<void> {
    if (!this.videoId) throw new Error('YouTube の動画が設定されていません');
    const YT = await loadYouTubeApi();
    await new Promise<void>((resolve, reject) => {
      let ready = false;
      this.player = new YT.Player(this.host, {
        videoId: this.videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          origin: location.origin,
        },
        events: {
          onReady: () => {
            ready = true;
            resolve();
          },
          onStateChange: (e: { data: number }) => {
            for (const w of [...this.stateWaiters]) w(e.data);
          },
          onError: (e: { data: number }) => {
            const msg = errorMessage(e.data);
            if (!ready) reject(new Error(msg));
            else this.onError(msg);
          },
        },
      });
      setTimeout(() => {
        if (!ready) reject(new Error('YouTube プレイヤーの準備がタイムアウトしました'));
      }, 20000);
    });
    const p = this.player!;
    // ミュートで一瞬再生して先読みさせる（開始の遅延を減らす）
    p.mute();
    p.seekTo(Math.max(0, at), true);
    p.playVideo();
    await this.waitState((s) => s === PLAYING, 12000);
    p.pauseVideo();
    p.seekTo(Math.max(0, at), true);
    p.unMute();
    p.setVolume(this.volume);
  }

  play() {
    this.wantPlaying = true;
    this.player?.playVideo();
  }

  pause() {
    this.wantPlaying = false;
    this.player?.pauseVideo();
  }

  seek(t: number) {
    this.player?.seekTo(Math.max(0, t), true);
  }

  mediaTime(): number | null {
    if (!this.player || this.player.getPlayerState() !== PLAYING) return null;
    return this.player.getCurrentTime();
  }

  stalled(): boolean {
    if (!this.player || !this.wantPlaying) return false;
    const s = this.player.getPlayerState();
    return s === BUFFERING || s !== PLAYING;
  }

  setVolume(v: number) {
    this.volume = v;
    this.player?.setVolume(v);
  }

  duration(): number {
    return this.player?.getDuration() ?? 0;
  }

  title(): string {
    return this.player?.getVideoData?.()?.title ?? '';
  }

  destroy() {
    try {
      this.player?.destroy();
    } catch {
      /* ignore */
    }
    this.player = null;
    this.wrap.remove();
  }
}
