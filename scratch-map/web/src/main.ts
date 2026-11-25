import './style.css';
import { gridDisk } from 'h3-js';
import { zoneRingK } from '../../shared/cells';
import { api, setUnauthorizedHandler } from './api';
import { celebrate, unlockAudio } from './effects';
import { FogMap } from './map';
import { afterLogin, boot, computeDisplay, emit, excluder, homeZones, logout, onChange, recordHits, state, type ViewMode } from './state';
import { flush, loadGroup, scheduleFlush, setOthersNewCellsHandler } from './sync';
import { fmtArea, fmtNum, h, toast } from './ui/dom';
import { openGroups, openJoin, openLogin, openMembers, openSettings, openStats, type PanelCtx } from './ui/panels';
import { Walker } from './walk';

// ------------------------------------------------------------------ レイアウト
const app = document.getElementById('app')!;
const mapEl = h('div', { id: 'map' });
const groupBtn = h('button', { class: 'pill', id: 'groupBtn' });
const membersBtn = h('button', { class: 'pill icon', 'aria-label': 'メンバー', title: 'メンバー' }, '👥');
const settingsBtn = h('button', { class: 'pill icon', 'aria-label': '設定', title: '設定' }, '⚙️');
const modeBar = h('div', { class: 'segmented', role: 'tablist' });
const banner = h('div', { class: 'banner hidden' });
const statusLine = h('div', { class: 'status' });
const walkBtn = h('button', { class: 'walk-btn', id: 'walkBtn' });
const statsBtn = h('button', { class: 'round-btn', 'aria-label': '統計', title: '統計' }, '📊');
const locateBtn = h('button', { class: 'round-btn', 'aria-label': '現在地', title: '現在地' }, '◎');
const counter = h('div', { class: 'counter hidden' });

app.append(
  mapEl,
  h('header', { class: 'topbar' }, groupBtn, h('div', { class: 'grow' }), membersBtn, settingsBtn),
  h('div', { class: 'modebar' }, modeBar),
  banner,
  counter,
  h('footer', { class: 'bottombar' }, statusLine, h('div', { class: 'controls' }, statsBtn, walkBtn, locateBtn)),
);

const fogMap = new FogMap(mapEl);
let lastPos: { lat: number; lng: number; accuracy: number } | null = null;
let follow = true;
fogMap.map.on('dragstart', () => (follow = false));

// ------------------------------------------------------------------ パネル用コンテキスト
const ctx: PanelCtx = {
  mapCenter: () => fogMap.center(),
  lastPosition: () => lastPos,
  switchGroup: async (id) => {
    try {
      await loadGroup(id);
    } catch (e) {
      toast(`マップを開けませんでした: ${(e as Error).message}`, 'error');
      await loadGroup(null);
    }
  },
  afterAuth: async () => {
    await flush();
    let pendingInvite: string | null = null;
    try {
      pendingInvite = localStorage.getItem('scratch.pendingInvite');
    } catch {
      /* noop */
    }
    if (pendingInvite) {
      await openJoin(ctx, pendingInvite);
      return;
    }
    // 招待プレビュー中ならそのまま、そうでなければマイマップへ
    if (!state.view || state.view.viewer.isMember === false) {
      const inviteMatch = location.pathname.match(/^\/invite\/([A-Za-z0-9_-]+)/);
      if (inviteMatch) return void openJoin(ctx, inviteMatch[1]);
      await ctx.switchGroup(defaultGroupId());
    }
  },
  refreshZonesOnMap: () => drawZones(),
};

function defaultGroupId(): string | null {
  if (!state.me) return null;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('scratch.group');
  } catch {
    /* noop */
  }
  return state.me.groups.find((g) => g.id === saved)?.id ?? state.me.groups.find((g) => g.isPersonal)?.id ?? state.me.groups[0]?.id ?? null;
}

function drawZones() {
  fogMap.setZones(homeZones().map((z) => gridDisk(z.h3, zoneRingK(z.radiusM))));
}

// ------------------------------------------------------------------ 散歩モード
let counterTimer: number | undefined;
function bumpCounter(n: number) {
  counter.textContent = `+${n}`;
  counter.classList.remove('hidden', 'pop');
  void counter.offsetWidth;
  counter.classList.add('pop');
  clearTimeout(counterTimer);
  counterTimer = window.setTimeout(() => counter.classList.add('hidden'), 1400);
}

const walker = new Walker({
  exclude: () => excluder(),
  onPosition: (p) => {
    lastPos = { lat: p.lat, lng: p.lng, accuracy: p.accuracy };
    state.lastAccuracy = p.accuracy;
    fogMap.setMe(lastPos);
    if (follow) fogMap.follow(p.lat, p.lng);
    renderChrome();
  },
  onHits: async (hits) => {
    const { newForView } = await recordHits(hits);
    if (newForView.length) {
      state.walkNew += newForView.length;
      celebrate(newForView.length);
      fogMap.flash(newForView);
      bumpCounter(state.walkNew);
    }
    scheduleFlush();
  },
  onError: (m) => toast(m, 'error', 5000),
  onStateChange: (active) => {
    state.walking = active;
    renderChrome();
  },
});

walkBtn.addEventListener('click', async () => {
  if (walker.active) {
    walker.stop();
    toast(state.walkNew ? `おつかれさま！今回 ${state.walkNew} セル開拓しました` : '散歩を終了しました');
    void flush();
    return;
  }
  unlockAudio();
  state.walkNew = 0;
  follow = true;
  (window as any).__scratchStart = lastPos ?? fogMap.center();
  await walker.start();
});

locateBtn.addEventListener('click', () => {
  follow = true;
  if (lastPos) return fogMap.follow(lastPos.lat, lastPos.lng, true);
  navigator.geolocation?.getCurrentPosition(
    (pos) => {
      lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      fogMap.setMe(lastPos);
      fogMap.map.flyTo({ center: [lastPos.lng, lastPos.lat], zoom: Math.max(fogMap.map.getZoom(), 15) });
    },
    () => toast('現在地を取得できませんでした', 'error'),
    { enableHighAccuracy: true, timeout: 15000 },
  );
});

// ------------------------------------------------------------------ 他のメンバーの塗り
// 外部アプリのバッチが続けて届いても通知が溢れないよう、メンバーごとに数秒まとめる
const othersTally = new Map<string, { n: number; timer: number }>();
setOthersNewCellsHandler((cells, userId) => {
  const m = state.view?.members.find((x) => x.userId === userId);
  fogMap.flash(cells, m?.color);
  const cur = othersTally.get(userId);
  if (cur) clearTimeout(cur.timer);
  const n = (cur?.n ?? 0) + cells.length;
  const timer = window.setTimeout(() => {
    othersTally.delete(userId);
    toast(`${m?.displayName ?? 'メンバー'}さんが ${n} セル開拓！`, 'info', 2500);
  }, 2500);
  othersTally.set(userId, { n, timer });
});

// ------------------------------------------------------------------ 描画
onChange((kind) => {
  if (kind === 'cells') {
    const d = computeDisplay();
    state.displayed = new Set(d.fog);
    fogMap.render(d);
  }
  renderChrome();
});

const MODES: [ViewMode, string][] = [
  ['mine', '自分だけ'],
  ['all', 'グループ全体'],
  ['members', 'メンバー色分け'],
];

function renderChrome() {
  const v = state.view;
  groupBtn.textContent = v ? `${v.group.isPersonal ? '🧭 ' : '🗺️ '}${v.group.name} ▾` : '📱 この端末 ▾';
  membersBtn.classList.toggle('hidden', !v);

  // 表示モード（共同マップのときだけ）
  const showModes = !!v && !v.group.isPersonal;
  modeBar.parentElement!.classList.toggle('hidden', !showModes);
  if (showModes) {
    modeBar.replaceChildren(
      ...MODES.filter(([m]) => m !== 'mine' || v!.viewer.isMember).map(([m, label]) =>
        h(
          'button',
          {
            class: state.viewMode === m ? 'on' : '',
            role: 'tab',
            onclick: () => {
              state.viewMode = m;
              emit('cells');
            },
          },
          label,
        ),
      ),
    );
  }

  // 招待プレビューのバナー
  if (v && !v.viewer.isMember) {
    banner.classList.remove('hidden');
    banner.replaceChildren(
      h('span', null, `「${v.group.name}」を見ています`),
      h('button', { class: 'btn small primary', onclick: () => v.invite && openJoin(ctx, v.invite) }, '参加する'),
    );
  } else banner.classList.add('hidden');

  // ステータス
  const n = state.displayed.size;
  const parts: (Node | string)[] = [h('b', null, `${fmtNum(n)} セル`), h('span', { class: 'muted' }, ` · ${fmtArea(n)}`)];
  if (v) {
    const rt = state.realtime;
    parts.push(h('span', { class: `rt ${rt}`, title: rt === 'live' ? 'リアルタイム同期中' : '接続中…' }, rt === 'live' ? ' ● LIVE' : ' ○'));
  }
  if (!state.online) parts.push(h('span', { class: 'warn' }, ' · オフライン（後で同期）'));
  else if (state.me && state.pending.size) parts.push(h('span', { class: 'muted' }, ` · 未送信 ${state.pending.size}`));
  if (state.walking) {
    const acc = state.lastAccuracy;
    parts.push(
      h('span', { class: acc !== null && acc > 50 ? 'warn' : 'muted' }, acc === null ? ' · 測位中…' : ` · 誤差 ±${Math.round(acc)}m${acc > 50 ? '（精度不足）' : ''}`),
    );
  }
  statusLine.replaceChildren(...parts);

  walkBtn.classList.toggle('active', state.walking);
  walkBtn.replaceChildren(
    state.walking
      ? h('span', null, '■ 散歩を終える', h('small', null, `今回 +${state.walkNew} セル`))
      : h('span', null, '👣 スクラッチ散歩', h('small', null, '画面をつけたまま歩くと霧が晴れる')),
  );
}

groupBtn.addEventListener('click', () => openGroups(ctx));
membersBtn.addEventListener('click', () => openMembers(ctx));
settingsBtn.addEventListener('click', () => openSettings(ctx));
statsBtn.addEventListener('click', () => void openStats(ctx));

setUnauthorizedHandler(() => {
  void logout().then(() => toast('ログインの有効期限が切れました。もう一度ログインしてください', 'error'));
});

// ------------------------------------------------------------------ ルーティング
async function route() {
  const url = new URL(location.href);
  const magic = url.pathname === '/auth/magic' && url.searchParams.get('token');
  const invite = url.pathname.match(/^\/invite\/([A-Za-z0-9_-]+)/)?.[1];

  if (magic) {
    history.replaceState(null, '', '/');
    try {
      const r = await api<{ session: string }>('POST', '/api/auth/magic/verify', { token: magic });
      await afterLogin(r.session);
      toast('ログインしました', 'good');
      await ctx.afterAuth();
    } catch {
      toast('ログインリンクが無効か期限切れです。もう一度お試しください', 'error', 5000);
      openLogin(ctx);
    }
    return;
  }

  if (invite) {
    try {
      const inv = await api<{ group: { id: string }; alreadyMember: boolean }>('GET', `/api/invites/${invite}`);
      await loadGroup(inv.group.id, inv.alreadyMember ? null : invite);
      if (inv.alreadyMember) history.replaceState(null, '', '/');
      else await openJoin(ctx, invite);
    } catch {
      toast('招待リンクが無効か期限切れです', 'error', 5000);
      history.replaceState(null, '', '/');
      await ctx.switchGroup(defaultGroupId());
    }
    return;
  }

  await ctx.switchGroup(defaultGroupId());
}

window.addEventListener('popstate', () => void route());

// デバッグ・E2E テスト用（読み取り専用で使う）
(window as any).__scratch = { state, flush };

(async () => {
  renderChrome();
  await boot();
  drawZones();
  emit('cells');
  await route();
  void flush();
  setInterval(() => void flush(), 60_000);
})();

// ------------------------------------------------------------------ PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW registration failed', e));
  });
}
