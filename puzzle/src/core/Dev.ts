import { Save } from './Save';
import { CHARACTERS, MAX_LV, MAX_PLUS, MAX_SKILL_LV } from '../data/characters';
import { FRAMES, LINES, WALLPAPERS } from '../data/cosmetics';
import { GIMMICKS, type GimmickId } from '../data/gimmicks';
import { MAX_LIVES } from '../data/play';

/**
 * Developer mode: a password-gated panel for testing (coins, characters, bosses, obstructions).
 * Only a salted SHA-256 of the password is in the code. It runs in the browser, so this keeps
 * casual players out; it is not real security.
 */
const HASH = '3408ea08e2049ed9959f3f8e738f1998b801d864cb562788cfd9c0e8110acb96';
const KEY = 'punitto-dev';

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hooks the battle registers while it runs (obstruction tester, clock). */
export interface DevBattle {
  gimmick(id: GimmickId): void;
  setTime(sec: number): void;
  toggleClock(): boolean;
  fillGauges(): void;
  win(): void;
}

export const Dev = {
  battle: null as DevBattle | null,
  get on(): boolean {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  },
  async unlock(pw: string): Promise<boolean> {
    if (!crypto?.subtle) return false;
    const ok = (await sha256(`punitto-dev:${pw}`)) === HASH;
    if (ok) {
      try {
        sessionStorage.setItem(KEY, '1');
      } catch {
        /* ignore */
      }
    }
    return ok;
  },
  lock(): void {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};

// ------------------------------------------------------------------ DOM ui
const CSS = `
.dev{position:fixed;inset:0;z-index:60;background:rgba(10,4,24,.8);display:flex;align-items:center;justify-content:center;font:14px/1.4 sans-serif;color:#2a1630}
.dev .box{background:#fff4dc;border:5px solid #8a5a2a;border-radius:16px;padding:14px;width:min(92vw,440px);max-height:88vh;overflow:auto;box-sizing:border-box}
.dev h3{margin:10px 0 6px;font-size:15px;color:#8a5a2a;border-bottom:2px solid #e2c89a}
.dev .row{display:flex;gap:6px;align-items:center;margin:4px 0;flex-wrap:wrap}
.dev label{min-width:92px}
.dev input,.dev select{padding:5px;border:2px solid #c8a878;border-radius:8px;font-size:14px;min-width:0;flex:1}
.dev button{padding:7px 10px;border:0;border-radius:10px;background:#7a4dff;color:#fff;font-size:14px}
.dev button.warn{background:#d81b60}.dev button.grey{background:#8a7a9a}
.dev .msg{color:#d81b60;min-height:18px}
.devfab{position:fixed;right:8px;bottom:8px;z-index:55;padding:8px 10px;border:0;border-radius:10px;background:rgba(122,77,255,.85);color:#fff;font:bold 13px sans-serif}
`;

function sheet(): void {
  if (document.getElementById('dev-css')) return;
  const s = document.createElement('style');
  s.id = 'dev-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function overlay(html: string): HTMLDivElement {
  sheet();
  const w = document.createElement('div');
  w.className = 'dev';
  w.innerHTML = `<div class="box">${html}</div>`;
  // keep taps from reaching the game canvas underneath
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) w.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(w);
  return w;
}

/** Password prompt, then the panel. */
export function openDevLogin(onChange?: () => void): void {
  if (Dev.on) return openDevPanel(onChange);
  const w = overlay(`
    <b>開発者モード</b>
    <div class="row"><input type="password" data-pw placeholder="パスワード" autocomplete="off"></div>
    <div class="msg" data-msg></div>
    <div class="row"><button data-ok>ひらく</button><button class="grey" data-x>とじる</button></div>`);
  const pw = w.querySelector('[data-pw]') as HTMLInputElement;
  const msg = w.querySelector('[data-msg]') as HTMLDivElement;
  pw.focus();
  const go = async () => {
    if (await Dev.unlock(pw.value)) {
      w.remove();
      openDevPanel(onChange);
    } else {
      msg.textContent = 'パスワードがちがいます';
      pw.value = '';
    }
  };
  w.querySelector('[data-ok]')!.addEventListener('click', go);
  pw.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  w.querySelector('[data-x]')!.addEventListener('click', () => w.remove());
}

export function openDevPanel(onChange?: () => void): void {
  const d = Save.data;
  const sel = d.owned[d.selected];
  const chars = CHARACTERS.map((c) => `<option value="${c.id}" ${c.id === d.selected ? 'selected' : ''}>${c.rarity} ${c.name}</option>`).join('');
  const gimmicks = Object.values(GIMMICKS).map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
  const w = overlay(`
    <b>開発者モード</b>
    <h3>所持品</h3>
    <div class="row"><label>コイン</label><input type="number" data-k="coins" value="${d.coins}"></div>
    <div class="row"><label>ガチャチケット</label><input type="number" data-k="tickets" value="${d.tickets}"></div>
    <div class="row"><label>スキルチケット</label><input type="number" data-k="skillTickets" value="${d.skillTickets}"></div>
    <div class="row"><label>ライフ</label><input type="number" data-k="lives" value="${d.lives}" min="0" max="99"></div>
    <div class="row"><button data-a="save">反映する</button></div>
    <h3>キャラ</h3>
    <div class="row"><button data-a="allChars">全キャラ解放</button></div>
    <div class="row"><label>キャラ</label><select data-char>${chars}</select></div>
    <div class="row"><label>Lv</label><input type="number" data-lv value="${sel?.lv ?? 1}" min="1"></div>
    <div class="row"><label>スキルLv</label><input type="number" data-sl value="${sel?.skill ?? 1}" min="1" max="${MAX_SKILL_LV}"></div>
    <div class="row"><label>+Lv</label><input type="number" data-plus value="${sel?.plus ?? 0}" min="0" max="${MAX_PLUS}"></div>
    <div class="row"><button data-a="char">このキャラに反映・選択</button></div>
    <h3>ボス・バトル</h3>
    <div class="row"><label>ボスLv</label><input type="number" data-boss value="${d.bossLv}" min="1"><button data-a="boss">反映</button></div>
    <div class="row"><label>妨害テスト</label><select data-g>${gimmicks}</select><button data-a="gimmick">発動</button></div>
    <div class="row"><label>残り時間</label><input type="number" data-t value="90"><button data-a="time">反映</button><button data-a="clock">時計 停止/再開</button></div>
    <div class="row"><button data-a="gauge">ゲージ満タン</button><button data-a="win">即討伐</button></div>
    <h3>データ</h3>
    <div class="row"><button data-a="looks">きせかえ全解放</button><button data-a="missions">ミッション進行リセット</button></div>
    <div class="row"><button class="warn" data-a="reset">セーブ初期化</button><button class="grey" data-a="logout">開発者モード終了</button></div>
    <div class="msg" data-msg></div>
    <div class="row"><button class="grey" data-a="close">とじる</button></div>`);
  const $ = <T extends HTMLElement>(q: string) => w.querySelector(q) as T;
  const num = (q: string) => Math.max(0, Math.floor(Number($<HTMLInputElement>(q).value) || 0));
  const msg = (t: string) => ($<HTMLDivElement>('[data-msg]').textContent = t);
  let changed = false;
  const done = (t: string) => {
    changed = true;
    Save.write();
    msg(t);
    onChange?.();
  };
  const charSel = $<HTMLSelectElement>('[data-char]');
  charSel.addEventListener('change', () => {
    const o = Save.data.owned[charSel.value];
    $<HTMLInputElement>('[data-lv]').value = String(o?.lv ?? 1);
    $<HTMLInputElement>('[data-sl]').value = String(o?.skill ?? 1);
    $<HTMLInputElement>('[data-plus]').value = String(o?.plus ?? 0);
  });
  w.querySelectorAll('button[data-a]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = b.getAttribute('data-a');
      const s = Save.data;
      switch (a) {
        case 'save':
          s.coins = num('[data-k="coins"]');
          s.tickets = num('[data-k="tickets"]');
          s.skillTickets = num('[data-k="skillTickets"]');
          s.lives = Math.min(99, num('[data-k="lives"]'));
          if (s.lives >= MAX_LIVES) s.lifeAt = 0;
          return done('反映しました');
        case 'allChars':
          for (const c of CHARACTERS) s.owned[c.id] ??= { lv: 1, exp: 0, skill: 1, plus: 0, count: 1 };
          return done('全キャラを解放しました');
        case 'char': {
          const c = CHARACTERS.find((x) => x.id === charSel.value)!;
          const o = (s.owned[c.id] ??= { lv: 1, exp: 0, skill: 1, plus: 0, count: 1 });
          o.lv = Math.min(MAX_LV[c.rarity], Math.max(1, num('[data-lv]')));
          o.exp = 0;
          o.skill = Math.min(MAX_SKILL_LV, Math.max(1, num('[data-sl]')));
          o.plus = Math.min(MAX_PLUS, num('[data-plus]'));
          s.selected = c.id;
          return done(`${c.name} Lv.${o.lv} SLv.${o.skill} +${o.plus}`);
        }
        case 'boss':
          s.bossLv = Math.max(1, num('[data-boss]'));
          s.fightLv = 0;
          return done(`ボスLv.${s.bossLv}`);
        case 'gimmick':
          if (!Dev.battle) return msg('バトル中に使えます');
          Dev.battle.gimmick($<HTMLSelectElement>('[data-g]').value as GimmickId);
          return msg('発動しました');
        case 'time':
          if (!Dev.battle) return msg('バトル中に使えます');
          Dev.battle.setTime(num('[data-t]'));
          return msg('時間を変えました');
        case 'clock':
          if (!Dev.battle) return msg('バトル中に使えます');
          return msg(Dev.battle.toggleClock() ? '時計を止めました' : '時計を動かしました');
        case 'gauge':
          if (!Dev.battle) return msg('バトル中に使えます');
          Dev.battle.fillGauges();
          return msg('ゲージ満タン');
        case 'win':
          if (!Dev.battle) return msg('バトル中に使えます');
          Dev.battle.win();
          return msg('討伐ライン到達');
        case 'looks':
          s.look.wallpapers = WALLPAPERS.map((x) => x.id);
          s.look.frames = FRAMES.map((x) => x.id);
          s.look.lines = LINES.map((x) => x.id);
          return done('きせかえを全解放しました');
        case 'missions':
          s.claimed = [];
          s.daily = { date: '', ids: [], stats: {}, claimed: [], bonus: false };
          return done('ミッションをリセットしました');
        case 'reset':
          if (!confirm('セーブデータを初期化しますか？（元に戻せません）')) return;
          Save.reset();
          location.reload();
          return;
        case 'logout':
          Dev.lock();
          w.remove();
          location.reload();
          return;
        case 'close':
          w.remove();
          onChange?.();
          // menus show the new values after a reload (battles pick them up next round)
          if (changed && !Dev.battle) location.reload();
          return;
      }
    }),
  );
}

/** Small floating button during battles (dev mode only). */
export function devFab(): () => void {
  if (!Dev.on) return () => {};
  sheet();
  const b = document.createElement('button');
  b.className = 'devfab';
  b.textContent = 'DEV';
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', () => openDevPanel());
  document.body.appendChild(b);
  return () => b.remove();
}
