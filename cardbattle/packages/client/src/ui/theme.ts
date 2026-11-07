import { assetUrl } from '../assets/assets';

/**
 * UI素材（Kenney・LAYERLAB）とフォント（M PLUS Rounded 1c）を CSS 変数として登録する。
 * パスを JS から入れることで、どのフォルダに置いて配信しても画像が見つかるようにしている。
 */
const IMAGES: Record<string, string> = {
  panel: 'ui/panel_brown.png',
  'panel-light': 'ui/panel_beige.png',
  'panel-inset': 'ui/panel_inset_brown.png',
  'btn-beige': 'ui/button_beige.png',
  'btn-beige-pressed': 'ui/button_beige_pressed.png',
  'btn-blue': 'ui/button_blue.png',
  'btn-blue-pressed': 'ui/button_blue_pressed.png',
  'btn-brown': 'ui/button_brown.png',
  'btn-brown-pressed': 'ui/button_brown_pressed.png',
  'bar-back': 'ui/bar_back_m.png',
  'bar-blue': 'ui/bar_blue_m.png',
  'bar-red': 'ui/bar_red_m.png',
  'bar-yellow': 'ui/bar_yellow_m.png',
  'border-frame': 'ui/border_frame.png',
  'star-yellow': 'ui/star_yellow.png',
  'star-blue': 'ui/star_blue.png',
  'star-red': 'ui/star_red.png',
  'star-grey': 'ui/star_grey.png',
  'card-bg': 'cards/frame_bg.png',
};

export async function applyTheme(available: boolean): Promise<void> {
  const root = document.documentElement;
  if (!available) return;
  root.classList.add('themed');
  // CSS 変数の中の相対URLはスタイルシートの場所から解決されてしまうので、ページ基準の絶対URLにする
  const abs = (rel: string) => new URL(assetUrl(rel), document.baseURI).href;
  for (const [k, v] of Object.entries(IMAGES)) root.style.setProperty(`--img-${k}`, `url("${abs(v)}")`);
  const fonts = [
    new FontFace('M PLUS Rounded 1c', `url("${assetUrl('fonts/MPLUSRounded1c-Bold.woff2')}")`, { weight: '700' }),
    new FontFace('M PLUS Rounded 1c', `url("${assetUrl('fonts/MPLUSRounded1c-ExtraBold.woff2')}")`, { weight: '800' }),
  ];
  await Promise.all(
    fonts.map(async (f) => {
      try {
        document.fonts.add(await f.load());
      } catch {
        /* フォントが無ければ端末のフォントのまま */
      }
    }),
  );
}
