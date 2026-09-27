// 外部素材マニフェスト。
// すべての素材はコミット固定の GitHub raw URL から取得し、ライセンス・作者を CREDITS.md に出力する。
// 追加・差し替えはここに 1 行足して `npm run assets` を再実行するだけ。

const gh = (repo, sha) => `https://raw.githubusercontent.com/${repo}/${sha}`;

export const SOURCES = {
  kf: {
    base: gh('KayKit-Game-Assets/KayKit-Furniture-Bits-1.0', '96d5930a8dbdb363409bbc2d3341718b00e17c9c') + '/addons/kaykit_furniture_bits/Assets/gltf',
    title: 'KayKit : Furniture Bits 1.0', author: 'Kay Lousberg (kaylousberg.com)', license: 'CC0-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0',
  },
  kr: {
    base: gh('KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0', '153c8a7535b48237854cb54ff6890679f8c574d1') + '/addons/kaykit_restaurant_bits/Assets/gltf',
    title: 'KayKit : Restaurant Bits 1.0', author: 'Kay Lousberg (kaylousberg.com)', license: 'CC0-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0',
  },
  kc: {
    base: gh('KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0', '63976910ca04d16f0fc531b9c614244be8128713') + '/addons/kaykit_city_builder_bits/Assets/gltf',
    title: 'KayKit : City Builder Bits 1.0', author: 'Kay Lousberg (kaylousberg.com)', license: 'CC0-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0',
  },
  kp: {
    base: gh('KayKit-Game-Assets/KayKit-Prototype-Bits-1.0', 'bb159596f4f5106b663741d002c8eb45c80c0f41') + '/addons/kaykit_prototype_bits/Assets/gltf',
    title: 'KayKit : Prototype Bits 1.0', author: 'Kay Lousberg (kaylousberg.com)', license: 'CC0-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0',
  },
  ka: {
    base: gh('KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0', '672074b73ba276876a19e8816ecdc5241817ab47') + '/addons/kaykit_character_pack_adventures',
    title: 'KayKit : Character Pack Adventurers 1.0', author: 'Kay Lousberg (kaylousberg.com)', license: 'CC0-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',
  },
  kd: {
    base: gh('KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0', 'b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07') + '/addons/kaykit_dungeon_remastered/Assets/gltf',
    title: 'KayKit : Dungeon Remastered 1.0', author: 'Kay Lousberg (kaylousberg.com)', license: 'CC0-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0',
  },
  ks: {
    base: gh('KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0', '15b62b9bad122f72926c10fb14d622c73819fa54') + '/addons/kaykit_character_pack_skeletons',
    title: 'KayKit : Character Pack Skeletons 1.0', author: 'Kay Lousberg (kaylousberg.com)', license: 'CC0-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0',
  },
  kenCity: {
    base: gh('KenneyNL/Starter-Kit-City-Builder', '4535092b740b378b700efd9df9e27a631815b84a'),
    title: 'Kenney Starter Kit City Builder', author: 'Kenney (kenney.nl)', license: 'MIT (assets CC0)',
    url: 'https://github.com/KenneyNL/Starter-Kit-City-Builder',
  },
  kenBasic: {
    base: gh('KenneyNL/Starter-Kit-Basic-Scene', 'a6927e66ff8dd8e173660ce4825abe773c65f683') + '/sample/Mini%20Arena/Models/GLB%20format',
    title: 'Kenney Mini Arena (Starter Kit Basic Scene)', author: 'Kenney (kenney.nl)', license: 'MIT (assets CC0)',
    url: 'https://github.com/KenneyNL/Starter-Kit-Basic-Scene',
  },
  kenPlat: {
    base: gh('KenneyNL/Starter-Kit-3D-Platformer', '3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0'),
    title: 'Kenney Starter Kit 3D Platformer', author: 'Kenney (kenney.nl)', license: 'MIT (assets CC0)',
    url: 'https://github.com/KenneyNL/Starter-Kit-3D-Platformer',
  },
  kenRace: {
    base: gh('KenneyNL/Starter-Kit-Racing', '2f2e5f2646dda89cb21d4e8539bab60c6e955dc8'),
    title: 'Kenney Starter Kit Racing', author: 'Kenney (kenney.nl)', license: 'MIT (assets CC0)',
    url: 'https://github.com/KenneyNL/Starter-Kit-Racing',
  },
  kenFps: {
    base: gh('KenneyNL/Starter-Kit-FPS', '185fd2326d74a5cf858cffc616f87cf9696f9cc0'),
    title: 'Kenney Starter Kit FPS', author: 'Kenney (kenney.nl)', license: 'MIT (assets CC0)',
    url: 'https://github.com/KenneyNL/Starter-Kit-FPS',
  },
  kenM3: {
    base: gh('KenneyNL/Starter-Kit-Match-3', '4ddb3d2a50cbf247c79cafe9e7884d7d8f99c012'),
    title: 'Kenney Starter Kit Match-3', author: 'Kenney (kenney.nl)', license: 'MIT (assets CC0)',
    url: 'https://github.com/KenneyNL/Starter-Kit-Match-3',
  },
  khr: {
    base: gh('KhronosGroup/glTF-Sample-Assets', '7d4ba189827916452eeadc82d4b712dbc6280a6f') + '/Models',
    title: 'Khronos glTF Sample Assets', author: '各モデル参照', license: '各モデル参照',
    url: 'https://github.com/KhronosGroup/glTF-Sample-Assets',
  },
  three: {
    base: gh('mrdoob/three.js', '1af6de5bd8cd481993483dc6127eba668e818dfd') + '/examples',
    title: 'three.js examples', author: '各ファイル参照', license: '各ファイル参照',
    url: 'https://github.com/mrdoob/three.js',
  },
  drei: {
    base: gh('pmndrs/drei-assets', '456060a26bbeb8fdf79326f224b6d99b8bcce736') + '/hdri',
    title: 'Poly Haven HDRIs (via pmndrs/drei-assets)', author: 'Poly Haven (polyhaven.com)', license: 'CC0-1.0',
    url: 'https://polyhaven.com',
  },
  icons: {
    base: gh('game-icons/icons', '82d948812bfe3f269ef8f731dcdb07b08160edc4'),
    title: 'game-icons.net', author: 'Lorc, Delapouite, Skoll, Sbed, Caro Asercion 他', license: 'CC-BY-3.0',
    url: 'https://game-icons.net',
  },
};

// ---------- 3D モデル ----------
// type: 'gltf' = .gltf + .bin + テクスチャ, 'glb' = 単体 glb
// tex: テクスチャ最大解像度 (Khronos の実写系は重いので縮小)
const kk = (src, names, dir) => names.map((n) => ({ id: n, src, type: 'gltf', path: `${n}.gltf`, out: `${dir}/${n}.glb` }));

export const MODELS = [
  // 店舗の什器・内装
  ...kk('kf', ['shelf_A_big', 'shelf_A_small', 'shelf_B_large', 'shelf_B_large_decorated', 'shelf_B_small', 'table_medium_long', 'table_medium', 'rug_rectangle_stripes_A', 'rug_rectangle_A', 'rug_oval_B', 'couch', 'cactus_medium_B', 'pictureframe_large_B', 'pictureframe_small_B', 'book_set'], 'env'),
  ...kk('kr', ['wall', 'wall_doorway', 'wall_window_open', 'wall_window_closed', 'wall_half', 'wall_decorated', 'door_A', 'door_B', 'floor_kitchen', 'pillar_A', 'kitchencounter_straight_A', 'kitchencounter_straight_B', 'kitchentable_A', 'kitchentable_A_large', 'crate', 'crate_lid', 'shelf_papertowel', 'papertowel', 'menu', 'towelrail'], 'env'),
  ...kk('kc', ['base', 'road_straight', 'road_straight_crossing', 'road_junction', 'streetlight', 'bench', 'bush', 'trash_A', 'trash_B', 'firehydrant', 'dumpster', 'box_A', 'box_B', 'car_hatchback', 'car_sedan', 'car_stationwagon', 'car_taxi', 'car_police', 'building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'], 'env'),
  ...kk('kp', ['Box_A', 'Box_B', 'Pallet_Small', 'Barrel_A', 'Can_A', 'Coin_A'], 'env'),

  ...['floor_wood_large', 'floor_wood_large_dark', 'floor_wood_small', 'shelves', 'shelf_large', 'shelf_small', 'crates_stacked', 'box_large', 'box_stacked', 'barrel_large', 'table_long_tablecloth', 'table_medium_tablecloth', 'banner_patternA_red', 'banner_thin_yellow', 'pillar', 'torch_mounted'].map((n) => ({
    id: `kd_${n}`, src: 'kd', type: 'glb', path: `${n}.gltf.glb`, out: `env/kd_${n}.glb`,
  })),

  // 商品になる雑貨・家具・家電 (KayKit)
  ...['chest', 'chest_gold'].map((n) => ({ id: `kd_${n}`, src: 'kd', type: 'glb', path: `${n}.glb`, out: `items/kd_${n}.glb` })),
  ...['trunk_small_A', 'trunk_medium_B', 'barrel_small', 'keg', 'candle_triple', 'candle_thin', 'bottle_A_labeled_green', 'bottle_B_brown', 'bottle_C_green', 'keyring', 'coin_stack_medium', 'plate_stack', 'stool', 'sword_shield', 'box_small_decorated'].map((n) => ({
    id: `kd_${n}`, src: 'kd', type: 'glb', path: `${n}.gltf.glb`, out: `items/kd_${n}.glb`,
  })),
  ...kk('kf', ['armchair', 'armchair_pillows', 'chair_A', 'chair_A_wood', 'chair_B', 'chair_B_wood', 'chair_C', 'chair_stool_wood', 'couch_pillows', 'lamp_standing', 'lamp_table', 'cabinet_small', 'cabinet_small_decorated', 'cabinet_medium', 'book_single', 'pictureframe_large_A', 'pictureframe_medium', 'pictureframe_standing_A', 'pictureframe_standing_B', 'cactus_medium_A', 'cactus_small_A', 'cactus_small_B', 'pillow_A', 'pillow_B', 'rug_oval_A', 'table_small', 'table_low'], 'items'),
  ...kk('kr', ['pot_A', 'pot_B', 'pot_large', 'pan_A', 'pan_B', 'jar_A_large', 'jar_B_medium', 'jar_C_large', 'jar_D_medium', 'knife', 'cuttingboard', 'bowl', 'plate', 'dishrack_plates', 'stove_single', 'oven', 'fridge_A', 'fridge_B', 'lid_large', 'ketchup', 'mustard', 'chair_stool'], 'items'),
  ...['sword_1handed', 'sword_2handed_color', 'shield_round_color', 'shield_badge_color', 'staff', 'spellbook_closed', 'spellbook_open', 'mug_full', 'mug_empty', 'crossbow_1handed', 'dagger', 'axe_1handed', 'wand', 'quiver'].map((n) => ({
    id: n, src: 'ka', type: 'gltf', path: `Assets/gltf/${n}.gltf`, out: `items/${n}.glb`,
  })),
  ...['trophy', 'statue', 'banner', 'weapon-sword'].map((n) => ({ id: `ken_${n}`, src: 'kenBasic', type: 'glb', path: `${n}.glb`, out: `items/ken_${n}.glb` })),
  ...['coin', 'flag'].map((n) => ({ id: `ken_${n}`, src: 'kenPlat', type: 'glb', path: `models/${n}.glb`, out: `items/ken_${n}.glb` })),
  ...['vehicle-truck-red', 'vehicle-truck-yellow', 'vehicle-motorcycle'].map((n) => ({ id: `ken_${n}`, src: 'kenRace', type: 'glb', path: `models/${n}.glb`, out: `items/ken_${n}.glb` })),
  ...['blaster', 'blaster-repeater'].map((n) => ({ id: `ken_${n}`, src: 'kenFps', type: 'glb', path: `models/${n}.glb`, out: `items/ken_${n}.glb` })),
  ...['building-small-a', 'building-garage', 'pavement-fountain'].map((n) => ({ id: `ken_${n}`, src: 'kenCity', type: 'glb', path: `models/${n}.glb`, out: `items/ken_${n}.glb` })),

  // 高額・目玉商品 (Khronos 実写 PBR)
  ...[
    ['ChronographWatch', 'CC-BY-4.0', 'Eric Chadwick (ロゴ: Khronos/DGG)'],
    ['SunglassesKhronos', 'CC-BY-4.0', 'Eric Chadwick'],
    ['MaterialsVariantsShoe', 'CC-BY-4.0', 'Shopify'],
    ['AntiqueCamera', 'CC0-1.0', 'Maximillan Kamps'],
    ['BoomBox', 'CC0-1.0', 'Microsoft'],
    ['Lantern', 'CC0-1.0', 'sbtron / Frank Galligan'],
    ['WaterBottle', 'CC0-1.0', 'Microsoft'],
    ['Corset', 'CC0-1.0', 'Microsoft'],
    ['GlamVelvetSofa', 'CC-BY-4.0', 'Eric Chadwick'],
    ['SheenChair', 'CC0-1.0', 'Eric Chadwick'],
    ['ChairDamaskPurplegold', 'CC-BY-4.0', 'Eric Chadwick'],
    ['SpecularSilkPouf', 'CC-BY-4.0', 'Eric Chadwick'],
    ['IridescenceLamp', 'CC-BY-4.0', 'Eric Chadwick'],
    ['StainedGlassLamp', 'CC-BY-4.0', 'Eric Chadwick'],
    ['AnisotropyBarnLamp', 'CC-BY-4.0', 'Eric Chadwick'],
    ['GlassVaseFlowers', 'CC0-1.0', 'Eric Chadwick / Rico Cilliers'],
    ['GlassHurricaneCandleHolder', 'CC-BY-4.0', 'Eric Chadwick'],
    ['MosquitoInAmber', 'CC-BY-4.0', 'Loic Norgeot / Sketchfab'],
    ['ToyCar', 'CC0-1.0', 'Guido Odendahl / Eric Chadwick'],
    ['PotOfCoals', 'CC-BY-4.0', 'Eric Chadwick'],
    ['DiffuseTransmissionPlant', 'CC-BY-4.0', 'Eric Chadwick / Rico Cilliers'],
    ['SheenWoodLeatherSofa', 'CC-BY-4.0', 'Eric Chadwick / Fran Calvente'],
    ['CommercialRefrigerator', 'CC-BY-4.0', 'Eric Chadwick / Sean Thomas'],
  ].map(([n, license, author]) => ({
    id: `khr_${n}`, src: 'khr', ...(n === 'StainedGlassLamp' ? { type: 'gltf', path: `${n}/glTF-JPG-PNG/${n}.gltf` } : { type: 'glb', path: `${n}/glTF-Binary/${n}.glb` }), out: `${n === 'CommercialRefrigerator' ? 'env' : 'items'}/khr_${n}.glb`,
    tex: 1024, meshopt: true, license, author, url: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${n}`,
  })),

  // 客キャラクター (アニメーション入り)
  ...['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded'].map((n) => ({
    id: `char_${n}`, src: 'ka', type: 'glb', path: `Characters/gltf/${n}.glb`, out: `chars/${n}.glb`, tex: 512, stripAnims: true, meshopt: true,
  })),
  {
    id: 'char_anims', src: 'ka', type: 'glb', path: 'Characters/gltf/Knight.glb', out: 'chars/anims.glb', stripMeshes: true,
    keepAnims: ['Idle', 'Unarmed_Idle', 'Walking_A', 'Walking_B', 'Walking_C', 'Walking_Backwards', 'Running_A', 'Interact', 'PickUp', 'Use_Item',
      'Cheer', 'Hit_A', 'Hit_B', 'Sit_Chair_Down', 'Sit_Chair_Idle', 'Sit_Chair_StandUp', 'Jump_Full_Short', 'Throw', 'Unarmed_Pose', 'Block', 'Spellcast_Raise', 'Death_A'],
  },
  ...['Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior'].map((n) => ({
    id: `char_${n}`, src: 'ks', type: 'glb', path: `Characters/gltf/${n}.glb`, out: `chars/${n}.glb`, tex: 512, stripAnims: true, meshopt: true,
  })),
];

// ---------- そのまま使うファイル ----------
export const FILES = [
  // HDRI (Poly Haven CC0)
  ...['st_fagans_interior_1k', 'potsdamer_platz_1k', 'venice_sunset_1k', 'dikhololo_night_1k', 'empty_warehouse_01_1k', 'studio_small_03_1k'].map((n) => ({ src: 'drei', path: `${n}.hdr`, out: `hdri/${n}.hdr` })),
  // 効果音 (Kenney)
  ...['ambience', 'placement-a', 'placement-b', 'placement-c', 'placement-d', 'removal-a', 'removal-b', 'rotate', 'toggle'].map((n) => ({ src: 'kenCity', path: `sounds/${n}.ogg`, out: `audio/${n}.ogg` })),
  ...['coin', 'walking', 'land', 'jump', 'break'].map((n) => ({ src: 'kenPlat', path: `sounds/${n}.ogg`, out: `audio/plat-${n}.ogg` })),
  ...['weapon_change', 'walking'].map((n) => ({ src: 'kenFps', path: `sounds/${n}.ogg`, out: `audio/fps-${n}.ogg` })),
  ...['tile-land', 'tile-match', 'tile-swap'].map((n) => ({ src: 'kenM3', path: `sounds/${n}.ogg`, out: `audio/${n}.ogg` })),
  // BGM / UI 音 (three.js examples。Project Utopia は CC0 by congusbongus)
  { src: 'three', path: 'sounds/Project_Utopia.ogg', out: 'audio/bgm-project-utopia.ogg', license: 'CC0-1.0', author: 'congusbongus (OpenGameArt)' },
  { src: 'three', path: 'sounds/button-press.ogg', out: 'audio/button-press.ogg', license: 'MIT', author: 'three.js authors' },
  { src: 'three', path: 'sounds/button-release.ogg', out: 'audio/button-release.ogg', license: 'MIT', author: 'three.js authors' },
  // フォント (Lilita One, OFL)
  { src: 'kenPlat', path: 'fonts/lilita_one_regular.ttf', out: 'fonts/lilita_one_regular.ttf', license: 'SIL OFL 1.1', author: 'Juan Montoreano' },
  // UI アイコン (game-icons.net, CC-BY 3.0)
  ...[
    'lorc/magnifying-glass', 'delapouite/coins', 'lorc/cash', 'delapouite/price-tag', 'delapouite/shop', 'delapouite/broom', 'lorc/spanner',
    'lorc/scales', 'lorc/conversation', 'delapouite/calendar', 'lorc/sun', 'lorc/moon', 'delapouite/chart', 'delapouite/histogram',
    'delapouite/cardboard-box', 'delapouite/cardboard-box-closed', 'delapouite/thumb-up', 'delapouite/thumb-down', 'delapouite/angry-eyes',
    'delapouite/sparkles', 'delapouite/upgrade', 'delapouite/newspaper', 'delapouite/laptop', 'delapouite/money-stack', 'delapouite/piggy-bank',
    'delapouite/shopping-bag', 'delapouite/wallet', 'delapouite/person', 'delapouite/star-formation', 'delapouite/stars-stack', 'delapouite/trophy-cup',
    'delapouite/save', 'delapouite/exit-door', 'lorc/hand', 'lorc/trade', 'lorc/wooden-sign', 'lorc/stopwatch', 'lorc/spray', 'lorc/screwdriver',
    'delapouite/check-mark', 'sbed/cancel', 'delapouite/sofa', 'delapouite/toaster', 'delapouite/tv', 'delapouite/t-shirt', 'lorc/teapot',
    'skoll/chess-knight', 'skoll/pocket-watch', 'delapouite/diamond-ring', 'delapouite/photo-camera', 'delapouite/sword-brandish', 'delapouite/alarm-clock',
  ].map((p) => ({ src: 'icons', path: `${p}.svg`, out: `icons/${p.split('/')[1]}.svg`, author: p.split('/')[0] })),
];
