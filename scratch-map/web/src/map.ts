/** MapLibre の地図と霧レイヤー */
import { AttributionControl, Map as MLMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// バンドル後もワーカーを読み込めるよう、ワーカーファイルをアセットとして出力して URL を渡す
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);
import { cellPolygons, fogFeature, visitedFeature } from './fog';
import type { Display } from './state';

/** 霧の雲テクスチャ（Onsemeliot「Cloudy skies」CC-BY 4.0 を加工。README 参照） */
const CLOUD_TEXTURE = '/textures/clouds.jpg';
const CLOUD_CREDIT = '雲: <a href="https://opengameart.org/content/cloudy-skies" target="_blank" rel="noopener">Onsemeliot</a> (CC-BY 4.0)';

const STYLE_URL = import.meta.env.VITE_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/liberty';
const VIEW_KEY = 'scratch.view';

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function circle(lng: number, lat: number, radiusM: number, n = 48): GeoJSON.Feature {
  const coords: number[][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

export class FogMap {
  readonly map: MLMap;
  readonly ready: Promise<void>;
  private pending: Display | null = null;
  private raf = 0;

  constructor(container: HTMLElement) {
    let saved: { center: [number, number]; zoom: number } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
    } catch {
      /* noop */
    }
    this.map = new MLMap({
      container,
      style: STYLE_URL,
      center: saved?.center ?? [139.7671, 35.6812],
      zoom: saved?.zoom ?? 14,
      attributionControl: false,
      maxPitch: 0,
    });
    this.map.addControl(new AttributionControl({ compact: true, customAttribution: CLOUD_CREDIT }), 'bottom-left');
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.on('moveend', () => {
      const c = this.map.getCenter();
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: this.map.getZoom() }));
      } catch {
        /* noop */
      }
    });
    this.ready = new Promise((resolve) => {
      this.map.on('load', async () => {
        try {
          const img = await this.map.loadImage(CLOUD_TEXTURE);
          this.map.addImage('clouds', img.data);
        } catch {
          /* 読み込めなければ単色の霧で表示 */
        }
        this.addLayers();
        // 帰属表示は最初は畳んでおく（ⓘ で開ける）
        container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
        resolve();
      });
    });
  }

  private addLayers() {
    const m = this.map;
    m.addSource('colored', { type: 'geojson', data: empty });
    m.addSource('fog', { type: 'geojson', data: fogFeature([]) });
    m.addSource('visited', { type: 'geojson', data: empty });
    m.addSource('flash', { type: 'geojson', data: empty });
    m.addSource('zones', { type: 'geojson', data: empty });
    m.addSource('me', { type: 'geojson', data: empty });
    m.addSource('me-acc', { type: 'geojson', data: empty });

    m.addLayer({
      id: 'colored',
      type: 'fill',
      source: 'colored',
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 },
    });
    // 霧: 雲の写真テクスチャで全世界を覆い、塗ったセルだけくり抜く
    const hasClouds = m.hasImage('clouds');
    m.addLayer({
      id: 'fog',
      type: 'fill',
      source: 'fog',
      paint: hasClouds
        ? { 'fill-pattern': 'clouds', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.9, 12, 0.97] }
        : { 'fill-color': '#0b1022', 'fill-opacity': 0.9 },
    });
    // 雲の縁: 白くぼかした線を重ねて、晴れ間の境目をふわっとさせる
    m.addLayer({
      id: 'cloud-edge-outer',
      type: 'line',
      source: 'visited',
      paint: {
        'line-color': '#f1f5f9',
        'line-width': ['interpolate', ['exponential', 2], ['zoom'], 10, 2, 14, 14, 18, 120],
        'line-blur': ['interpolate', ['exponential', 2], ['zoom'], 10, 2, 14, 14, 18, 120],
        'line-opacity': 0.55,
      },
    });
    m.addLayer({
      id: 'visited-edge',
      type: 'line',
      source: 'visited',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['exponential', 2], ['zoom'], 10, 0.5, 14, 4, 18, 40],
        'line-blur': ['interpolate', ['exponential', 2], ['zoom'], 10, 0.5, 14, 4, 18, 40],
        'line-opacity': 0.8,
      },
    });
    m.addLayer({
      id: 'zones',
      type: 'line',
      source: 'zones',
      paint: { 'line-color': '#fbbf24', 'line-width': 2, 'line-dasharray': [2, 2] },
    });
    m.addLayer({
      id: 'flash',
      type: 'fill',
      source: 'flash',
      paint: { 'fill-color': ['coalesce', ['get', 'color'], '#fde68a'], 'fill-opacity': 0 },
    });
    m.addLayer({
      id: 'me-acc',
      type: 'fill',
      source: 'me-acc',
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 },
    });
    m.addLayer({
      id: 'me',
      type: 'circle',
      source: 'me',
      paint: {
        'circle-radius': 7,
        'circle-color': '#3b82f6',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
      },
    });
  }

  /** 描画は rAF でまとめる（連続更新でも cellsToMultiPolygon を1フレーム1回に抑える） */
  render(d: Display) {
    this.pending = d;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      void this.ready.then(() => this.draw());
    });
  }

  private draw() {
    const d = this.pending;
    if (!d) return;
    this.pending = null;
    (this.map.getSource('fog') as GeoJSONSource).setData(fogFeature(d.fog));
    (this.map.getSource('visited') as GeoJSONSource).setData(visitedFeature(d.fog));
    (this.map.getSource('colored') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: (d.colored ?? []).map((c) => visitedFeature(c.cells, { color: c.color })),
    });
  }

  /** 新しく塗ったセルを光らせる */
  flash(cells: string[], color?: string) {
    if (!cells.length) return;
    void this.ready.then(() => {
      const fc = cellPolygons(cells);
      if (color) for (const f of fc.features) f.properties = { ...f.properties, color };
      (this.map.getSource('flash') as GeoJSONSource).setData(fc);
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / 1200);
        this.map.setPaintProperty('flash', 'fill-opacity', 0.85 * (1 - k));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  setMe(pos: { lat: number; lng: number; accuracy: number } | null) {
    void this.ready.then(() => {
      (this.map.getSource('me') as GeoJSONSource).setData(
        pos ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] } } : empty,
      );
      (this.map.getSource('me-acc') as GeoJSONSource).setData(pos ? circle(pos.lng, pos.lat, pos.accuracy) : empty);
    });
  }

  setZones(cellsByZone: string[][]) {
    void this.ready.then(() => {
      (this.map.getSource('zones') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: cellsByZone.map((cells) => visitedFeature(cells)),
      });
    });
  }

  /** 現在地に追従。アニメーション中や画面中央付近にいる間は動かさない（負荷を抑える） */
  follow(lat: number, lng: number, force = false) {
    if (!force && this.map.isMoving()) return;
    if (!force) {
      const p = this.map.project([lng, lat]);
      const { clientWidth: w, clientHeight: hgt } = this.map.getContainer();
      if (Math.abs(p.x - w / 2) < w * 0.15 && Math.abs(p.y - hgt / 2) < hgt * 0.15) return;
    }
    this.map.easeTo({ center: [lng, lat], duration: 600 });
  }

  center(): { lat: number; lng: number } {
    const c = this.map.getCenter();
    return { lat: c.lat, lng: c.lng };
  }
}
