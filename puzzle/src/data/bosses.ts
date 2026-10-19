export type PartRole = 'body' | 'armL' | 'armR' | 'legL' | 'legR' | 'eye' | 'mouth' | 'back' | 'front';

export interface BossPart {
  tex: string;
  x: number;
  y: number;
  role: PartRole;
  scale?: number;
  rot?: number;
  flip?: boolean;
  /** Anchor in texture space (0..1). Defaults: arms/legs pivot at their top. */
  ax?: number;
  ay?: number;
}

export interface BossDef {
  id: string;
  name: string;
  bg: string;
  /** Primary tint used by UI and effects. */
  color: number;
  scale: number;
  parts: BossPart[];
  /** Mouth texture used when the boss is hit / shouts. */
  mouthHurt: string;
  mouthLaugh: string;
}

// Coordinates are in Kenney "double" texture pixels relative to the body center.
export const BOSSES: BossDef[] = [
  {
    id: 'poyogon', name: 'ポヨゴン', bg: 'backgroundColorGrass', color: 0xffc21a, scale: 0.62,
    mouthHurt: 'mouthG.png', mouthLaugh: 'mouthA.png',
    parts: [
      { tex: 'leg_yellowA.png', x: -70, y: 120, role: 'legL', ay: 0.1 },
      { tex: 'leg_yellowA.png', x: 70, y: 120, role: 'legR', ay: 0.1, flip: true },
      { tex: 'arm_yellowC.png', x: -150, y: 0, role: 'armL', ay: 0.08, ax: 0.62, rot: 0.25 },
      { tex: 'arm_yellowC.png', x: 150, y: 0, role: 'armR', ay: 0.08, ax: 0.62, rot: 0.25, flip: true },
      { tex: 'detail_yellow_ear_round.png', x: -125, y: -150, role: 'back', scale: 0.9 },
      { tex: 'detail_yellow_ear_round.png', x: 125, y: -150, role: 'back', scale: 0.9, flip: true },
      { tex: 'body_yellowB.png', x: 0, y: 0, role: 'body' },
      { tex: 'eye_cute_light.png', x: -72, y: -40, role: 'eye', scale: 0.62 },
      { tex: 'eye_cute_light.png', x: 72, y: -40, role: 'eye', scale: 0.62 },
      { tex: 'eye_cute_light.png', x: 0, y: -100, role: 'eye', scale: 0.55 },
      { tex: 'mouth_closed_teeth.png', x: 0, y: 60, role: 'mouth', scale: 0.9 },
    ],
  },
  {
    id: 'akamen', name: 'アカメン', bg: 'backgroundColorForest', color: 0xff4d6a, scale: 0.6,
    mouthHurt: 'mouthJ.png', mouthLaugh: 'mouthH.png',
    parts: [
      { tex: 'leg_redC.png', x: -60, y: 180, role: 'legL', ay: 0.1 },
      { tex: 'leg_redC.png', x: 60, y: 180, role: 'legR', ay: 0.1, flip: true },
      { tex: 'arm_whiteE.png', x: -150, y: -30, role: 'armL', ay: 0.08, rot: 0.15 },
      { tex: 'arm_whiteE.png', x: 150, y: -30, role: 'armR', ay: 0.08, rot: 0.15, flip: true },
      { tex: 'detail_red_horn_small.png', x: -90, y: -235, role: 'back', rot: -0.3 },
      { tex: 'detail_red_horn_small.png', x: 90, y: -235, role: 'back', rot: 0.3, flip: true },
      { tex: 'body_redE.png', x: 0, y: 0, role: 'body' },
      { tex: 'eye_cute_dark.png', x: 0, y: -90, role: 'eye', scale: 1.0 },
      { tex: 'eyebrowB.png', x: 0, y: -180, role: 'front', scale: 0.9 },
      { tex: 'mouth_closed_fangs.png', x: 0, y: 60, role: 'mouth' },
    ],
  },
  {
    id: 'bluebox', name: 'ブルブロック', bg: 'backgroundColorFall', color: 0x3bc9e8, scale: 0.6,
    mouthHurt: 'mouthG.png', mouthLaugh: 'mouthE.png',
    parts: [
      { tex: 'leg_blueB.png', x: -60, y: 130, role: 'legL', ay: 0.1 },
      { tex: 'leg_blueB.png', x: 60, y: 130, role: 'legR', ay: 0.1, flip: true },
      { tex: 'arm_blueA.png', x: -150, y: -20, role: 'armL', ay: 0.08, rot: 0.1 },
      { tex: 'arm_blueA.png', x: 150, y: -20, role: 'armR', ay: 0.08, rot: 0.1, flip: true },
      { tex: 'detail_blue_eye.png', x: -120, y: -200, role: 'back', rot: -0.4 },
      { tex: 'detail_blue_eye.png', x: 120, y: -200, role: 'back', rot: 0.4, flip: true },
      { tex: 'body_blueA.png', x: 0, y: 0, role: 'body' },
      { tex: 'nose_brown.png', x: 0, y: -30, role: 'front', scale: 0.9 },
      { tex: 'mouth_closed_teeth.png', x: 0, y: 70, role: 'mouth', scale: 0.85 },
    ],
  },
  {
    id: 'midorino', name: 'ミドリーノ', bg: 'backgroundColorDesert', color: 0x2ecc71, scale: 0.6,
    mouthHurt: 'mouthJ.png', mouthLaugh: 'mouthB.png',
    parts: [
      { tex: 'leg_greenD.png', x: -60, y: 190, role: 'legL', ay: 0.1 },
      { tex: 'leg_greenD.png', x: 60, y: 190, role: 'legR', ay: 0.1, flip: true },
      { tex: 'arm_greenD.png', x: -130, y: -20, role: 'armL', ay: 0.08, rot: 0.2 },
      { tex: 'arm_greenD.png', x: 130, y: -20, role: 'armR', ay: 0.08, rot: 0.2, flip: true },
      { tex: 'body_greenF.png', x: 0, y: 0, role: 'body' },
      { tex: 'eye_angry_red.png', x: 0, y: -90, role: 'eye', scale: 1.0 },
      { tex: 'mouthB.png', x: 0, y: 70, role: 'mouth', scale: 0.9 },
    ],
  },
  {
    id: 'darkhorn', name: 'ダークホーン', bg: 'backgroundCastles', color: 0x8a5cff, scale: 0.6,
    mouthHurt: 'mouthG.png', mouthLaugh: 'mouthI.png',
    parts: [
      { tex: 'leg_darkC.png', x: -75, y: 150, role: 'legL', ay: 0.1 },
      { tex: 'leg_darkC.png', x: 75, y: 150, role: 'legR', ay: 0.1, flip: true },
      { tex: 'arm_yellowD.png', x: -160, y: -10, role: 'armL', ay: 0.08, rot: 0.2 },
      { tex: 'arm_yellowD.png', x: 160, y: -10, role: 'armR', ay: 0.08, rot: 0.2, flip: true },
      { tex: 'detail_yellow_antenna_large.png', x: -60, y: -230, role: 'back', rot: -0.25 },
      { tex: 'detail_yellow_antenna_large.png', x: 60, y: -230, role: 'back', rot: 0.25, flip: true },
      { tex: 'detail_dark_ear.png', x: -160, y: -130, role: 'back', rot: -0.5 },
      { tex: 'detail_dark_ear.png', x: 160, y: -130, role: 'back', rot: 0.5, flip: true },
      { tex: 'body_darkD.png', x: 0, y: 0, role: 'body' },
      { tex: 'eye_angry_red.png', x: -65, y: -50, role: 'eye', scale: 0.6 },
      { tex: 'eye_angry_red.png', x: 65, y: -50, role: 'eye', scale: 0.6, flip: true },
      { tex: 'eyebrowA.png', x: -65, y: -105, role: 'front', scale: 0.6, rot: 0.25 },
      { tex: 'eyebrowA.png', x: 65, y: -105, role: 'front', scale: 0.6, rot: -0.25, flip: true },
      { tex: 'nose_yellow.png', x: 0, y: 15, role: 'front', scale: 0.6 },
      { tex: 'mouthF.png', x: 0, y: 95, role: 'mouth', scale: 0.8 },
    ],
  },
];

export function bossForLevel(lv: number): BossDef {
  return BOSSES[(lv - 1) % BOSSES.length];
}

export function bossHp(lv: number): number {
  return Math.round((26000 * Math.pow(1.24, lv - 1)) / 500) * 500;
}

/** Seconds between obstruction attacks; 0 = boss does not attack. */
export function bossAttackInterval(lv: number): number {
  if (lv < 2) return 0;
  return Math.max(8, 15 - lv * 0.6);
}

export function bossAttackCount(lv: number): number {
  return Math.min(2 + Math.floor(lv / 2), 7);
}

export function bossTex(): string[] {
  const set = new Set<string>();
  for (const b of BOSSES) {
    for (const p of b.parts) set.add(p.tex);
    set.add(b.mouthHurt);
    set.add(b.mouthLaugh);
  }
  return [...set];
}
