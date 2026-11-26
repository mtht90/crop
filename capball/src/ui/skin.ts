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
