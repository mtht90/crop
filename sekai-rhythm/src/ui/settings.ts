import { audioCtx } from '../audio/context';
import { DEFAULT_SETTINGS, Settings, keyLabel } from '../core/settings';
import { h, modal } from './dom';

export function openSettings(current: Settings, onSave: (s: Settings) => void) {
  const s: Settings = JSON.parse(JSON.stringify(current));
  const m = modal('設定', { wide: true, onClose: () => onSave(s) });

  const slider = (label: string, get: () => number, set: (v: number) => void, min: number, max: number, step: number, fmt: (v: number) => string) => {
    const out = h('span', { class: 'slider-val' }, fmt(get()));
    const input = h('input', { type: 'range', min, max, step, value: String(get()) });
    input.addEventListener('input', () => {
      set(Number(input.value));
      out.textContent = fmt(get());
    });
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), h('div', { class: 'row' }, input, out));
  };
  const check = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const input = h('input', { type: 'checkbox', checked: get() });
    input.addEventListener('change', () => set(input.checked));
    return h('label', { class: 'field check' }, input, h('span', {}, label));
  };

  const offsetOut = h('span', { class: 'slider-val' }, `${s.offsetMs} ms`);
  const offsetInput = h('input', { type: 'range', min: -300, max: 300, step: 1, value: String(s.offsetMs) });
  offsetInput.addEventListener('input', () => {
    s.offsetMs = Number(offsetInput.value);
    offsetOut.textContent = `${s.offsetMs} ms`;
  });
  const setOffset = (v: number) => {
    s.offsetMs = Math.max(-300, Math.min(300, Math.round(v)));
    offsetInput.value = String(s.offsetMs);
    offsetOut.textContent = `${s.offsetMs} ms`;
  };

  // キー設定
  const keyRow = h('div', { class: 'key-row' });
  const renderKeys = () => {
    keyRow.replaceChildren(
      ...s.keys.map((code, i) => keyButton(`レーン${i + 1}`, code, (c) => (s.keys[i] = c))),
      keyButton('フリック', s.flickKeys[0], (c) => (s.flickKeys = [c])),
    );
  };
  const keyButton = (label: string, code: string, set: (c: string) => void) => {
    const b = h('button', { class: 'keycap' }, keyLabel(code));
    b.addEventListener('click', () => {
      b.textContent = '…';
      b.classList.add('waiting');
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.removeEventListener('keydown', onKey, true);
        if (e.code !== 'Escape') set(e.code);
        renderKeys();
      };
      window.addEventListener('keydown', onKey, true);
    });
    return h('div', { class: 'key-cell' }, h('span', {}, label), b);
  };
  renderKeys();

  m.body.append(
    h(
      'div',
      { class: 'settings-grid' },
      h(
        'section',
        {},
        h('h3', {}, 'プレイ'),
        slider('ノーツスピード', () => s.noteSpeed, (v) => (s.noteSpeed = v), 1, 12, 0.1, (v) => v.toFixed(1)),
        h(
          'label',
          { class: 'field' },
          h('span', { class: 'field-label' }, 'タイミング調整（+ でノーツが遅く来る）'),
          h('div', { class: 'row' }, offsetInput, offsetOut),
          h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => calibrate(setOffset) }, 'タップで自動計測'), h('button', { class: 'btn small', onclick: () => setOffset(0) }, '0 に戻す')),
        ),
        check('フリックはレーンキーを押しながら Space（オフで Space 単独でも可）', () => s.flickNeedsLane, (v) => (s.flickNeedsLane = v)),
        check('ライフ 0 で終了する', () => s.failOnZeroLife, (v) => (s.failOnZeroLife = v)),
        check('FAST / LATE を表示', () => s.showFastLate, (v) => (s.showFastLate = v)),
        check('判定ライン下にキーを表示', () => s.showKeyHints, (v) => (s.showKeyHints = v)),
      ),
      h(
        'section',
        {},
        h('h3', {}, 'サウンド・表示'),
        slider('楽曲音量', () => s.musicVolume, (v) => (s.musicVolume = v), 0, 100, 1, (v) => String(v)),
        slider('効果音量', () => s.sfxVolume, (v) => (s.sfxVolume = v), 0, 1, 0.01, (v) => String(Math.round(v * 100))),
        check('YouTube の動画を背景に表示', () => s.showVideo, (v) => (s.showVideo = v)),
        slider('背景の暗さ', () => s.bgDim, (v) => (s.bgDim = v), 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`),
        h('h3', {}, 'キー割り当て（クリックして押したいキーを入力）'),
        keyRow,
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              s.keys = [...DEFAULT_SETTINGS.keys];
              s.flickKeys = [...DEFAULT_SETTINGS.flickKeys];
              renderKeys();
            },
          },
          'キーを初期値に戻す',
        ),
      ),
    ),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => m.close() }, '閉じる')),
  );
}

/** メトロノームに合わせて Space を叩き、平均のズレからオフセットを求める */
function calibrate(apply: (ms: number) => void) {
  const c = audioCtx();
  const bpm = 100;
  const beats = 20;
  const spb = 60 / bpm;
  const start = c.currentTime + 1.0;
  const clicks: number[] = [];
  for (let i = 0; i < beats; i++) {
    const t = start + i * spb;
    clicks.push(t);
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = i % 4 === 0 ? 1760 : 1320;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.1);
  }
  const latency = (c.outputLatency || 0) + (c.baseLatency || 0);
  const diffs: number[] = [];
  const status = h('div', { class: 'calib-status' }, 'クリック音に合わせて Space を押してください');
  const dot = h('div', { class: 'calib-dot' });
  let done = false;
  const m = modal('タイミング計測', {
    onClose: () => {
      done = true;
      window.removeEventListener('keydown', onKey, true);
    },
  });
  m.body.append(dot, status);
  const perfToCtx = (ts: number) => c.currentTime - (performance.now() - ts) / 1000;
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    e.stopPropagation();
    const t = perfToCtx(e.timeStamp) - latency;
    let best = Infinity;
    for (const k of clicks) if (Math.abs(t - k) < Math.abs(best)) best = t - k;
    if (Math.abs(best) < spb / 2) diffs.push(best);
    dot.classList.remove('pulse');
    void dot.offsetWidth;
    dot.classList.add('pulse');
    status.textContent = `${diffs.length} 回 / 直近のズレ ${Math.round(best * 1000)} ms`;
  };
  window.addEventListener('keydown', onKey, true);
  setTimeout(
    () => {
      if (done) return;
      const use = diffs.slice(2);
      if (use.length < 5) {
        status.textContent = '入力が少なすぎました。もう一度試してください';
        return;
      }
      use.sort((a, b) => a - b);
      const median = use[Math.floor(use.length / 2)];
      apply(median * 1000);
      status.textContent = `計測結果: ${Math.round(median * 1000)} ms を設定しました`;
    },
    (1.0 + beats * spb + 0.5) * 1000,
  );
}
