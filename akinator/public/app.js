import { Engine, ANSWERS, A, recordLearning } from './engine.js';

const LOCAL_KEY = 'senrigan-learned-v1';
const $ = (id) => document.getElementById(id);
const panel = $('panel');
const seer = document.querySelector('.seer');

let db = null;
let mode = 'local'; // 'server' | 'local'
let engine = null;
let game = null;
let currentQ = -1;
let busy = false;
let guessCount = 0;

// ------------------------------------------------------------
// セリフ
// ------------------------------------------------------------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const LINES = {
  intro: [
    'ようこそ。\n心にひとつ、何かを思い浮かべなさい。\n人でも、生き物でも、物でも、場所でもよい。',
    '……来たか。\n思い浮かべたものを、心の奥にしまっておきなさい。\n私が見つけ出そう。',
  ],
  start: ['では、覗かせてもらおう。', '目を閉じて……いや、開けたままでよい。'],
  fog: ['ふむ……', 'まだ霧が濃い。', '心の扉を叩いている……', '静かに。集中させてくれ。'],
  shape: ['輪郭が見えてきた。', 'なるほど……', 'ほう、そういうことか。', '少しずつ、霧が晴れていく。'],
  close: ['……見えてきたぞ。', 'もう少しで掴める。', '君の心の形が、はっきりしてきた。', '隠しても無駄だ。'],
  sure: ['ほぼ見えている。念のため確かめよう。', '君の心は、もう読めている……', 'これは確認にすぎない。'],
  hint: [
    '……{x}、だな？\nいや、答えなくてよい。',
    '{x}の気配がする。',
    '見えるぞ……{x}だ。',
  ],
  earlyGuess: ['もう分かった。\nこれ以上の質問は不要だ。', 'この先を聞く必要はない。'],
  guess: ['君が思い浮かべているのは……', '見えた。それは……'],
  win: [
    'やはりな。{n}問で十分だった。',
    '私の目に映らぬものはない。',
    '{n}問。……少し手こずったふりをしてみたが、最初から見えていた。',
  ],
  winFast: ['{n}問。君の心は、驚くほど澄んでいた。', 'たった{n}問。……君の心は、開いた本のようだ。'],
  wrong: ['……ほう。では、もう少し深く覗こう。', '霧に惑わされたか。続けよう。'],
  lose: ['まさか……私の目を欺くとは。\n教えてくれ。何を思い浮かべていた？'],
  thanks: ['覚えた。次は逃さない。', 'その名、心に刻んだ。次に会う時は、一瞬だ。'],
  undo: ['ふむ、心が揺れたか。よかろう。'],
};
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

function say(text, extraClass) {
  const el = $('line');
  el.innerHTML = '';
  const span = document.createElement('span');
  if (extraClass) span.className = extraClass;
  el.appendChild(span);
  // 1文字ずつ表示
  let i = 0;
  const chars = [...text];
  clearInterval(say.timer);
  say.timer = setInterval(() => {
    span.textContent += chars[i++] ?? '';
    if (i >= chars.length) clearInterval(say.timer);
  }, 28);
}

function setMood(conf) {
  seer.classList.remove('c1', 'c2', 'c3');
  seer.classList.add(conf > 0.75 ? 'c3' : conf > 0.35 ? 'c2' : 'c1');
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
// データ読み込み
// ------------------------------------------------------------
function loadLocalLearned() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};
  } catch {
    return {};
  }
}
function saveLocalLearned(l) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(l));
  } catch {}
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

async function loadAll() {
  try {
    db = await fetchJson('api/db');
    mode = 'server';
  } catch {
    db = await fetchJson('db.json');
    mode = 'local';
  }
  await rebuildEngine();
}

async function rebuildEngine() {
  let learned = {};
  if (mode === 'server') {
    try {
      learned = await fetchJson('api/learned');
    } catch {}
  } else {
    learned = loadLocalLearned();
  }
  engine = new Engine(db, learned, { minVotes: 1 });
  $('stats').textContent = `記憶している存在: ${engine.E.toLocaleString()} ／ 質問: ${engine.Q}` + (learned.plays ? ` ／ 読心回数: ${learned.plays.toLocaleString()}` : '');
}

async function sendLearning(payload) {
  if (mode === 'server') {
    try {
      await fetch('api/learn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch {}
  } else {
    saveLocalLearned(recordLearning(loadLocalLearned(), payload));
  }
}

// ------------------------------------------------------------
// 画面
// ------------------------------------------------------------
function render(html) {
  panel.onclick = null;
  panel.innerHTML = html;
  panel.classList.remove('fade-in');
  void panel.offsetWidth;
  panel.classList.add('fade-in');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function showTitle() {
  $('meter').classList.add('hidden');
  seer.classList.remove('c2', 'c3', 'reveal');
  say(pick(LINES.intro));
  render(`<div class="row"><button class="primary" id="start">思い浮かべた</button></div>`);
  $('start').onclick = startGame;
}

async function startGame() {
  game = engine.newGame();
  guessCount = 0;
  $('meter').classList.remove('hidden');
  say(pick(LINES.start));
  await nextStep(true);
}

function updateMeter() {
  const c = game.confidence();
  $('qnum').textContent = `第${game.history.length + 1}問`;
  // 表示は少し遅れて追いつく感じに（低確率帯を持ち上げて見せる）
  const shown = Math.round(100 * Math.pow(c, 0.6));
  $('conf').textContent = shown;
  $('meter-fill').style.width = shown + '%';
  setMood(c);
  return c;
}

async function nextStep(first = false) {
  busy = true;
  seer.classList.add('thinking');
  const t0 = performance.now();
  // 思考は重いことがあるので描画させてから
  await wait(20);
  const decision = game.guessDecision();
  const q = decision ? -1 : game.nextQuestion();
  const elapsed = performance.now() - t0;
  await wait(Math.max(0, (first ? 600 : 350) - elapsed));
  seer.classList.remove('thinking');
  busy = false;

  if (decision) return showGuess(decision);
  if (q < 0) return showLose();
  currentQ = q;
  const c = updateMeter();

  if (!first) {
    const h = game.hint();
    if (h) say(fill(pick(LINES.hint), { x: h.label }), 'hint');
    else say(pick(c > 0.75 ? LINES.sure : c > 0.4 ? LINES.close : c > 0.1 ? LINES.shape : LINES.fog));
  }

  const qq = engine.questions[q];
  render(`
    <p class="question">${escapeHtml(qq.text)}</p>
    <div class="answers">
      ${ANSWERS.map((a, i) => `<button data-a="${i}" class="${i === A.YES ? 'yes' : i === A.NO ? 'no' : ''}">${a}</button>`).join('')}
    </div>
    <div class="sub-actions">
      <button class="ghost" id="undo" ${game.history.length ? '' : 'disabled'}>↶ ひとつ戻る</button>
      <button class="ghost" id="quit">やめる</button>
    </div>`);
  panel.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => onAnswer(+b.dataset.a)));
  $('undo').onclick = onUndo;
  $('quit').onclick = showTitle;
}

async function onAnswer(a) {
  if (busy) return;
  game.answer(currentQ, a);
  await nextStep();
}

async function onUndo() {
  if (busy || !game.undo()) return;
  say(pick(LINES.undo));
  await nextStep(true);
}

async function showGuess(d) {
  guessCount++;
  const ent = engine.entities[d.e];
  const n = game.history.length;
  seer.classList.add('reveal');
  $('meter-fill').style.width = '100%';
  $('conf').textContent = Math.round(100 * Math.pow(d.p, 0.6));
  if (d.early && guessCount === 1) {
    say(pick(LINES.earlyGuess));
    render('');
    await wait(1600);
  }
  say(pick(LINES.guess));
  render(`
    <div class="guess">
      <div class="label">第${n}問にて</div>
      <div class="name">${escapeHtml(ent.n)}</div>
      <div class="row">
        <button class="yes primary" id="g-yes">正解</button>
        <button class="no" id="g-no">ちがう</button>
      </div>
    </div>`);
  $('g-yes').onclick = () => onWin(d.e);
  $('g-no').onclick = () => onWrong(d.e);
}

async function onWin(e) {
  const n = game.history.length;
  const ent = engine.entities[e];
  say(fill(pick(n <= 12 && guessCount === 1 ? LINES.winFast : LINES.win), { n }));
  await sendLearning({ name: ent.n, answers: game.answersByTag(), domain: ent.d, win: true });
  render(`<div class="row"><button class="primary" id="again">もう一度</button></div>`);
  $('again').onclick = async () => {
    await rebuildEngine();
    showTitle();
  };
}

async function onWrong(e) {
  seer.classList.remove('reveal');
  game.reject(e);
  if (guessCount >= 3 || game.history.length >= 50) return showLose();
  say(pick(LINES.wrong));
  await nextStep(true);
}

function showLose() {
  $('meter').classList.add('hidden');
  say(pick(LINES.lose));
  const top = game.ranking(6).map((r) => r.e);
  render(`
    <div class="teach">
      <input id="teach-name" type="text" maxlength="60" placeholder="名前を入力（例: 大谷翔平、ピカチュウ、たこ焼き）" autocomplete="off">
      <div class="chips" id="suggest"></div>
      <p>もしかして、この中に？</p>
      <div class="chips">${top.map((e) => `<button data-e="${e}">${escapeHtml(engine.entities[e].n)}</button>`).join('')}</div>
      <div class="row">
        <button class="primary" id="teach-ok">教える</button>
        <button id="teach-skip">教えない</button>
      </div>
    </div>`);
  const input = $('teach-name');
  const sug = $('suggest');
  input.oninput = () => {
    const hits = engine.search(input.value, 6);
    sug.innerHTML = hits.map((e) => `<button data-e="${e}">${escapeHtml(engine.entities[e].n)}</button>`).join('');
  };
  panel.onclick = (ev) => {
    const b = ev.target.closest('[data-e]');
    if (b) input.value = engine.entities[+b.dataset.e].n;
  };
  $('teach-ok').onclick = async () => {
    const name = input.value.trim();
    if (!name) return input.focus();
    const idx = engine.findByName(name);
    const canonical = idx >= 0 ? engine.entities[idx].n : name;
    const domain = idx >= 0 ? engine.entities[idx].d : game.inferredDomain();
    await sendLearning({ name: canonical, answers: game.answersByTag(), domain, win: false });
    say(pick(LINES.thanks));
    render(`<div class="row"><button class="primary" id="again">もう一度</button></div>`);
    $('again').onclick = async () => {
      await rebuildEngine();
      showTitle();
    };
  };
  $('teach-skip').onclick = showTitle;
  input.focus();
}

loadAll()
  .then(showTitle)
  .catch((e) => {
    console.error(e);
    say('水晶玉が曇っている……\n（データを読み込めませんでした）');
  });
