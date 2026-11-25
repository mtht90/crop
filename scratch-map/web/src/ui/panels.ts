/** 各種シート（ログイン・マップ一覧・メンバー・設定・統計・招待） */
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { gridDisk, latLngToCell } from 'h3-js';
import { CELL_RES, makeZoneExcluder, zoneRingK, type HomeZone } from '../../../shared/cells';
import { api, ApiError, type Member, type Stats } from '../api';
import * as local from '../localdb';
import { afterLogin, emit, logout, refreshMe, state } from '../state';
import { loadGroup } from '../sync';
import { soundSetting } from '../effects';
import { closeAllSheets, copyText, fmtArea, fmtNum, h, openSheet, toast } from './dom';

export interface PanelCtx {
  mapCenter(): { lat: number; lng: number };
  lastPosition(): { lat: number; lng: number } | null;
  switchGroup(id: string | null): Promise<void>;
  afterAuth(): Promise<void>;
  refreshZonesOnMap(): void;
}

const errMsg = (e: unknown) => {
  const m = e instanceof ApiError ? e.message : (e as Error)?.message ?? String(e);
  const map: Record<string, string> = {
    invalid_email: 'メールアドレスの形式が正しくありません',
    too_many_requests: '短時間に送りすぎです。少し待ってからお試しください',
    invalid_or_expired: 'リンクの有効期限が切れたか、すでに使われています',
    invite_invalid: '招待リンクが無効か、期限切れです',
    unknown_passkey: 'このパスキーは登録されていません',
    login_required: 'ログインが必要です',
    forbidden: 'このマップを見る権限がありません',
  };
  return map[m] ?? m;
};

// ================================================================== ログイン
export function openLogin(ctx: PanelCtx, reason?: string) {
  const email = h('input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'email', required: true, class: 'input' });
  const status = h('div', { class: 'muted small' });
  const sendBtn = h('button', { class: 'btn primary', type: 'submit' }, 'ログインリンクを送る');
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        sendBtn.disabled = true;
        status.textContent = '送信中…';
        try {
          const r = await api<{ sent: boolean; devLink?: string }>('POST', '/api/auth/magic/request', { email: email.value });
          status.replaceChildren(h('p', null, `${email.value} にログイン用のリンクを送りました。メールを開いてリンクをタップしてください。`));
          if (r.devLink) {
            // 開発モード: メールの代わりに画面にリンクを出す（今のオリジンに合わせる）
            const u = new URL(r.devLink);
            const link = `${location.origin}${u.pathname}${u.search}`;
            status.append(h('p', null, h('a', { href: link, class: 'btn ghost' }, '（開発モード）このリンクでログイン')));
          }
        } catch (err) {
          status.textContent = errMsg(err);
        } finally {
          sendBtn.disabled = false;
        }
      },
    },
    h('label', { class: 'label' }, 'メールアドレスでログイン / 新規登録', email),
    sendBtn,
    status,
  );

  const pkSupported = browserSupportsWebAuthn();
  const pkLogin = h(
    'button',
    {
      class: 'btn',
      disabled: !pkSupported,
      onclick: async () => {
        try {
          const { challengeId, options } = await api('POST', '/api/auth/passkey/login/options');
          const response = await startAuthentication({ optionsJSON: options });
          const r = await api<{ session: string }>('POST', '/api/auth/passkey/login/verify', { challengeId, response });
          await afterLogin(r.session);
          close();
          toast('ログインしました', 'good');
          await ctx.afterAuth();
        } catch (err) {
          if ((err as Error).name !== 'NotAllowedError') toast(errMsg(err), 'error');
        }
      },
    },
    '🔑 パスキーでログイン',
  );
  const pkName = h('input', { class: 'input', placeholder: '表示名（例: たろう）', maxlength: 30 });
  const pkRegister = h(
    'button',
    {
      class: 'btn ghost',
      disabled: !pkSupported,
      onclick: async () => {
        const displayName = pkName.value.trim();
        if (!displayName) {
          pkName.focus();
          toast('表示名を入力してください');
          return;
        }
        try {
          const { challengeId, options } = await api('POST', '/api/auth/passkey/register/options', { displayName });
          const response = await startRegistration({ optionsJSON: options });
          const r = await api<{ session: string }>('POST', '/api/auth/passkey/register/verify', { challengeId, response, displayName });
          await afterLogin(r.session);
          close();
          toast('アカウントを作成しました', 'good');
          await ctx.afterAuth();
        } catch (err) {
          if ((err as Error).name !== 'NotAllowedError') toast(errMsg(err), 'error');
        }
      },
    },
    'パスキーで新規登録',
  );

  const close = openSheet(
    'ログイン',
    h(
      'div',
      { class: 'stack' },
      reason ? h('p', { class: 'notice' }, reason) : null,
      form,
      h('div', { class: 'divider' }, 'または'),
      pkLogin,
      h('details', null, h('summary', null, 'パスキーで新しく始める'), h('div', { class: 'stack', style: 'margin-top:8px' }, pkName, pkRegister)),
      !pkSupported ? h('p', { class: 'muted small' }, 'このブラウザはパスキーに対応していません') : null,
      h('p', { class: 'muted small' }, 'ログインしなくても「この端末」に記録できます。ログインすると記録が同期され、友達と共同マップを塗れます。'),
    ),
  );
}

// ================================================================== マップ一覧
export function openGroups(ctx: PanelCtx) {
  const list = h('div', { class: 'list' });
  if (!state.me) {
    list.append(
      h('div', { class: 'row active' }, h('div', null, h('b', null, '📱 この端末'), h('div', { class: 'muted small' }, `${fmtNum(state.localCells.size)} セル`))),
    );
  } else {
    for (const g of state.me.groups) {
      list.append(
        h(
          'button',
          {
            class: `row ${g.id === state.currentGroupId ? 'active' : ''}`,
            onclick: async () => {
              close();
              await ctx.switchGroup(g.id);
            },
          },
          h('span', { class: 'dot', style: `background:${g.color}` }),
          h(
            'div',
            { class: 'grow' },
            h('b', null, g.isPersonal ? '🧭 ' + g.name : g.name),
            h('div', { class: 'muted small' }, `${fmtNum(g.cellCount)} セル · ${g.isPersonal ? '自分だけ' : `${g.memberCount}人`}${!g.isPersonal && !g.shareEnabled ? ' · 反映オフ' : ''}`),
          ),
        ),
      );
    }
  }

  const name = h('input', { class: 'input', placeholder: '新しい共同マップの名前', maxlength: 40 });
  const create = h(
    'form',
    {
      class: 'inline',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        if (!state.me) return openLogin(ctx, '共同マップを作るにはログインしてください');
        if (!name.value.trim()) return;
        try {
          const r = await api<{ group: { id: string } }>('POST', '/api/groups', { name: name.value });
          await refreshMe();
          close();
          await ctx.switchGroup(r.group.id);
          openMembers(ctx, { promptInvite: true });
        } catch (err) {
          toast(errMsg(err), 'error');
        }
      },
    },
    name,
    h('button', { class: 'btn primary', type: 'submit' }, '作成'),
  );

  const inviteInput = h('input', { class: 'input', placeholder: '招待リンクを貼り付け' });
  const join = h(
    'form',
    {
      class: 'inline',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const m = inviteInput.value.match(/invite\/([A-Za-z0-9_-]+)/) ?? inviteInput.value.trim().match(/^([A-Za-z0-9_-]{10,})$/);
        if (!m) return toast('招待リンクの形式が正しくありません', 'error');
        close();
        history.pushState(null, '', `/invite/${m[1]}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      },
    },
    inviteInput,
    h('button', { class: 'btn', type: 'submit' }, '開く'),
  );

  const close = openSheet(
    'マップ',
    h(
      'div',
      { class: 'stack' },
      list,
      h('h3', null, '共同マップを作る'),
      create,
      h('h3', null, '招待されたマップに参加'),
      join,
      !state.me ? h('button', { class: 'btn primary', onclick: () => (close(), openLogin(ctx)) }, 'ログインして同期する') : null,
    ),
  );
}

// ================================================================== メンバー・グループ設定
const PALETTE = ['#ff5a5f', '#3b82f6', '#22c55e', '#ffb400', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'];

export function openMembers(ctx: PanelCtx, opts: { promptInvite?: boolean } = {}) {
  const v = state.view;
  if (!v) return;
  const uid = state.me?.user.id;
  const mine = v.members.find((m) => m.userId === uid);
  const isOwner = v.group.ownerId === uid;
  const counts = new Map<string, number>();
  for (const t of state.groupCells.values()) if (t[1]) counts.set(t[1], (counts.get(t[1]) ?? 0) + 1);

  const members = h(
    'div',
    { class: 'list' },
    v.members.map((m: Member) =>
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'dot', style: `background:${m.color}` }),
        h('div', { class: 'grow' }, h('b', null, m.displayName, m.userId === uid ? '（あなた）' : ''), m.role === 'owner' ? h('span', { class: 'chip' }, 'オーナー') : null),
        h('span', { class: 'muted small' }, `${fmtNum(counts.get(m.userId) ?? 0)} 開拓`),
      ),
    ),
  );

  const body = h('div', { class: 'stack' });
  if (isOwner && !v.group.isPersonal) {
    const nameInput = h('input', { class: 'input', value: v.group.name, maxlength: 40 });
    body.append(
      h(
        'form',
        {
          class: 'inline',
          onsubmit: async (e: Event) => {
            e.preventDefault();
            await api('PATCH', `/api/groups/${v.group.id}`, { name: nameInput.value }).catch((err) => toast(errMsg(err), 'error'));
            await refreshMe();
            toast('名前を変更しました', 'good');
          },
        },
        nameInput,
        h('button', { class: 'btn', type: 'submit' }, '変更'),
      ),
    );
  }
  body.append(h('h3', null, `メンバー（${v.members.length}人）`), members);

  if (mine) {
    const swatches = h(
      'div',
      { class: 'swatches' },
      PALETTE.map((c) =>
        h('button', {
          class: `swatch ${c === mine.color ? 'on' : ''}`,
          style: `background:${c}`,
          'aria-label': c,
          onclick: async () => {
            await api('PATCH', `/api/groups/${v.group.id}/members/me`, { color: c }).catch((err) => toast(errMsg(err), 'error'));
            mine.color = c;
            swatches.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', (s as HTMLElement).getAttribute('aria-label') === c));
            emit('cells');
          },
        }),
      ),
    );
    body.append(h('h3', null, 'あなたの色'), swatches);

    if (!v.group.isPersonal) {
      const share = h('input', { type: 'checkbox', checked: mine.shareEnabled });
      share.addEventListener('change', async () => {
        try {
          await api('PATCH', `/api/groups/${v.group.id}/members/me`, { shareEnabled: share.checked });
          mine.shareEnabled = share.checked;
          await refreshMe();
          emit('cells');
        } catch (err) {
          share.checked = !share.checked;
          toast(errMsg(err), 'error');
        }
      });
      body.append(
        h('label', { class: 'toggle' }, share, h('span', null, '自分の足跡（散歩・外部アプリ）をこのマップに反映する')),
        h('p', { class: 'muted small' }, 'オフにすると、この共同マップには新しい足跡が送られません（マイマップには記録されます）。'),
      );

      // 招待
      const inviteOut = h('div', { class: 'stack' });
      const makeInvite = async () => {
        try {
          const r = await api<{ url: string }>('POST', `/api/groups/${v.group.id}/invites`);
          inviteOut.replaceChildren(
            h('input', { class: 'input mono', value: r.url, readonly: true, onclick: (e: Event) => (e.target as HTMLInputElement).select() }),
            h(
              'div',
              { class: 'inline' },
              h('button', { class: 'btn', onclick: () => copyText(r.url) }, 'コピー'),
              'share' in navigator
                ? h('button', { class: 'btn primary', onclick: () => navigator.share({ title: v.group.name, text: `「${v.group.name}」を一緒に塗ろう`, url: r.url }).catch(() => {}) }, '共有…')
                : null,
            ),
            h('p', { class: 'muted small' }, 'リンクは30日間有効です。受け取った人はログイン前でも地図を見られます。'),
          );
        } catch (err) {
          toast(errMsg(err), 'error');
        }
      };
      body.append(h('h3', null, '友達を招待'), inviteOut);
      inviteOut.append(h('button', { class: 'btn primary', onclick: makeInvite }, '招待リンクを作る'));
      if (opts.promptInvite) void makeInvite();

      // 退出
      const purge = h('input', { type: 'checkbox' });
      body.append(
        h('h3', null, '退出'),
        h('label', { class: 'toggle' }, purge, h('span', null, '自分が塗った記録もこのマップから消す')),
        h(
          'button',
          {
            class: 'btn danger',
            onclick: async () => {
              const msg = purge.checked
                ? `「${v.group.name}」から退出し、あなたの記録を消します。元に戻せません。よろしいですか？`
                : `「${v.group.name}」から退出します。あなたが塗った場所は残ります。よろしいですか？`;
              if (!confirm(msg)) return;
              try {
                await api('DELETE', `/api/groups/${v.group.id}/members/me?purge=${purge.checked ? 1 : 0}`);
                await refreshMe();
                closeAllSheets();
                toast('退出しました');
                await ctx.switchGroup(state.me?.groups.find((g) => g.isPersonal)?.id ?? null);
              } catch (err) {
                toast(errMsg(err), 'error');
              }
            },
          },
          'このマップから退出',
        ),
      );
    }
  } else if (!state.me) {
    body.append(h('button', { class: 'btn primary', onclick: () => openLogin(ctx) }, 'ログインして参加する'));
  }

  openSheet(v.group.isPersonal ? 'マイマップ' : v.group.name, body);
}

// ================================================================== 統計
function weekStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 月曜始まり
  d.setDate(d.getDate() - day);
  return d;
}

export async function openStats(_ctx: PanelCtx) {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, '読み込み中…'));
  openSheet('統計', body);
  if (!state.view) {
    const n = new Set([...state.localCells, ...state.pending]).size;
    body.replaceChildren(
      h('div', { class: 'stat-grid' }, statTile('塗ったセル', fmtNum(n), fmtArea(n))),
      h('p', { class: 'muted small' }, 'ログインすると、共同マップの統計（メンバー別の貢献や今週の新規開拓数）が見られます。'),
    );
    return;
  }
  try {
    const s = await api<Stats>('GET', `/api/groups/${state.view.group.id}/stats?since=${encodeURIComponent(weekStart().toISOString())}`, undefined, {
      invite: state.view.invite,
    });
    const max = Math.max(1, ...s.members.map((m) => m.pioneered));
    body.replaceChildren(
      h(
        'div',
        { class: 'stat-grid' },
        statTile('総セル数', fmtNum(s.totalCells), fmtArea(s.totalCells)),
        statTile('今週の新規開拓', `+${fmtNum(s.newSince)}`, '月曜 0:00 から'),
      ),
      h('h3', null, 'メンバー別の貢献'),
      h(
        'div',
        { class: 'bars' },
        s.members.map((m) =>
          h(
            'div',
            { class: 'bar-row' },
            h('div', { class: 'bar-label' }, h('span', { class: 'dot', style: `background:${m.color}` }), m.displayName),
            h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${(m.pioneered / max) * 100}%;background:${m.color}` })),
            h('div', { class: 'bar-num' }, fmtNum(m.pioneered), m.newSince ? h('span', { class: 'muted small' }, ` (+${m.newSince})`) : null),
          ),
        ),
      ),
      h('p', { class: 'muted small' }, '数値は「最初に塗った（開拓した）セル数」。括弧内は今週の新規。'),
      h(
        'table',
        { class: 'table' },
        h('tr', null, h('th', null, 'メンバー'), h('th', null, '開拓'), h('th', null, '訪問')),
        s.members.map((m) => h('tr', null, h('td', null, m.displayName), h('td', null, fmtNum(m.pioneered)), h('td', null, fmtNum(m.visited)))),
        s.formerMembersPioneered ? h('tr', null, h('td', { class: 'muted' }, '退出したメンバー'), h('td', null, fmtNum(s.formerMembersPioneered)), h('td', null, '-')) : null,
      ),
    );
  } catch (err) {
    body.replaceChildren(h('p', null, errMsg(err)));
  }
}

function statTile(label: string, value: string, sub: string) {
  return h('div', { class: 'stat' }, h('div', { class: 'muted small' }, label), h('div', { class: 'stat-value' }, value), h('div', { class: 'muted small' }, sub));
}

// ================================================================== 設定
export function openSettings(ctx: PanelCtx) {
  const body = h('div', { class: 'stack' });
  const close = openSheet('設定', body);
  const render = () => {
    body.replaceChildren(
      ...(state.me ? accountSection(ctx, render) : [h('button', { class: 'btn primary', onclick: () => (close(), openLogin(ctx)) }, 'ログイン / 新規登録')]),
      soundSection(),
      ...homeZoneSection(ctx, render),
      ...(state.me ? integrationSection(render) as Node[] : [h('h3', null, '外部アプリ連携'), h('p', { class: 'muted small' }, 'ログインすると、アプリを閉じている間の移動も GPS ロガーアプリ経由で塗れます。')]),
      h('h3', null, 'プライバシー'),
      h(
        'p',
        { class: 'muted small' },
        '位置は端末内で約 0.015km² の六角形セル（H3 解像度10）に変換してから送信します。正確な緯度経度はサーバーに保存されません。外部アプリから届いた座標もサーバーで即座にセルに変換して破棄します。',
      ),
      state.me
        ? h(
            'button',
            {
              class: 'btn danger ghost',
              onclick: async () => {
                await logout();
                close();
                await ctx.switchGroup(null);
                toast('ログアウトしました');
              },
            },
            'ログアウト',
          )
        : '',
    );
  };
  render();
}

function accountSection(_ctx: PanelCtx, rerender: () => void): Node[] {
  const me = state.me!;
  const name = h('input', { class: 'input', value: me.user.displayName, maxlength: 30 });
  return [
    h('h3', null, 'アカウント'),
    h(
      'form',
      {
        class: 'inline',
        onsubmit: async (e: Event) => {
          e.preventDefault();
          await api('PATCH', '/api/me', { displayName: name.value }).catch((err) => toast(errMsg(err), 'error'));
          await refreshMe();
          toast('表示名を変更しました', 'good');
        },
      },
      name,
      h('button', { class: 'btn', type: 'submit' }, '変更'),
    ),
    me.user.email ? h('p', { class: 'muted small' }, `メール: ${me.user.email}`) : null,
    h(
      'div',
      { class: 'inline' },
      h('span', { class: 'muted small grow' }, `パスキー: ${me.passkeyCount}件`),
      h(
        'button',
        {
          class: 'btn',
          disabled: !browserSupportsWebAuthn(),
          onclick: async () => {
            try {
              const { challengeId, options } = await api('POST', '/api/auth/passkey/register/options', {});
              const response = await startRegistration({ optionsJSON: options });
              await api('POST', '/api/auth/passkey/register/verify', { challengeId, response });
              await refreshMe();
              toast('パスキーを追加しました', 'good');
              rerender();
            } catch (err) {
              if ((err as Error).name !== 'NotAllowedError') toast(errMsg(err), 'error');
            }
          },
        },
        '🔑 パスキーを追加',
      ),
    ),
    h('p', { class: 'muted small' }, 'ホーム画面に追加したアプリではメールのリンクが別ブラウザで開くことがあります。パスキーを登録しておくとアプリ内で直接ログインできます。'),
  ].filter(Boolean) as Node[];
}

function soundSection(): Node {
  const cb = h('input', { type: 'checkbox', checked: soundSetting.get() });
  cb.addEventListener('change', () => soundSetting.set(cb.checked));
  return h('div', null, h('h3', null, '演出'), h('label', { class: 'toggle' }, cb, h('span', null, '新しいセルを塗ったら音を鳴らす（Android では振動も）')));
}

// ------------------------------------------------------------------ 自宅ゾーン
function homeZoneSection(ctx: PanelCtx, rerender: () => void): Node[] {
  const zones: (HomeZone & { id?: string; label?: string })[] = state.me ? state.me.homeZones : state.localZones;
  const radius = h(
    'select',
    { class: 'input' },
    [100, 200, 300, 500, 1000].map((r) => h('option', { value: r, selected: r === 200 }, `半径 ${r}m`)),
  );
  const purge = h('input', { type: 'checkbox', checked: true });

  const add = async (pos: { lat: number; lng: number } | null) => {
    if (!pos) return toast('現在地がまだ取得できていません', 'error');
    const zone = { h3: latLngToCell(pos.lat, pos.lng, CELL_RES), radiusM: Number(radius.value) };
    try {
      if (state.me) {
        await api('POST', '/api/home-zones', { ...zone, purge: purge.checked });
        await refreshMe();
      } else {
        state.localZones = [...state.localZones, zone];
        await local.kvSet('localZones', state.localZones);
      }
      if (purge.checked) {
        const ex = makeZoneExcluder([zone])!;
        await local.purgeLocal(ex);
        state.localCells = new Set(await local.loadLocalCells());
        state.pending = new Set(await local.outboxCells());
      }
      ctx.refreshZonesOnMap();
      emit('cells');
      toast('自宅ゾーンを設定しました。この範囲は記録されません', 'good');
      rerender();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const remove = async (i: number) => {
    const z = zones[i];
    if (!confirm('この自宅ゾーンを解除しますか？以後この範囲も記録されるようになります。')) return;
    if (state.me && z.id) {
      await api('DELETE', `/api/home-zones/${z.id}`).catch((err) => toast(errMsg(err), 'error'));
      await refreshMe();
    } else {
      state.localZones = state.localZones.filter((_, j) => j !== i);
      await local.kvSet('localZones', state.localZones);
    }
    ctx.refreshZonesOnMap();
    rerender();
  };

  return [
    h('h3', null, '自宅ゾーン'),
    h('p', { class: 'muted small' }, '設定した範囲のセルは記録しません（自宅の場所が友達に分からないように）。地図上では黄色の点線で表示されます（自分にだけ見えます）。'),
    h(
      'div',
      { class: 'list' },
      zones.length
        ? zones.map((z, i) =>
            h(
              'div',
              { class: 'row' },
              h('span', null, '🏠'),
              h('div', { class: 'grow' }, h('b', null, z.label ?? '自宅'), h('div', { class: 'muted small' }, `半径 ${z.radiusM}m（約 ${gridDisk(z.h3, zoneRingK(z.radiusM)).length} セル）`)),
              h('button', { class: 'btn small', onclick: () => remove(i) }, '解除'),
            ),
          )
        : h('div', { class: 'muted small' }, 'まだ設定されていません'),
    ),
    radius,
    h('label', { class: 'toggle' }, purge, h('span', null, '既存の記録からもこの範囲を消す')),
    h(
      'div',
      { class: 'inline' },
      h('button', { class: 'btn', onclick: () => add(ctx.lastPosition()) }, '📍 現在地を自宅ゾーンに'),
      h('button', { class: 'btn', onclick: () => add(ctx.mapCenter()) }, '✛ 地図の中心を自宅ゾーンに'),
    ),
  ];
}

// ------------------------------------------------------------------ 外部アプリ連携
function integrationSection(rerender: () => void): (Node | string)[] {
  const info = state.me!.ingest;
  const out = h('div', { class: 'stack' });

  const issue = async () => {
    if (info && !confirm('連携用URLを再発行すると、今までのURLは使えなくなります。よろしいですか？')) return;
    try {
      const r = await api<{ token: string; overlandUrl: string; owntracksUrl: string; overlandSetupLink: string }>('POST', '/api/ingest-token');
      await refreshMe();
      out.replaceChildren(...integrationDetails(r));
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const revoke = async () => {
    if (!confirm('外部アプリ連携を停止しますか？（URL が無効になります）')) return;
    await api('DELETE', '/api/ingest-token').catch((err) => toast(errMsg(err), 'error'));
    await refreshMe();
    rerender();
  };

  return [
    h('h3', null, '外部アプリ連携（アプリを閉じている間も塗る）'),
    h(
      'p',
      { class: 'muted small' },
      'ブラウザは画面が表示されている間しか位置を取れません。Overland（iOS）や OwnTracks（iOS / Android）を入れておくと、バックグラウンドの移動もサーバーで塗られます。受信した足跡は「反映オン」の全マップに反映されます。',
    ),
    info
      ? h(
          'p',
          { class: 'small' },
          `✅ 連携中（発行: ${new Date(info.createdAt).toLocaleDateString('ja-JP')}、最終受信: ${info.lastUsedAt ? new Date(info.lastUsedAt).toLocaleString('ja-JP') : 'まだありません'}）`,
        )
      : '',
    h(
      'p',
      { class: 'muted small' },
      'セキュリティのため URL は発行した時だけ表示されます。もう一度設定したいときは再発行してください。',
    ),
    h('div', { class: 'inline' }, h('button', { class: 'btn primary', onclick: issue }, info ? '連携用URLを再発行' : '連携用URLを発行'), info ? h('button', { class: 'btn ghost', onclick: revoke }, '連携を停止') : null),
    out,
  ];
}

function integrationDetails(r: { overlandUrl: string; owntracksUrl: string; overlandSetupLink: string }): Node[] {
  return [
    h('h4', null, 'Overland（iOS）'),
    h('a', { class: 'btn primary', href: r.overlandSetupLink }, '📲 Overland にワンタップで設定'),
    h(
      'ol',
      { class: 'small' },
      h('li', null, 'App Store で「Overland GPS Tracker」をインストール'),
      h('li', null, 'この画面に戻り、上のボタンをタップ（Overland が開き、受信URLが自動設定されます）'),
      h('li', null, 'Overland で「Tracking」をオンにし、位置情報を「常に許可」にする'),
      h('li', null, '設定の目安: Desired Accuracy「Best」/ Points per Batch「50」程度'),
    ),
    h('label', { class: 'label' }, '受信URL（手動設定用）', urlField(r.overlandUrl)),
    h('h4', null, 'OwnTracks（iOS / Android）'),
    h(
      'ol',
      { class: 'small' },
      h('li', null, 'OwnTracks をインストールして開く'),
      h('li', null, '設定 → 接続（Connection）→ モードを「HTTP」にする'),
      h('li', null, 'URL（Host）に下の受信URLを貼り付ける（ユーザー名・パスワードは空でOK）'),
      h('li', null, '位置情報を「常に許可」にし、モニタリングモードを「Move（移動）」にすると細かく記録されます'),
    ),
    h('label', { class: 'label' }, '受信URL', urlField(r.owntracksUrl)),
    h('p', { class: 'muted small' }, '誤差 50m を超える点は捨てます。自宅ゾーン内の点も記録しません。URL は他人に教えないでください（あなたとして記録されます）。'),
  ];
}

function urlField(url: string) {
  return h(
    'div',
    { class: 'inline' },
    h('input', { class: 'input mono', value: url, readonly: true, onclick: (e: Event) => (e.target as HTMLInputElement).select() }),
    h('button', { class: 'btn', type: 'button', onclick: () => copyText(url) }, 'コピー'),
  );
}

// ================================================================== 招待からの参加
export async function openJoin(ctx: PanelCtx, token: string) {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, '読み込み中…'));
  const close = openSheet('共同マップへの招待', body);
  try {
    const inv = await api<{ group: { id: string; name: string }; members: Member[]; alreadyMember: boolean }>('GET', `/api/invites/${token}`);
    if (inv.alreadyMember) {
      close();
      try {
        localStorage.removeItem('scratch.pendingInvite');
      } catch {
        /* noop */
      }
      await ctx.switchGroup(inv.group.id);
      return;
    }
    const bring = h('input', { type: 'checkbox', checked: true });
    body.replaceChildren(
      h('p', null, h('b', null, `「${inv.group.name}」`), 'に招待されています。'),
      h('div', { class: 'list' }, inv.members.map((m) => h('div', { class: 'row' }, h('span', { class: 'dot', style: `background:${m.color}` }), m.displayName))),
      state.me ? h('label', { class: 'toggle' }, bring, h('span', null, 'マイマップのこれまでの足跡もこのマップに持ち込む')) : '',
      h(
        'button',
        {
          class: 'btn primary',
          onclick: async () => {
            if (!state.me) {
              try {
                localStorage.setItem('scratch.pendingInvite', token);
              } catch {
                /* noop */
              }
              close();
              openLogin(ctx, `ログインすると「${inv.group.name}」に参加できます`);
              return;
            }
            try {
              await api('POST', `/api/invites/${token}/join`, { bringHistory: bring.checked });
              try {
                localStorage.removeItem('scratch.pendingInvite');
              } catch {
                /* noop */
              }
              await refreshMe();
              close();
              history.replaceState(null, '', '/');
              await ctx.switchGroup(inv.group.id);
              toast(`「${inv.group.name}」に参加しました！`, 'good');
            } catch (err) {
              toast(errMsg(err), 'error');
            }
          },
        },
        state.me ? '参加する' : 'ログインして参加する',
      ),
      h('button', { class: 'btn ghost', onclick: close }, 'まずは地図を見る'),
    );
  } catch (err) {
    body.replaceChildren(h('p', null, errMsg(err)));
  }
}
