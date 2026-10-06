/**
 * Stage themes. Every stage shares the same arena layout and collision (floor,
 * edge, floating rocks); a theme only changes the look: sky, light, fog, colours
 * and the decoration around the ring.
 */
export interface StageTheme {
  id: string;
  name: string;
  /** Sky gradient stops (top to horizon). */
  sky: [number, string][];
  fog: number;
  hemi: [number, number, number];
  sun: [number, number];
  floor: 'star' | 'sakura' | 'deck';
  rim: [number, number];
  rockSide: number;
  grass: number;
  tree: number;
  foliage: 'pine' | 'sakura' | 'palm';
  tower: 'castle' | 'pagoda' | 'fort';
  waterfall: string;
  cloud: number;
  pads: [number, number];
  /** Banner poles (sky) or torii gates (sakura). */
  gates: 'banners' | 'torii' | 'pirate';
  /** Ocean far below with ships sailing around (CC0 Pirate Kit). */
  sea?: boolean;
  blimp: boolean;
  moon: boolean;
  petals: boolean;
  crowd: number[];
}

export const STAGES: Record<string, StageTheme> = {
  sky: {
    id: 'sky',
    name: '空中闘技場',
    sky: [[0, '#2f7ff0'], [0.45, '#69b4ff'], [0.62, '#bfe3ff'], [1, '#e8f6ff']],
    fog: 0xcde8ff,
    hemi: [0xdff1ff, 0xb3a58c, 1.5],
    sun: [0xfff4e0, 2.6],
    floor: 'star',
    rim: [0xffc93c, 0x4a5fc8],
    rockSide: 0x9a7f66,
    grass: 0x7bc950,
    tree: 0x3f8f4a,
    foliage: 'pine',
    tower: 'castle',
    waterfall: 'rgba(120,200,255,0.85)',
    cloud: 0xffffff,
    pads: [0xffc93c, 0x5a6fd8],
    gates: 'banners',
    blimp: true,
    moon: false,
    petals: false,
    crowd: [0xff8fb1, 0xffd166, 0x7fd4ff, 0x9be37a, 0xc49bff, 0xffa36c, 0xffffff],
  },
  sakura: {
    id: 'sakura',
    name: '夕桜の庭',
    sky: [[0, '#3b2a6b'], [0.35, '#b8569a'], [0.55, '#ff9a7a'], [0.66, '#ffd29a'], [1, '#fff0d6']],
    fog: 0xffc9a8,
    hemi: [0xffd9c4, 0x7a5a7a, 1.35],
    sun: [0xffb070, 2.4],
    floor: 'sakura',
    rim: [0xb8323a, 0x2d2a3a],
    rockSide: 0x7a6a72,
    grass: 0x8fae6a,
    tree: 0x5a3a2e,
    foliage: 'sakura',
    tower: 'pagoda',
    waterfall: 'rgba(255,190,200,0.8)',
    cloud: 0xffd6c8,
    pads: [0xb8323a, 0x2d2a3a],
    gates: 'torii',
    blimp: false,
    moon: true,
    petals: true,
    crowd: [0xffb7c5, 0xffe2a8, 0xf2f2f2, 0xd99ad0, 0xff8f8f, 0xc7b2ff],
  },
  pirate: {
    id: 'pirate',
    name: '海賊の入り江',
    sky: [[0, '#1477d6'], [0.4, '#3fb0f0'], [0.6, '#a8e6ff'], [1, '#e6fbff']],
    fog: 0xbfeaff,
    hemi: [0xe6f6ff, 0xc9a77a, 1.55],
    sun: [0xfff2d6, 2.8],
    floor: 'deck',
    rim: [0x8a5a34, 0x3a5f8a],
    rockSide: 0xc8925a,
    grass: 0xf2d59a,
    tree: 0x3f9f4a,
    foliage: 'palm',
    tower: 'fort',
    waterfall: 'rgba(120,220,255,0.85)',
    cloud: 0xffffff,
    pads: [0x8a5a34, 0xc8a070],
    gates: 'pirate',
    sea: true,
    blimp: false,
    moon: false,
    petals: false,
    crowd: [0xff6b5a, 0xffd166, 0x5ac8fa, 0xf2f2f2, 0x7be0a0, 0xffa36c],
  },
};

export const STAGE_IDS = Object.keys(STAGES);
