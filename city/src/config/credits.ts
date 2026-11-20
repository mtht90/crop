// クレジット（設定 → クレジット に表示）。アイコンの作者は src/generated/icons.ts から自動で足される。
export interface CreditEntry {
  title: string;
  author: string;
  url: string;
  license: string;
  note?: string;
}

export const CREDITS: CreditEntry[] = [
  {
    title: 'Low Poly City Builder Asset Pack（無料版）',
    author: 'dglopez',
    url: 'https://dglopez.itch.io/low-poly-city-builder-asset-pack-65-free-3d-models',
    license: '作者のライセンス（ゲームに組み込んでの利用のみ。素材単体の再配布禁止）',
    note: '3Dの建物・道路・地面・木',
  },
  {
    title: 'Bliss GUI',
    author: 'Prinbles',
    url: 'https://prinbles.itch.io/',
    license: '個人・商用利用可、転売不可',
    note: 'ボタン・パネルなどのUI',
  },
  {
    title: 'Shapeforms Audio Free Sound Effects',
    author: 'Shapeforms Audio',
    url: 'https://shapeforms.itch.io/shapeforms-audio-free-sfx',
    license: 'Shapeforms Audio License Agreement（商用可、クレジット任意、単体での再配布禁止）',
    note: '効果音',
  },
  {
    title: 'Minigame Music Pack [FREE]',
    author: 'JDSherbert',
    url: 'https://jdsherbert.itch.io/minigame-music-pack',
    license: 'JDSherbert Terms & Conditions（商用可・ロイヤリティフリー）',
    note: 'BGM：Beach Vibes / Smooth Driving / Streetlights',
  },
  {
    title: 'Casual/Mobile/Platformer Music Pack（無料版）',
    author: 'SunixMuz',
    url: 'https://www.youtube.com/@SunixMuz',
    license: 'Music by SunixMuz, licensed under CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）',
    note: 'BGM：Bird Town / Chill Together',
  },
  {
    title: 'M PLUS Rounded 1c',
    author: 'M+ Fonts Project',
    url: 'https://fonts.google.com/specimen/M+PLUS+Rounded+1c',
    license: 'SIL Open Font License 1.1',
    note: '文字',
  },
  {
    title: 'three.js',
    author: 'three.js authors',
    url: 'https://threejs.org/',
    license: 'MIT License',
  },
];

/** Game-icons.net の作者のページ */
export const ICON_AUTHORS: Record<string, { name: string; url: string }> = {
  lorc: { name: 'Lorc', url: 'https://lorcblog.blogspot.com/' },
  delapouite: { name: 'Delapouite', url: 'https://delapouite.com/' },
  skoll: { name: 'Skoll', url: 'https://game-icons.net/' },
  sbed: { name: 'Sbed', url: 'https://opengameart.org/content/95-game-icons' },
};
