import { setNotation, type Notation } from '../../core/format';
import { clearStorage, exportSave, importSave, saveToStorage } from '../../core/save';
import { defaultState } from '../../core/state';
import { button, h } from '../dom';
import { modal, toast } from '../fx';
import type { Tab } from './tab';

function toggle(label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
  const box = h('input', { attrs: { type: 'checkbox' } });
  box.checked = get();
  box.addEventListener('change', () => set(box.checked));
  return h('label', { class: 'check' }, box, h('span', { text: label }));
}

export const settingsTab: Tab = {
  id: 'settings',
  label: '設定',
  icon: '🛠️',
  visible: () => true,
  mount(root, g) {
    const st = g.s.settings;
    const notation = h('select');
    const opts: Array<[Notation, string]> = [['jp', '日本式 (万・億・兆…)'], ['short', '英語略記 (K, M, B…)'], ['sci', '指数表記 (1.23e45)'], ['eng', '工学表記 (12.3e45)']];
    for (const [v, label] of opts) notation.append(h('option', { text: label, attrs: { value: v } }));
    notation.value = st.notation;
    notation.addEventListener('change', () => {
      st.notation = notation.value as Notation;
      setNotation(st.notation);
    });
    const autosave = h('select');
    for (const sec of [10, 30, 60, 120]) autosave.append(h('option', { text: `${sec} 秒ごと`, attrs: { value: String(sec) } }));
    autosave.value = String(st.autosaveSec);
    autosave.addEventListener('change', () => {
      st.autosaveSec = Number(autosave.value);
    });

    const area = h('textarea', { class: 'save-area', attrs: { rows: '4', placeholder: 'ここにセーブデータを貼り付けてインポート', spellcheck: 'false' } });
    const exportBtn = button('エクスポート', async () => {
      area.value = exportSave(g.s);
      g.flags.add('export');
      area.select();
      try {
        await navigator.clipboard.writeText(area.value);
        toast('セーブデータをクリップボードにコピーしました', 'good');
      } catch {
        toast('セーブデータを下の欄に出力しました', 'info');
      }
    });
    const downloadBtn = button('ファイルに保存', () => {
      const blob = new Blob([exportSave(g.s)], { type: 'text/plain' });
      const a = h('a', { attrs: { href: URL.createObjectURL(blob), download: `stellar-frontier-${new Date().toISOString().slice(0, 10)}.txt` } });
      a.click();
      URL.revokeObjectURL(a.href);
      g.flags.add('export');
    });
    const importBtn = button('インポート', async () => {
      if (!area.value.trim()) {
        toast('セーブデータを貼り付けてください', 'warn');
        return;
      }
      try {
        const state = importSave(area.value);
        const ok = await modal({ title: 'インポート', body: '現在の進行を上書きします。よろしいですか?', ok: '上書きする', danger: true });
        if (!ok) return;
        g.load(state);
        setNotation(g.s.settings.notation);
        saveToStorage(g.s);
        toast('インポートしました', 'good');
      } catch {
        toast('セーブデータを読み込めませんでした', 'warn');
      }
    }, 'btn btn-primary');
    const saveBtn = button('今すぐセーブ', () => {
      g.s.lastTick = g.now();
      if (saveToStorage(g.s)) toast('セーブしました', 'good');
      else toast('セーブに失敗しました (ブラウザの保存領域を確認してください)', 'warn');
    });
    const resetBtn = button('完全リセット', async () => {
      const ok = await modal({ title: '⚠️ 完全リセット', body: '全ての進行・実績・研究・遺物が消えます。本当によろしいですか?', ok: '全て消す', danger: true });
      if (!ok) return;
      const ok2 = await modal({ title: '最終確認', body: 'この操作は取り消せません。', ok: 'リセットする', danger: true });
      if (!ok2) return;
      clearStorage();
      g.load(defaultState(g.now()));
      setNotation(g.s.settings.notation);
      toast('新しい宇宙が始まりました', 'info');
    }, 'btn btn-danger');

    root.append(
      h('div', { class: 'panel' },
        h('h3', { text: '表示' }),
        h('label', { class: 'field' }, h('span', { text: '数値の表記' }), notation),
        toggle('クリック時に獲得量を表示する', () => st.floatingText, (v) => { st.floatingText = v; }),
        toggle('演出を控えめにする (背景アニメーション停止)', () => st.lowFx, (v) => { st.lowFx = v; }),
        toggle('転生の前に確認する', () => st.confirmPrestige, (v) => { st.confirmPrestige = v; }),
        toggle('放置報酬をポップアップで表示する', () => st.offlinePopup, (v) => { st.offlinePopup = v; }),
      ),
      h('div', { class: 'panel' },
        h('h3', { text: 'セーブ' }),
        h('label', { class: 'field' }, h('span', { text: '自動セーブ' }), autosave),
        h('div', { class: 'toolbar wrap' }, saveBtn, exportBtn, downloadBtn, importBtn),
        area,
        h('p', { class: 'hint', text: 'セーブデータはこのブラウザ内に保存されます。別の端末へ移すときや念のためのバックアップに、エクスポートを使ってください。' }),
      ),
      h('div', { class: 'panel danger-zone' }, h('h3', { text: '危険な操作' }), resetBtn),
      h('div', { class: 'panel' },
        h('h3', { text: '遊び方' }),
        h('ul', { class: 'howto' },
          h('li', { text: '中央の星をクリックして星屑を集め、施設を建てて自動で生産しましょう。' }),
          h('li', { text: '施設を一定数そろえると強化アップグレードが現れます。' }),
          h('li', { text: '時々画面を横切る彗星をクリックすると、強力なボーナスが得られます。' }),
          h('li', { text: '1兆の星屑を稼ぐと「超新星」で転生でき、星核を得て永続的に強くなれます。' }),
          h('li', { text: 'さらに先には銀河崩壊・ビッグクランチ・多元宇宙転生が待っています。' }),
          h('li', { text: '研究と遠征は現実の時間で進みます。ページを閉じていても大丈夫。' }),
        ),
      ),
    );
  },
  update() {},
};
