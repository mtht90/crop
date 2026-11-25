/**
 * スクラッチ散歩モード: watchPosition で位置を取り、Wake Lock で画面を消さない。
 * ブラウザは画面表示中しか位置を取れないので、閉じている間は外部ロガー連携を使う。
 */
import { pointsToCells, type Anchor, type CellHit, type GeoPoint } from '../../shared/cells';

export interface WalkCallbacks {
  onPosition(p: GeoPoint & { accuracy: number }): void;
  onHits(hits: CellHit[]): void;
  onError(message: string): void;
  onStateChange(active: boolean): void;
  exclude(): ((h3: string) => boolean) | undefined;
}

export class Walker {
  active = false;
  private watchId: number | null = null;
  private anchor: Anchor | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private simTimer: number | undefined;

  constructor(private cb: WalkCallbacks) {
    document.addEventListener('visibilitychange', () => {
      if (this.active && document.visibilityState === 'visible') void this.lock();
    });
  }

  async start() {
    if (this.active) return;
    this.active = true;
    this.anchor = null;
    this.cb.onStateChange(true);
    await this.lock();
    const sim = new URLSearchParams(location.search).get('simulate');
    if (sim !== null) {
      this.simulate();
      return;
    }
    if (!('geolocation' in navigator)) {
      this.cb.onError('この端末では位置情報が使えません');
      this.stop();
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) =>
        this.handle({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          t: pos.timestamp || Date.now(),
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          this.cb.onError('位置情報の利用が許可されていません。ブラウザの設定で許可してください。');
          this.stop();
        } else {
          this.cb.onError('位置情報を取得できませんでした。空が見える場所で再度お試しください。');
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    clearInterval(this.simTimer);
    this.active = false;
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    this.cb.onStateChange(false);
  }

  private handle(p: GeoPoint & { accuracy: number }) {
    this.cb.onPosition(p);
    const r = pointsToCells([p], { prev: this.anchor, exclude: this.cb.exclude() });
    this.anchor = r.last;
    if (r.hits.length) this.cb.onHits(r.hits);
  }

  private async lock() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => (this.wakeLock = null));
      }
    } catch {
      /* 電池残量が少ない等で拒否されることがある */
    }
  }

  /** 動作確認用: ?simulate を付けると地図の中心から東へ歩く（開発・デモ用） */
  private simulate() {
    const params = new URLSearchParams(location.search);
    const start = (window as any).__scratchStart as { lat: number; lng: number } | undefined;
    let lat = Number(params.get('lat') ?? start?.lat ?? 35.6812);
    let lng = Number(params.get('lng') ?? start?.lng ?? 139.7671);
    let heading = 0;
    const tick = () => {
      heading += (Math.random() - 0.5) * 0.6;
      const stepM = 25;
      lat += (stepM * Math.sin(heading)) / 111_320;
      lng += (stepM * Math.cos(heading)) / (111_320 * Math.cos((lat * Math.PI) / 180));
      this.handle({ lat, lng, accuracy: 8 + Math.random() * 10, t: Date.now() });
    };
    tick();
    this.simTimer = window.setInterval(tick, Number(params.get('simulate')) || 1000);
  }
}
