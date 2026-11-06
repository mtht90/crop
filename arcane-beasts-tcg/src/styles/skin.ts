// ============================================================================
// Button skins: picture frames from free (CC0) packs, stretched with 9-slice
// border images. The pictures' URLs go into CSS variables here, so the same
// stylesheet works on the site and in the single-file Artifact build.
//   • GUI Buttons (OpenGameArt, CC0): the gold, glass, red, grey and wood frames
//   • Golden UI by Buch (OpenGameArt, CC0): the pixel-art tabs and round buttons
// ============================================================================
import { asset } from '../lib/assets';

const SKINS = ['gold', 'blue', 'green', 'purple', 'crimson', 'red', 'grey', 'wood', 'px-tab', 'px-tab-on', 'px-tab-off', 'px-round-blue', 'px-round-green', 'px-round-red'];

export function installSkins() {
  const root = document.documentElement.style;
  for (const k of SKINS) root.setProperty(`--skin-${k}`, `url("${new URL(asset(`ui/btn/${k}.png`), location.href).href}")`);
}
