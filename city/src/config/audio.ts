// 使う音。import-assets が zip から取り出して mp3 に変換し、パックにまとめる。
// SE：Shapeforms Audio Free Sound Effects / BGM：JDSherbert Minigame Music Pack・SunixMuz Casual Music Pack 無料版
export const SFX = {
  click: { zip: 'Shapeforms', file: 'Holographic Tap Interaction.wav', maxSec: 0.8 },
  tab: { zip: 'Shapeforms', file: 'Tablet_Tap_07.wav', maxSec: 0.6 },
  open: { zip: 'Shapeforms', file: 'Hologram Menu Open-2.wav', maxSec: 1.0 },
  buy: { zip: 'Shapeforms', file: 'Coin Dropped on Wood Rattle.wav', maxSec: 1.5 },
  bigBuy: { zip: 'Shapeforms', file: 'Coins In Sack Dropped on Wood.wav', maxSec: 1.8 },
  error: { zip: 'Shapeforms', file: 'Error Triplet-5.wav', maxSec: 1.0 },
  event: { zip: 'Shapeforms', file: 'UI Message Appear 01.wav', maxSec: 1.5 },
  complete: { zip: 'Shapeforms', file: 'Glyph Activation Light 01.wav', maxSec: 2.0 },
  research: { zip: 'Shapeforms', file: 'Arcane Symbol Activate 01.wav', maxSec: 2.5 },
  income: { zip: 'Shapeforms', file: 'Coin Slid Along Wood.wav', maxSec: 1.2 },
} as const;

export type SfxKey = keyof typeof SFX;

/** BGM。昼と夜で流す曲を分ける */
export const BGM = [
  { id: 'beach', zip: 'JDSherbert', file: 'JDSherbert - Minigame Music Pack - Beach Vibes.mp3', when: 'day', title: 'Beach Vibes', author: 'JDSherbert' },
  { id: 'driving', zip: 'JDSherbert', file: 'JDSherbert - Minigame Music Pack - Smooth Driving.mp3', when: 'day', title: 'Smooth Driving', author: 'JDSherbert' },
  { id: 'birdtown', zip: 'Casual-mobile', file: 'SunixMuz - Bird Town (FREE CCBY).mp3', when: 'day', title: 'Bird Town', author: 'SunixMuz' },
  { id: 'streetlights', zip: 'JDSherbert', file: 'JDSherbert - Minigame Music Pack - Streetlights.mp3', when: 'night', title: 'Streetlights', author: 'JDSherbert' },
  { id: 'chill', zip: 'Casual-mobile', file: 'SunixMuz - Chill Together (FREE CCBY).mp3', when: 'night', title: 'Chill Together', author: 'SunixMuz' },
] as const;
