import type { SaveData, Settings } from '../core/save';
import { SPOTS } from '../data/spots';
import { LINE_BY_ID, LINES, LURES, REEL_BY_ID, REELS, RODS, ROD_BY_ID, LB_TO_KG } from '../data/tackle';
import { h } from './dom';
import type { Modals } from './modal';

export function openTackle(modals: Modals, save: SaveData, onChange: () => void): void {
  const m = modals.open('タックルボックス', { closeKey: 'KeyI' });
  const render = () => {
    const col = (title: string, rows: HTMLElement[]) => h('div', null, h('h4', { text: title }), h('div', { class: 'list' }, ...rows));
    const pick = (on: boolean, name: string, spec: string, apply: () => void, disabled = false) =>
      h(
        'div',
        { class: `item${on ? ' on' : ''}` },
        h('div', null, h('div', { class: 'name', text: name }), h('div', { class: 'spec', text: spec })),
        h('span'),
        on ? h('span', { class: 'muted small', text: '装備中' }) : h('button', { text: '装備', disabled, onclick: () => (apply(), onChange(), render()) }),
      );
    const e = save.equip;
    const rods = RODS.filter((r) => save.owned.rods.includes(r.id)).map((r) => pick(e.rod === r.id, r.name, `飛距離${r.cast}m・パワー${r.power}kg・感度${r.sensitivity}`, () => (e.rod = r.id)));
    const reels = REELS.filter((r) => save.owned.reels.includes(r.id)).map((r) => pick(e.reel === r.id, r.name, `ドラグ${r.dragMax}kg・巻取${r.speed}m/s・${r.capacity}m`, () => ((e.reel = r.id), (save.drag = Math.min(save.drag, r.dragMax)))));
    const lines = LINES.filter((l) => save.owned.lines.includes(l.id)).map((l) => pick(e.line === l.id, l.name, `強度${(l.lb * LB_TO_KG).toFixed(1)}kg`, () => (e.line = l.id)));
    const lures = LURES.filter((l) => (save.owned.lures[l.id] ?? 0) > 0 || e.lure === l.id).map((l) => pick(e.lure === l.id, `${l.name} ×${save.owned.lures[l.id] ?? 0}`, l.desc, () => (e.lure = l.id), (save.owned.lures[l.id] ?? 0) <= 0));
    const rod = ROD_BY_ID[e.rod];
    const reel = REEL_BY_ID[e.reel];
    const line = LINE_BY_ID[e.line];
    m.body.replaceChildren(
      h('div', { class: 'muted small', text: `現在の組み合わせ：ライン強度 ${(line.lb * LB_TO_KG).toFixed(1)}kg ／ 最大ドラグ ${reel.dragMax}kg ／ 糸巻量 ${Math.round(reel.capacity * line.capMult)}m ／ 竿パワー ${rod.power}kg。ドラグはライン強度より弱く設定しよう（ファイト中にホイールで調整）。` }),
      h('div', { class: 'cols' }, h('div', null, col('竿', rods), col('リール', reels)), h('div', null, col('ライン', lines), col('ルアー・エサ', lures))),
    );
  };
  render();
}

const MAP_SVG = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">
  <defs><linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e4a5e"/><stop offset="1" stop-color="#0c2433"/></linearGradient></defs>
  <rect width="100" height="100" fill="#2c4a36"/>
  <path d="M0,0 L30,0 Q22,12 12,10 Q4,8 0,16 Z" fill="#6b7f86" opacity="0.5"/>
  <path d="M100,8 Q78,22 74,40 Q70,55 52,60 Q44,64 46,76 Q48,90 36,100 L100,100 Z" fill="url(#sea)"/>
  <path d="M100,8 Q78,22 74,40 Q70,55 52,60 Q44,64 46,76 Q48,90 36,100" fill="none" stroke="#c9b98a" stroke-width="0.6" opacity="0.7"/>
  <ellipse cx="36" cy="42" rx="7" ry="4.5" fill="#2f6f78" stroke="#9fd3c7" stroke-width="0.4"/>
  <path d="M20,22 Q26,30 31,39 M41,45 Q48,52 55,59" fill="none" stroke="#5fa8b8" stroke-width="0.8"/>
  <path d="M8,30 l6,-8 l6,8 Z M14,34 l5,-7 l5,7 Z M60,10 l6,-9 l6,9 Z" fill="#41584a"/>
</svg>`;

export function openMap(modals: Modals, save: SaveData): void {
  const m = modals.open('マップ', { closeKey: 'KeyM' });
  const info = h('div', { class: 'info', text: '釣り場を選ぶと詳細を表示します。' });
  const map = h('div', { class: 'map' });
  map.innerHTML = MAP_SVG;
  for (const s of SPOTS) {
    const unlocked = save.spots.includes(s.id);
    const el = h(
      'div',
      {
        class: `spot${s.implemented && unlocked ? '' : ' locked'}${s.expansion ? ' expansion' : ''}`,
        onclick: () => {
          info.replaceChildren(
            h('b', { text: s.name }),
            h('span', { class: 'muted', text: s.expansion ? '　未開拓エリア' : s.implemented ? (unlocked ? '　現在地' : '　入漁券が必要') : '　準備中（入漁券は今後販売）' }),
            h('div', { style: 'margin-top:4px', text: s.desc }),
          );
        },
      },
      h('i'),
      h('span', { class: s.id === 'lake' ? 'here' : '', text: s.expansion ? `？ ${s.name}` : s.name }),
    );
    el.style.left = `${s.map[0] * 100}%`;
    el.style.top = `${s.map[1] * 100}%`;
    map.append(el);
  }
  map.append(info);
  m.body.append(map);
}

export interface PauseCallbacks {
  onSettings(s: Settings): void;
  onReset(): void;
  onTitle(): void;
}

export function controlsHelp(): HTMLElement {
  const rows: [string, string][] = [
    ['WASD / Shift', '移動 / 走る'],
    ['マウス', '視点'],
    ['F', '釣りをする / やめる（水辺で）'],
    ['E', '釣り小屋に入る（小屋の前で）'],
    ['左クリック長押し → 離す', 'キャスト（溜めるほど遠投・溜めすぎ注意）'],
    ['左クリック長押し', 'リールを巻く（Shift併用でゆっくり）'],
    ['右クリック', 'ロッドアクション / アタリでアワセ'],
    ['R', 'ウキ下を変更（エサ釣り）'],
    ['ファイト中 マウス左右', '竿を倒す（魚の走る向きと逆へ倒すと効果的）'],
    ['ファイト中 ホイール', 'ドラグ調整'],
    ['Tab', '図鑑'],
    ['I', 'タックルボックス'],
    ['M', 'マップ'],
    ['Esc', 'メニュー'],
  ];
  return h('div', { class: 'help-grid' }, ...rows.flatMap(([k, v]) => [h('b', { text: k }), h('span', { text: v })]));
}

export function openPause(modals: Modals, save: SaveData, cb: PauseCallbacks): void {
  const m = modals.open('メニュー', { small: true });
  const s = save.settings;
  const slider = (label: string, key: 'master' | 'bgm' | 'sfx' | 'sensitivity', min: number, max: number, step: number) => {
    const input = h('input') as HTMLInputElement;
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(s[key]);
    const val = h('span', { text: String(s[key]) });
    input.addEventListener('input', () => {
      s[key] = Number(input.value);
      val.textContent = input.value;
      cb.onSettings(s);
    });
    return h('div', { class: 'setting' }, h('span', { text: label }), input, val);
  };
  const stamina = h('input') as HTMLInputElement;
  stamina.type = 'checkbox';
  stamina.checked = s.showStamina;
  stamina.addEventListener('change', () => {
    s.showStamina = stamina.checked;
    cb.onSettings(s);
  });
  m.body.append(
    h('h4', { text: '設定' }),
    slider('全体音量', 'master', 0, 1, 0.05),
    slider('BGM', 'bgm', 0, 1, 0.05),
    slider('効果音', 'sfx', 0, 1, 0.05),
    slider('マウス感度', 'sensitivity', 0.3, 2.5, 0.1),
    h('label', { class: 'setting' }, h('span', { text: '魚の勢いを表示' }), stamina, h('span')),
    h('h4', { text: '操作' }),
    controlsHelp(),
  );
  m.footer.append(
    h('button', {
      class: 'ghost',
      text: 'セーブデータを消去',
      onclick: () => {
        if (confirm('セーブデータを消去して最初から始めますか？')) cb.onReset();
      },
    }),
    h('button', { class: 'ghost', text: 'タイトルへ', onclick: () => cb.onTitle() }),
    h('button', { class: 'primary', text: '再開', onclick: () => m.close() }),
  );
}

export function titleScreen(parent: HTMLElement, hasSave: boolean, onStart: (fresh: boolean) => void): HTMLElement {
  const help = h('div', { style: 'display:none;margin-top:18px;padding:16px 20px;border-radius:14px;background:var(--panel);max-width:560px' }, controlsHelp());
  const el = h(
    'div',
    { class: 'title' },
    h('h1', { text: "Angler's Atlas" }),
    h('div', { class: 'sub', text: '釣 魚 図 鑑' }),
    h(
      'div',
      { class: 'menu' },
      hasSave ? h('button', { class: 'primary', text: 'つづきから', onclick: () => onStart(false) }) : null,
      h('button', {
        class: hasSave ? '' : 'primary',
        text: 'はじめから',
        onclick: () => {
          if (!hasSave || confirm('今のセーブデータを消して最初から始めますか？')) onStart(true);
        },
      }),
      h('button', { class: 'ghost', text: '操作方法', onclick: () => (help.style.display = help.style.display ? '' : 'none') }),
    ),
    help,
    h('div', { class: 'foot', text: '素材: Poly Haven (CC0), three.js examples ／ クリックで操作開始（マウスはゲーム画面に固定されます）' }),
  );
  parent.append(el);
  return el;
}
