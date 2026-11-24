import { audio } from '../core/audio';
import { DIFFICULTIES, TEAMS, type Difficulty, type Team } from '../game/data';
import type { GameState } from '../game/rules';

const el = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
};

/** タイトル。ready が解決するまでは読み込みの進み具合を出し、終わったらタップで進める */
export function titleScreen(parent: HTMLElement, ready: Promise<unknown> = Promise.resolve(), progress?: (cb: (p: number) => void) => void): Promise<void> {
  return new Promise((resolve) => {
    const s = el(`<div class="screen dim">
      <div class="logo"><div class="cap-logo">CAP</div><div class="jp">キャップ<br>スタジアム</div><div class="en">BOTTLE CAP BASEBALL</div><div class="en" style="letter-spacing:.1em;margin-top:4px">投球距離 9.22m ・ 5人制 ・ 6イニング</div></div>
      <div class="tap hidden">タップしてはじめる</div>
      <div class="loading"><div class="bar"><i></i></div><div style="margin-top:8px;font-size:12px">球場を準備しています…</div></div>
      <div class="credits">素材: KayKit (Kay Lousberg) / Poly Haven / OpenTracks（旧DOVA-SYNDROME）/ Google Fonts<br>ルール: 日本キャップ野球協会の公式ルール解説をもとに作成</div>
    </div>`);
    parent.append(s);
    const bar = s.querySelector('.loading i') as HTMLElement;
    progress?.((p) => (bar.style.width = Math.round(p * 100) + '%'));
    let ok = false;
    ready.then(
      () => {
        ok = true;
        s.querySelector('.loading')!.remove();
        s.querySelector('.tap')!.classList.remove('hidden');
      },
      (e) => {
        // 止まったままにせず、理由と読み直しボタンを出す
        const box = s.querySelector('.loading') as HTMLElement;
        box.innerHTML = `<div style="font-size:13px;line-height:1.6">読み込みに失敗しました<br><span style="opacity:.75;font-size:11px">${String(e instanceof Error ? e.message : e).replace(/[<>&]/g, '')}</span></div><button class="big-btn" style="max-width:260px;margin:12px auto 0">もう一度読み込む</button>`;
        box.querySelector('button')!.addEventListener('click', () => location.reload());
      },
    );
    const go = () => {
      if (!ok) {
        audio.unlock();
        return;
      }
      audio.unlock();
      audio.play('ui_ok');
      s.remove();
      resolve();
    };
    s.addEventListener('pointerup', function h() {
      go();
      if (ok) s.removeEventListener('pointerup', h);
    });
    window.addEventListener('keydown', function k(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        if (ok) window.removeEventListener('keydown', k);
        if (s.isConnected) go();
      }
    });
  });
}

export interface SetupResult { team: Team; opp: Team; user: 'away' | 'home'; innings: number; difficulty: Difficulty; predict: boolean }

export function setupScreen(parent: HTMLElement): Promise<SetupResult> {
  return new Promise((resolve) => {
    let team = 0, user: 'away' | 'home' = 'home', innings = 6, diff = 1, predict = true;
    const s = el(`<div class="screen dim"><div class="panel">
      <h2>試合の設定</h2>
      <div class="row"><label>あなたのチーム</label><div class="teams">${TEAMS.map((t, i) => `<div class="team" data-team="${i}"><div class="sw" style="background:linear-gradient(90deg, ${t.uniform.primary} 0 50%, ${t.color} 50%)"></div><div class="nm">${t.name}</div><div class="st">エース ${t.players.find((p) => p.pos === 'P')!.name}</div></div>`).join('')}</div></div>
      <div class="row"><label>先攻・後攻</label><div class="seg" data-k="user"><button data-v="away">先攻（表）</button><button data-v="home">後攻（裏）</button></div></div>
      <div class="row"><label>イニング</label><div class="seg" data-k="inn"><button data-v="3">3回</button><button data-v="4">4回</button><button data-v="6">6回（公式）</button></div></div>
      <div class="row"><label>相手の強さ</label><div class="seg" data-k="diff">${DIFFICULTIES.map((d, i) => `<button data-v="${i}">${d.name}</button>`).join('')}</div></div>
      <div class="row"><label>打撃のアシスト（コースのマスを薄く表示）</label><div class="seg" data-k="pred"><button data-v="1">あり</button><button data-v="0">なし</button></div></div>
      <div class="row howto">
        <b>ルール</b> 公式キャップ野球と同じ5人制。走塁はなく、走者は仮想で進む。ノーバウンドで捕られるか、<b>アウトゾーン</b>で止まればアウト。<b>ヒットゾーン</b>に届けば単打、バウンドしてフェンスなら二塁打、ノーバウンドでフェンス直撃は三塁打、越えればホームラン。パスボールラインを割ると走者が進む。<br>
        <b>投げる</b> 球種を選び、ドラッグで狙って、下のキャップを<b>上にはじく</b>。白い輪が緑の輪に重なる瞬間に離すと狙いどおり。指を<b>曲げてはじく</b>と変化が増える。<br>
        <b>打つ</b> ドラッグで黄色いカーソルを動かし、<b>指を離してスイング</b>。ゾーンの薄く塗られたマスは、投球前は捕手の構え、投げた後は「このまま来たら通るマス」。変化球は最後に曲がるのでマスも動く。振った後に早い・遅いが出る。
      </div>
      <button class="big-btn">プレイボール！</button>
    </div></div>`);
    parent.append(s);
    const refresh = () => {
      s.querySelectorAll<HTMLElement>('.team').forEach((e) => e.classList.toggle('sel', +e.dataset.team! === team));
      s.querySelectorAll<HTMLElement>('[data-k="user"] button').forEach((b) => b.classList.toggle('sel', b.dataset.v === user));
      s.querySelectorAll<HTMLElement>('[data-k="inn"] button').forEach((b) => b.classList.toggle('sel', +b.dataset.v! === innings));
      s.querySelectorAll<HTMLElement>('[data-k="diff"] button').forEach((b) => b.classList.toggle('sel', +b.dataset.v! === diff));
      s.querySelectorAll<HTMLElement>('[data-k="pred"] button').forEach((b) => b.classList.toggle('sel', (b.dataset.v === '1') === predict));
    };
    s.querySelectorAll<HTMLElement>('[data-k="pred"] button').forEach((b) => (b.onclick = () => { predict = b.dataset.v === '1'; audio.play('ui_move'); refresh(); }));
    s.querySelectorAll<HTMLElement>('.team').forEach((e) => (e.onclick = () => { team = +e.dataset.team!; audio.play('ui_move'); refresh(); }));
    s.querySelectorAll<HTMLElement>('[data-k="user"] button').forEach((b) => (b.onclick = () => { user = b.dataset.v as 'away' | 'home'; audio.play('ui_move'); refresh(); }));
    s.querySelectorAll<HTMLElement>('[data-k="inn"] button').forEach((b) => (b.onclick = () => { innings = +b.dataset.v!; audio.play('ui_move'); refresh(); }));
    s.querySelectorAll<HTMLElement>('[data-k="diff"] button').forEach((b) => (b.onclick = () => { diff = +b.dataset.v!; audio.play('ui_move'); refresh(); }));
    s.querySelector<HTMLElement>('.big-btn')!.onclick = () => {
      audio.play('ui_ok');
      s.remove();
      resolve({ team: TEAMS[team], opp: TEAMS[1 - team], user, innings, difficulty: DIFFICULTIES[diff], predict });
    };
    refresh();
  });
}

export function loadingScreen(parent: HTMLElement) {
  const s = el(`<div class="screen"><div class="loading">準備中…<div class="bar"><i></i></div></div></div>`);
  parent.append(s);
  const bar = s.querySelector('i') as HTMLElement;
  return { set: (p: number) => (bar.style.width = Math.round(p * 100) + '%'), done: () => s.remove() };
}

export function resultScreen(parent: HTMLElement, st: GameState, user: 'away' | 'home'): Promise<'again' | 'title'> {
  return new Promise((resolve) => {
    const me = user === 'away' ? st.away : st.home, op = user === 'away' ? st.home : st.away;
    const diff = st.score(me) - st.score(op);
    const title = diff > 0 ? '勝利！' : diff < 0 ? '敗北…' : '引き分け';
    const n = Math.max(st.away.runs.length, st.home.runs.length, st.innings);
    const cells = (runs: number[], isHomeSkipped: boolean) => Array.from({ length: n }, (_, i) => `<td>${runs[i] ?? (isHomeSkipped && i === n - 1 ? 'x' : '-')}</td>`).join('');
    const homeSkipped = st.home.runs.length < st.away.runs.length;
    // 活躍した選手
    let mvp = '', best = -1;
    for (const p of me.team.players) {
      const l = st.lines.get(p);
      if (!l) continue;
      const v = l.h * 2 + l.hr * 4 + l.rbi * 2;
      if (v > best) { best = v; mvp = `${p.name}（${l.h}安打${l.hr ? ` ${l.hr}本塁打` : ''} ${l.rbi}打点）`; }
    }
    const s = el(`<div class="screen dim">
      <div class="result-title">${title}</div>
      <div class="panel">
        <table class="linescore"><tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>計</th><th>安</th></tr>
        <tr><td class="nm">${st.away.team.short}</td>${cells(st.away.runs, false)}<td class="r">${st.score(st.away)}</td><td>${st.away.hits}</td></tr>
        <tr><td class="nm">${st.home.team.short}</td>${cells(st.home.runs, homeSkipped)}<td class="r">${st.score(st.home)}</td><td>${st.home.hits}</td></tr></table>
        ${best > 0 ? `<div class="howto" style="text-align:center;margin-top:8px">ヒーロー：<b>${mvp}</b></div>` : ''}
        <button class="big-btn" data-a="again">もう一試合</button>
        <button class="big-btn sub" data-a="title">タイトルへ</button>
      </div></div>`);
    parent.append(s);
    audio.bgm(diff > 0 ? 'win' : null, { loop: false });
    s.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => (b.onclick = () => { audio.play('ui_ok'); s.remove(); resolve(b.dataset.a as 'again' | 'title'); }));
  });
}

export function pauseMenu(parent: HTMLElement): Promise<'resume' | 'quit'> {
  return new Promise((resolve) => {
    const s = el(`<div class="menu"><div class="panel" style="width:min(320px,100%)"><h2>タイム</h2>
      <button class="big-btn" data-a="resume">試合にもどる</button>
      <button class="big-btn sub" data-a="quit">タイトルへ</button></div></div>`);
    parent.append(s);
    s.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => (b.onclick = () => { audio.play('ui_ok'); s.remove(); resolve(b.dataset.a as 'resume' | 'quit'); }));
  });
}
