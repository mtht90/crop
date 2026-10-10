// ゲーム内に表示するクレジット（CREDITS.md と同じ内容）

export interface CreditEntry {
  what: string;
  title: string;
  author: string;
  license: string;
  url: string;
}

export const CREDITS: CreditEntry[] = [
  {
    what: 'スロット絵柄',
    title: 'Slot Machine Resource Pack',
    author: 'Molly "Cougarmint" Willits',
    license: 'CC-BY 3.0',
    url: 'https://opengameart.org/content/slot-machine-resource-pack',
  },
  {
    what: 'BGM',
    title: 'Backup Plan',
    author: 'Zane Little Music',
    license: 'CC0',
    url: 'https://opengameart.org/content/backup-plan',
  },
  {
    what: '効果音',
    title: 'Casino Audio / Interface Sounds / Impact Sounds / Digital Audio / Music Jingles',
    author: 'Kenney (kenney.nl)',
    license: 'CC0',
    url: 'https://kenney.nl/assets',
  },
  {
    what: '背景・映り込み (HDRI)',
    title: 'Warm Bar / Studio Small 09',
    author: 'Poly Haven',
    license: 'CC0',
    url: 'https://polyhaven.com/hdris',
  },
  {
    what: '3Dモデル',
    title: 'Treasure Chest / Bar Chair Round 01',
    author: 'Poly Haven',
    license: 'CC0',
    url: 'https://polyhaven.com/models',
  },
  {
    what: 'PBRテクスチャ',
    title: 'Metal051A, Metal009, Metal048A, DiamondPlate008A, Plastic006, Plastic010, Plastic015A, Carpet015',
    author: 'ambientCG',
    license: 'CC0',
    url: 'https://ambientcg.com',
  },
  {
    what: 'フォント',
    title: 'Orbitron / M PLUS Rounded 1c',
    author: 'Matt McInerney / The Rounded M+ Project Authors',
    license: 'SIL OFL 1.1',
    url: 'https://fontsource.org',
  },
  {
    what: 'ライブラリ',
    title: 'three.js / Rapier (@dimforge/rapier3d-compat)',
    author: 'three.js authors / Dimforge',
    license: 'MIT / Apache-2.0',
    url: 'https://threejs.org',
  },
];
