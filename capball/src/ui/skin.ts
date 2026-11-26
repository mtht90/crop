/**
 * 画面の部品（Kenney UI Pack のボタン・Kenney Game Icons のアイコン）。
 * 画像の場所はビルドの形（開発・アーティファクト）で変わるので、CSS 変数にして JS から渡す。
 */
const BASE = import.meta.env.BASE_URL + 'assets/ui/';

export const uiUrl = (name: string) => BASE + name;

/** Kenney の白いアイコン */
export const icon = (name: string, cls = '') => `<img class="kicon ${cls}" src="${uiUrl(`i_${name}.png`)}" alt="" draggable="false">`;

export function applySkin() {
  const r = document.documentElement.style;
  for (const c of ['yellow', 'red', 'green', 'blue', 'grey']) {
    r.setProperty(`--btn-${c}`, `url("${uiUrl(`btn_${c}.png`)}")`);
    r.setProperty(`--btn-${c}-down`, `url("${uiUrl(`btn_${c}_down.png`)}")`);
    r.setProperty(`--sq-${c}`, `url("${uiUrl(`sq_${c}.png`)}")`);
    r.setProperty(`--round-${c}`, `url("${uiUrl(`round_${c}.png`)}")`);
  }
  r.setProperty('--star-on', `url("${uiUrl('star.png')}")`);
  r.setProperty('--star-off', `url("${uiUrl('star_off.png')}")`);
  r.setProperty('--input', `url("${uiUrl('input.png')}")`);
}

/**
 * キャップのラベルに使う書体を先に読み込む（canvas に描く前に揃っていないと別の書体で描かれる）。
 * 日本語の書体は使う文字だけを取りに行く。
 */
export async function preloadCapFonts(text: string) {
  const fams = ['Dela Gothic One', 'RocknRoll One', 'Mochiy Pop One', 'Kaisei Decol', 'M PLUS Rounded 1c', 'Lobster', 'Bungee'];
  const chars = [...new Set(text)].join('');
  const jobs = fams.map((f) => document.fonts.load(`${f === 'M PLUS Rounded 1c' ? '900 ' : f === 'Kaisei Decol' ? '700 ' : ''}24px "${f}"`, chars).catch(() => []));
  jobs.push(document.fonts.load('800 24px "M PLUS Rounded 1c"', chars).catch(() => []));
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 5000))]);
}
