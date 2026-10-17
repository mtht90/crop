// レンダラー内で実行される E2E シナリオ（scripts/e2e.mjs から注入）
(async () => {
  const log = (...a) => console.log('[e2e]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fail = (msg) => { console.log('[e2e] FAIL: ' + msg); window.folio.e2eDone(1); throw new Error(msg); };
  const assert = (c, msg) => { if (!c) fail(msg); else log('ok -', msg); };
  const shot = async (name) => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); await sleep(300); await window.folio.e2eScreenshot(name); };
  const key = (k, opts = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));
  try {
    let app;
    for (let i = 0; i < 100 && !(app = window.folioTest); i++) await sleep(100);
    assert(app, 'アプリが起動した');
    for (let i = 0; i < 300 && !app.audio.ready && !document.querySelector('#audioStatus').textContent.includes('⚠'); i++) await sleep(100);
    log('audio status:', document.querySelector('#audioStatus').textContent);
    assert(app.audio.ready, 'SoundFont 音源が読み込まれた');
    assert(document.querySelectorAll('.page svg').length >= 1, '楽譜ページが描画された');
    await shot('01-start');

    // --- キーボードでメロディを入力（MuseScore 互換）
    key('n');
    assert(app.inputMode, 'N で入力モードに入る');
    key('5'); // 4分音符
    for (const k of ['c', 'd', 'e', 'f']) key(k);
    key('6'); key('g'); key('g');           // 2分音符 G G
    key('4'); for (const k of ['a', 'b', 'c']) key(k); key('ArrowUp', { ctrlKey: true }); // 8分 A B C(+oct)
    key('0');                               // 8分休符
    key('5'); key('e'); key('G', { shiftKey: true }); key('C', { shiftKey: true }); // 和音 E-G-C
    key('.'); key('d'); key('.');            // 付点4分 D
    key('4'); key('c');                      // 8分 C
    key('7'); key('c');                      // 全音符 C
    const staff0 = app.score.parts[0].staves[0];
    const notes = staff0.measures.flatMap((m) => m.events).filter((e) => !e.rest);
    log('入力された音:', notes.map((e) => e.pitches.map((p) => p.step + (p.alter ? (p.alter > 0 ? '#' : 'b') : '') + p.octave).join('+') + '/' + e.dur + (e.dots ? '.' : '')).join(' '));
    assert(notes.length === 15, `15 個（小節をまたぐ音のタイ分割を含む）の音符/和音が入力された (${notes.length})`);
    const m0 = staff0.measures[0].events.map((e) => e.pitches[0]?.step).join('');
    assert(m0 === 'CDEF', '1 小節目は C D E F');
    const chord = notes.find((e) => e.pitches.length === 3);
    assert(chord && chord.pitches.map((p) => p.step).join('') === 'EGC', 'Shift+音名で和音 E-G-C');
    const cHigh = staff0.measures[2].events[2];
    assert(cHigh.pitches[0].octave === 7, `Ctrl+↑ でオクターブ上げ (C${cHigh.pitches[0].octave})`);
    for (const st of app.score.parts[0].staves) for (const m of st.measures) {
      const t = m.events.reduce((a, e) => a + ({ w: 1920, h: 960, q: 480, 8: 240, 16: 120, 32: 60, 64: 30 }[e.dur]) * (e.dots ? 1.5 : 1), 0);
      if (t !== 1920) fail('小節長が不正: ' + t);
    }
    assert(true, 'すべての小節の長さが拍子と一致');

    // --- 鍵盤クリックで入力（下段へ移動して和音入力）
    key('ArrowDown', { altKey: true });
    assert(app.input.staff === 1, 'Alt+↓ でヘ音記号の譜表へ移動');
    app.input = { staff: 1, measure: 0, tick: 0 };
    key('6');
    const press = (m, shift = false) => document.querySelector(`.key[data-midi="${m}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: shift }));
    press(48); press(55, true); press(64, true); // C3-G3-E4 の和音
    press(43); press(50, true); press(59, true);
    const bass0 = app.score.parts[0].staves[1].measures[0].events;
    assert(bass0[0].pitches.length === 3 && bass0[1].pitches.length === 3, '鍵盤クリック（Shift で和音）で入力できる');
    key('Escape');
    assert(!app.inputMode, 'Esc で入力モード終了');

    // --- 選択と編集
    app.select({ staff: 0, measure: 0, index: 1 });
    key('ArrowUp');
    assert(app.score.parts[0].staves[0].measures[0].events[1].pitches[0].alter === 1, '↑ で選択音を半音上げる (D→D#)');
    key('z', { ctrlKey: true });
    assert(app.score.parts[0].staves[0].measures[0].events[1].pitches[0].alter === 0, 'Ctrl+Z で元に戻す');
    key('y', { ctrlKey: true });
    key('z', { ctrlKey: true });
    key('ArrowRight', { shiftKey: true });
    assert(app.selectedPositions().length === 2, 'Shift+→ で範囲選択');
    key('c', { ctrlKey: true });
    app.select({ staff: 0, measure: 4, index: 0 });
    key('v', { ctrlKey: true });
    assert(app.score.parts[0].staves[0].measures[4].events[0].pitches[0].step === 'D', 'コピー＆貼り付け');
    key('Delete');
    assert(app.score.parts[0].staves[0].measures[4].events.slice(0, 2).every((e) => e.rest), 'Delete で休符に戻す');

    // --- 楽譜上のクリック選択
    const geo = app.layout.events.find((g) => g.pos.staff === 0 && g.pos.measure === 0 && g.pos.index === 2);
    const page = app.layout.pages[0];
    const r = page.getBoundingClientRect();
    const sc = r.width / 900;
    page.querySelector('svg').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + (geo.noteX + 5) * sc, clientY: r.top + (geo.y + geo.h / 2) * sc }));
    assert(app.sel && app.sel.head.measure === 0 && app.sel.head.index === 2, '楽譜上の音符をクリックで選択できる');
    await shot('02-entered');

    // --- パート追加と楽器変更
    document.querySelector('#addPartSelect').value = 'violin';
    document.querySelector('#addPartBtn').click();
    assert(app.score.parts.length === 2 && app.score.parts[1].instrument === 'violin', 'ヴァイオリンのパートを追加');
    app.select({ staff: 2, measure: 0, index: 0 });
    key('n'); key('5');
    for (const k of ['g', 'a', 'b', 'c', 'd', 'e', 'f', 'g']) key(k);
    key('Escape');
    const sel = document.querySelectorAll('#partList select')[1];
    sel.value = 'flute';
    sel.dispatchEvent(new Event('change'));
    assert(app.score.parts[1].instrument === 'flute' && app.score.parts[1].name === 'フルート', '楽器をフルートに変更');
    await app.audio.auditionInstrument('flute');
    assert(true, '楽器の試聴を実行');

    // --- 再生
    app.select({ staff: 0, measure: 0, index: 0 });
    key(' ');
    await sleep(1600);
    assert(app.audio.playing, 'Space で再生開始');
    assert(document.querySelector('.playhead'), '再生位置カーソルが表示される');
    await shot('03-playing');
    key(' ');
    assert(!app.audio.playing, 'Space で停止');

    // --- 保存と読み込み
    app.score.title = 'E2E テスト曲';
    const saved = await app.save();
    assert(saved && app.filePath.endsWith('.folio'), '保存: ' + app.filePath);
    const before = JSON.stringify(app.score);
    app.loadFile(app.filePath, JSON.stringify(JSON.parse(before)));
    assert(JSON.stringify(app.score) === before, '保存したファイルを読み込むと同じ内容');

    // --- 書き出し
    await app.exportAs('musicxml');
    await app.exportAs('mid');
    await app.exportAs('pdf');
    const wav = await app.audio.renderWav(app.score);
    const dv = new DataView(wav.buffer);
    let peak = 0;
    for (let i = 44; i < wav.length - 1; i += 2) peak = Math.max(peak, Math.abs(dv.getInt16(i, true)));
    log('WAV bytes', wav.length, 'peak', peak);
    assert(wav.length > 100000 && peak > 1000, 'SoundFont でオフライン合成した音声に信号がある');
    await app.exportAs('wav');

    // --- 新規作成（弦楽四重奏）と拍子変更
    app.newScoreFromTemplate('quartet', { title: '弦楽四重奏', composer: 'Test', tempo: 90, num: 3, den: 4, key: 2, measures: 12 });
    assert(app.score.parts.length === 4, '弦楽四重奏テンプレート');
    app.select({ staff: 0, measure: 0, index: 0 });
    for (const k of ['d', 'f', 'a']) key(k);
    assert(app.score.parts[0].staves[0].measures[0].events[1].pitches[0].alter === 1, 'ニ長調の調号で F が F# になる');
    key('Escape');
    await shot('04-quartet');
    log('ALL PASSED');
    window.folio.e2eDone(0);
  } catch (e) {
    console.log('[e2e] ERROR ' + (e && e.stack || e));
    window.folio.e2eDone(1);
  }
})();
