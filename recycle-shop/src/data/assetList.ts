import { ITEMS } from './items';

/** 起動時に読み込む環境モデル */
export const ENV_MODELS = [
  'env/shelf_B_large.glb', 'env/kd_table_long_tablecloth.glb', 'items/cabinet_medium.glb', 'env/rug_rectangle_stripes_A.glb',
  'env/kitchencounter_straight_A.glb', 'env/kitchencounter_straight_B.glb', 'env/rug_rectangle_A.glb', 'env/menu.glb',
  'env/kitchentable_A_large.glb', 'env/papertowel.glb', 'env/towelrail.glb', 'env/kd_crates_stacked.glb', 'env/Box_A.glb', 'env/Box_B.glb',
  'env/cactus_medium_B.glb', 'env/couch.glb', 'env/khr_CommercialRefrigerator.glb', 'env/kd_floor_wood_large.glb', 'env/kd_floor_wood_large_dark.glb',
  'env/wall_window_open.glb', 'env/wall_window_closed.glb', 'env/wall_doorway.glb', 'env/wall.glb', 'env/wall_decorated.glb', 'env/door_A.glb',
  'env/kd_banner_thin_yellow.glb', 'env/base.glb', 'env/road_straight.glb', 'env/road_straight_crossing.glb',
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((b) => `env/building_${b}.glb`),
  'env/streetlight.glb', 'env/bush.glb', 'env/bench.glb', 'env/firehydrant.glb', 'env/dumpster.glb',
  ...['car_hatchback', 'car_sedan', 'car_stationwagon', 'car_taxi', 'car_police'].map((c) => `env/${c}.glb`),
  ...['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded', 'Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior', 'anims'].map((c) => `chars/${c}.glb`),
];

export const ALL_MODELS = [...new Set([...ENV_MODELS, ...ITEMS.map((i) => i.model)])];

export const ICONS = [
  'magnifying-glass', 'coins', 'cash', 'price-tag', 'shop', 'broom', 'spanner', 'scales', 'conversation', 'calendar', 'sun', 'moon', 'chart',
  'histogram', 'cardboard-box', 'cardboard-box-closed', 'thumb-up', 'thumb-down', 'angry-eyes', 'sparkles', 'upgrade', 'newspaper', 'laptop',
  'money-stack', 'piggy-bank', 'shopping-bag', 'wallet', 'person', 'star-formation', 'stars-stack', 'trophy-cup', 'save', 'exit-door', 'hand',
  'trade', 'wooden-sign', 'stopwatch', 'spray', 'screwdriver', 'check-mark', 'cancel', 'sofa', 'toaster', 'tv', 't-shirt', 'teapot',
  'chess-knight', 'pocket-watch', 'diamond-ring', 'photo-camera', 'sword-brandish', 'alarm-clock',
];
