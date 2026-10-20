import { Container, Graphics, Sprite } from 'pixi.js';
import { App } from '../core/App';
import { Sound } from '../core/Audio';
import { Button, panel, popIn, txt } from '../core/UI';
import { obstacleTexture, type ObstacleArt } from '../art/PieceArt';
import { GIMMICKS, type GimmickId } from '../data/gimmicks';

/** Obstructions that throw something at the pieces show that thing as their icon. */
const ART: Partial<Record<GimmickId, ObstacleArt>> = {
  rock: 'rock', hardRock: 'hardrock', bigRock: 'grave', junk: 'bone_a', ice: 'crystal', bubble: 'qbox',
  skullBomb: 'bomb', curse: 'skull', web: 'shackle', slime: 'anchor', chameleon: 'qbox',
};
/** The rest get a one-kanji badge: purple for board effects, red for attacks on the player. */
const GLYPH: Partial<Record<GimmickId, string>> = {
  dark: '闇', mono: '灰', ink: '墨', invisible: '透', seal: '封', min4: '4', weak: '滑', quake: '揺', wind: '風',
  float: '浮', tilt: '傾', freeze: '凍', shuffle: '混',
  timeSteal: '時', timeFast: '速', skillDrain: '減', feverDrain: '熱', barrier: '盾', skillSeal: '封', comboBreak: '断',
};
const PLAYER: GimmickId[] = ['timeSteal', 'timeFast', 'skillDrain', 'feverDrain', 'barrier', 'skillSeal', 'comboBreak'];

export function gimmickIcon(id: GimmickId, size: number): Container {
  const c = new Container();
  const art = ART[id];
  if (art) {
    c.addChild(new Graphics().circle(0, 0, size / 2).fill(0xfff4dc).stroke({ width: 3, color: 0x8a5a2a }));
    const s = new Sprite(obstacleTexture(art));
    s.anchor.set(0.5);
    s.scale.set((size * 0.92) / Math.max(1, s.texture.width));
    c.addChild(s);
  } else {
    const col = PLAYER.includes(id) ? 0xd81b60 : 0x7a4dff;
    c.addChild(new Graphics().circle(0, 0, size / 2).fill(col).stroke({ width: 3, color: 0xffffff }));
    const t = txt(GLYPH[id] ?? '?', { size: size * 0.56, color: 0xffffff });
    t.y = -1;
    c.addChild(t);
  }
  return c;
}

/**
 * A row of obstruction chips that fits in `maxW`: icon + name when they all fit, icons only otherwise.
 * Tapping the row opens the full list with explanations.
 */
export function gimmickChips(ids: GimmickId[], maxW: number, parent: () => Container): Container {
  const row = new Container();
  if (!ids.length) {
    row.addChild(txt('妨害なし', { size: 22, color: 0xd8c8ff, anchor: [0, 0.5] }));
    return row;
  }
  const names = ids.map((id) => txt(GIMMICKS[id].name, { size: 19, color: 0xffffff, anchor: [0, 0.5] }));
  const full = names.reduce((w, n) => w + 30 + n.width + 14 + 6, 0) - 6;
  let x = 0;
  if (full <= maxW) {
    // everything fits: icon + name chips
    ids.forEach((id, i) => {
      const w = 30 + names[i].width + 14;
      const g = new Graphics().roundRect(x, -17, w, 34, 17).fill({ color: 0x000000, alpha: 0.3 });
      const icon = gimmickIcon(id, 34);
      icon.position.set(x + 15, 0);
      names[i].position.set(x + 36, -1);
      row.addChild(g, icon, names[i]);
      x += w + 6;
    });
  } else {
    // too many: icons only, then a hint that the row opens the details
    for (const n of names) n.destroy();
    const hint = txt('くわしく', { size: 18, color: 0xffd23f, anchor: [0, 0.5] });
    const fit = Math.max(1, Math.floor((maxW - hint.width - 12) / 40));
    const shown = ids.slice(0, ids.length > fit ? fit - 1 : fit);
    for (const id of shown) {
      const icon = gimmickIcon(id, 36);
      icon.position.set(x + 18, 0);
      row.addChild(icon);
      x += 40;
    }
    if (shown.length < ids.length) {
      const t = txt(`+${ids.length - shown.length}`, { size: 20, color: 0xffffff });
      t.position.set(x + 18, -1);
      row.addChild(new Graphics().circle(x + 18, 0, 18).fill({ color: 0xffffff, alpha: 0.2 }), t);
      x += 40;
    }
    hint.position.set(x + 6, -1);
    row.addChild(hint);
  }
  row.eventMode = 'static';
  row.cursor = 'pointer';
  row.on('pointertap', () => openGimmickList(parent(), ids));
  return row;
}

/** Every obstruction of a boss, with what it does. */
export function openGimmickList(parent: Container, ids: GimmickId[]): void {
  const ov = new Container();
  const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.6 });
  dim.eventMode = 'static';
  dim.on('pointertap', () => ov.destroy({ children: true }));
  const box = new Container();
  box.eventMode = 'static';
  const rowH = 84;
  const h = 150 + ids.length * rowH + 120;
  box.position.set(360, App.H * 0.47);
  box.scale.set(Math.min(1, (App.H - 80) / h));
  const title = txt('このボスの妨害', { size: 40, color: 0xff4f8f, stroke: 0xffffff, strokeWidth: 8 });
  title.y = -h / 2 + 58;
  box.addChild(panel(620, h), title);
  ids.forEach((id, i) => {
    const y = -h / 2 + 140 + i * rowH;
    const g = GIMMICKS[id];
    const icon = gimmickIcon(id, 56);
    icon.position.set(-240, y);
    const nm = txt(g.name, { size: 26, color: 0x4a2f7a, anchor: [0, 0.5] });
    nm.position.set(-196, y - 18);
    const ds = txt(g.desc, { size: 20, color: 0x7a6a9a, weight: '500', anchor: [0, 0.5] });
    ds.position.set(-196, y + 16);
    if (ds.width > 470) ds.scale.set(470 / ds.width);
    box.addChild(icon, nm, ds);
  });
  const ok = new Button({ w: 240, h: 84, label: 'OK', color: 'pink', onTap: () => ov.destroy({ children: true }) });
  ok.y = h / 2 - 64;
  box.addChild(ok);
  ov.addChild(dim, box);
  parent.addChild(ov);
  popIn(box, 0, 0.5);
  Sound.play('ui_tap');
}
