// Wesnoth's own interface art (buttons, check boxes, panel texture), exposed
// to CSS as custom properties so the stylesheet works in every build.
import { asset } from '../lib/assets';

const KEYS = ['btn', 'btn-active', 'btn-pressed', 'sq', 'sq-active', 'sq-pressed', 'large', 'large-active', 'large-pressed', 'menu', 'menu-active', 'menu-pressed', 'check', 'check-on', 'panel-bg'];

export function installChrome() {
  const root = document.documentElement.style;
  for (const k of KEYS) root.setProperty(`--ui-${k}`, `url("${asset(`ui/${k}.png`)}")`);
}
