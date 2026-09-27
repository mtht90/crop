export type CategoryId = 'appliance' | 'furniture' | 'kitchen' | 'brand' | 'hobby' | 'antique';
/** S: 棚・ショーケース / M: 陳列台 / L: 床展示 1 枠 / XL: 床展示まるごと */
export type SizeClass = 'S' | 'M' | 'L' | 'XL';

export interface CategoryDef {
  id: CategoryId;
  name: string;
  icon: string;
  color: string;
  /** 基準のトレンド変動幅 */
  volatility: number;
}

export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  appliance: { id: 'appliance', name: '家電', icon: 'tv', color: '#4fb3ff', volatility: 0.05 },
  furniture: { id: 'furniture', name: '家具・インテリア', icon: 'sofa', color: '#c58b4e', volatility: 0.03 },
  kitchen: { id: 'kitchen', name: 'キッチン・日用品', icon: 'teapot', color: '#8bd17c', volatility: 0.02 },
  brand: { id: 'brand', name: 'ブランド・ファッション', icon: 'diamond-ring', color: '#e8c35a', volatility: 0.07 },
  hobby: { id: 'hobby', name: 'ホビー・おもちゃ', icon: 'chess-knight', color: '#ff7b9c', volatility: 0.06 },
  antique: { id: 'antique', name: '骨董・美術品', icon: 'pocket-watch', color: '#b48cff', volatility: 0.05 },
};

/** 偽物判定に使う「本物の仕様」 */
export interface AuthSpec {
  brand: string;
  /** 刻印の正しい表記 */
  mark: string;
  /** 偽物でよくある誤表記 */
  fakeMarks: string[];
  /** シリアル書式: 例 'CV-####-@' (#=数字, @=チェック文字) */
  serial: string;
  /** 本物の重量 (g) */
  weight: number;
}

export interface ItemDef {
  id: string;
  name: string;
  category: CategoryId;
  model: string;
  /** 表示サイズ (m) */
  size: number;
  fit?: 'max' | 'y' | 'xz';
  sizeClass: SizeClass;
  /** 状態 S・付属品完備・相場 1.0 のときの基準価格 */
  base: number;
  /** 持ち込まれやすさ */
  weight: number;
  /** 電源・動作確認がある */
  electronic?: boolean;
  auth?: AuthSpec;
  /** 付属品 (箱・説明書など) が価値に影響する */
  accessories?: string[];
  /** 解放に必要な店舗レベル */
  level: number;
  flavor: string;
  /** モデルの向き補正 (Y 回転) */
  rotY?: number;
  /** 表示用の Y オフセット (m) */
  lift?: number;
}

const I = (d: ItemDef) => d;

export const ITEMS: ItemDef[] = [
  // ───── 家電 ─────
  I({ id: 'boombox', name: 'レトロラジカセ', category: 'appliance', model: 'items/khr_BoomBox.glb', size: 0.42, sizeClass: 'S', base: 9800, weight: 8, electronic: true, accessories: ['取扱説明書'], level: 1, flavor: '80年代に一世を風靡したステレオラジカセ。カセットが今また人気。' }),
  I({ id: 'lamp_table', name: 'テーブルランプ', category: 'appliance', model: 'items/lamp_table.glb', size: 0.42, sizeClass: 'S', base: 2800, weight: 10, electronic: true, level: 1, flavor: 'やわらかい光のシンプルなランプ。' }),
  I({ id: 'barn_lamp', name: 'インダストリアルランプ', category: 'appliance', model: 'items/khr_AnisotropyBarnLamp.glb', size: 0.36, sizeClass: 'S', base: 8800, weight: 5, electronic: true, level: 2, flavor: '倉庫風インテリアに合う金属シェードのランプ。' }),
  I({ id: 'iri_lamp', name: 'デザイナーズランプ', category: 'appliance', model: 'items/khr_IridescenceLamp.glb', size: 0.44, sizeClass: 'S', base: 36000, weight: 2, electronic: true, accessories: ['元箱', '保証書'], level: 3, flavor: '玉虫色に輝くガラスシェード。北欧デザイナーの作品。' }),
  I({ id: 'lamp_standing', name: 'フロアランプ', category: 'appliance', model: 'items/lamp_standing.glb', size: 1.55, fit: 'y', sizeClass: 'L', base: 5200, weight: 6, electronic: true, level: 1, flavor: 'リビングの隅に置きたい背の高いランプ。' }),
  I({ id: 'stove', name: '電気コンロ', category: 'appliance', model: 'items/stove_single.glb', size: 0.85, sizeClass: 'L', base: 7800, weight: 5, electronic: true, accessories: ['取扱説明書'], level: 1, flavor: '一口タイプの据え置き電気コンロ。' }),
  I({ id: 'oven', name: 'オーブンレンジ', category: 'appliance', model: 'items/oven.glb', size: 0.95, sizeClass: 'L', base: 19800, weight: 4, electronic: true, accessories: ['取扱説明書', '天板'], level: 2, flavor: 'パンも焼ける大型オーブン。' }),
  I({ id: 'fridge_a', name: '2ドア冷蔵庫', category: 'appliance', model: 'items/fridge_A.glb', size: 1.7, fit: 'y', sizeClass: 'L', base: 24000, weight: 4, electronic: true, accessories: ['取扱説明書'], level: 2, flavor: '一人暮らしにちょうどいいサイズ。' }),
  I({ id: 'fridge_b', name: 'レトロ冷蔵庫', category: 'appliance', model: 'items/fridge_B.glb', size: 1.7, fit: 'y', sizeClass: 'L', base: 32000, weight: 2, electronic: true, level: 3, flavor: '丸みのあるデザインが愛らしい昭和の冷蔵庫。' }),
  I({ id: 'blaster', name: '光線銃のおもちゃ', category: 'hobby', model: 'items/ken_blaster.glb', size: 0.36, sizeClass: 'S', base: 1800, weight: 6, electronic: true, level: 1, flavor: '光と音が出る。電池で動く。' }),
  I({ id: 'rc_truck_r', name: 'ラジコントラック (赤)', category: 'hobby', model: 'items/ken_vehicle-truck-red.glb', size: 0.42, sizeClass: 'S', base: 6800, weight: 5, electronic: true, accessories: ['元箱', 'コントローラー'], level: 1, flavor: '走破性の高いオフロードトラック。' }),
  I({ id: 'rc_truck_y', name: 'ラジコントラック (黄)', category: 'hobby', model: 'items/ken_vehicle-truck-yellow.glb', size: 0.42, sizeClass: 'S', base: 6800, weight: 4, electronic: true, accessories: ['元箱', 'コントローラー'], level: 1, flavor: '工事現場仕様のラジコン。' }),
  I({ id: 'rc_bike', name: 'ラジコンバイク', category: 'hobby', model: 'items/ken_vehicle-motorcycle.glb', size: 0.4, sizeClass: 'S', base: 5800, weight: 4, electronic: true, accessories: ['元箱'], level: 1, flavor: '自立走行するバイク型ラジコン。' }),

  // ───── 家具・インテリア ─────
  I({ id: 'armchair', name: 'アームチェア', category: 'furniture', model: 'items/armchair.glb', size: 1.0, sizeClass: 'L', base: 12800, weight: 5, level: 1, flavor: '包み込まれるような座り心地。' }),
  I({ id: 'armchair_p', name: 'クッション付きアームチェア', category: 'furniture', model: 'items/armchair_pillows.glb', size: 1.0, sizeClass: 'L', base: 14800, weight: 4, level: 1, flavor: 'クッション2個付き。' }),
  I({ id: 'chair_a', name: 'ダイニングチェア', category: 'furniture', model: 'items/chair_A.glb', size: 0.95, fit: 'y', sizeClass: 'L', base: 3800, weight: 8, level: 1, flavor: '食卓に合わせやすい定番チェア。' }),
  I({ id: 'chair_a_wood', name: '木製チェア', category: 'furniture', model: 'items/chair_A_wood.glb', size: 0.95, fit: 'y', sizeClass: 'L', base: 4800, weight: 7, level: 1, flavor: '無垢材の温かみあるチェア。' }),
  I({ id: 'chair_b_wood', name: 'ラダーバックチェア', category: 'furniture', model: 'items/chair_B_wood.glb', size: 0.95, fit: 'y', sizeClass: 'L', base: 5600, weight: 5, level: 1, flavor: 'はしご状の背もたれが特徴。' }),
  I({ id: 'chair_c', name: 'カフェチェア', category: 'furniture', model: 'items/chair_C.glb', size: 0.9, fit: 'y', sizeClass: 'L', base: 4200, weight: 6, level: 1, flavor: 'カフェ風のおしゃれな椅子。' }),
  I({ id: 'stool', name: '木製スツール', category: 'furniture', model: 'items/chair_stool_wood.glb', size: 0.48, sizeClass: 'M', base: 2400, weight: 8, level: 1, flavor: '踏み台にもなる便利なスツール。' }),
  I({ id: 'sheen_chair', name: 'ファブリックチェア', category: 'furniture', model: 'items/khr_SheenChair.glb', size: 0.85, sizeClass: 'L', base: 22000, weight: 3, level: 2, flavor: '起毛生地が上品なラウンジチェア。' }),
  I({ id: 'damask_chair', name: 'ダマスク柄チェア', category: 'antique', model: 'items/khr_ChairDamaskPurplegold.glb', size: 0.85, sizeClass: 'L', base: 52000, weight: 2, level: 4, flavor: '金糸のダマスク織り。欧州の貴族趣味。' }),
  I({ id: 'pouf', name: 'シルクプフ', category: 'furniture', model: 'items/khr_SpecularSilkPouf.glb', size: 0.55, sizeClass: 'M', base: 16000, weight: 3, level: 2, flavor: '光沢のあるシルクのオットマン。' }),
  I({ id: 'couch', name: '3人掛けソファ', category: 'furniture', model: 'items/couch_pillows.glb', size: 2.1, sizeClass: 'XL', base: 19800, weight: 4, level: 1, flavor: 'ファミリー向けの大きなソファ。' }),
  I({ id: 'velvet_sofa', name: 'ベルベットソファ', category: 'furniture', model: 'items/khr_GlamVelvetSofa.glb', size: 2.0, sizeClass: 'XL', base: 68000, weight: 2, level: 3, flavor: '深みのあるベルベット張り。' }),
  I({ id: 'leather_sofa', name: '北欧レザーソファ', category: 'furniture', model: 'items/khr_SheenWoodLeatherSofa.glb', size: 2.1, sizeClass: 'XL', base: 128000, weight: 1, level: 5, accessories: ['保証書'], auth: { brand: 'NORDVIK', mark: 'NORDVIK DANMARK', fakeMarks: ['NORDVIK DENMARK', 'NORDVlK DANMARK', 'NORDWIK DANMARK'], serial: 'NV-####-@', weight: 38000 }, flavor: '名作家具メーカーのレザーソファ。精巧なコピー品も多い。' }),
  I({ id: 'cabinet_s', name: '小型キャビネット', category: 'furniture', model: 'items/cabinet_small.glb', size: 0.8, sizeClass: 'L', base: 5800, weight: 6, level: 1, flavor: '玄関にも置ける小ぶりの収納。' }),
  I({ id: 'cabinet_sd', name: 'キャビネット (飾り付き)', category: 'furniture', model: 'items/cabinet_small_decorated.glb', size: 1.1, fit: 'y', sizeClass: 'L', base: 7800, weight: 4, level: 1, flavor: '上に小物が飾れる収納棚。' }),
  I({ id: 'cabinet_m', name: 'サイドボード', category: 'furniture', model: 'items/cabinet_medium.glb', size: 1.5, sizeClass: 'XL', base: 14800, weight: 4, level: 2, flavor: '横長のリビング収納。' }),
  I({ id: 'table_small', name: 'サイドテーブル', category: 'furniture', model: 'items/table_small.glb', size: 0.7, sizeClass: 'L', base: 3800, weight: 6, level: 1, flavor: 'ソファ横にぴったり。' }),
  I({ id: 'table_low', name: 'ローテーブル', category: 'furniture', model: 'items/table_low.glb', size: 1.2, sizeClass: 'L', base: 6800, weight: 5, level: 1, flavor: '北欧風の座卓。' }),
  I({ id: 'pillow_a', name: 'クッション (ボーダー)', category: 'furniture', model: 'items/pillow_A.glb', size: 0.42, sizeClass: 'S', base: 900, weight: 9, level: 1, flavor: 'ふかふかのクッション。' }),
  I({ id: 'pillow_b', name: 'クッション (無地)', category: 'furniture', model: 'items/pillow_B.glb', size: 0.42, sizeClass: 'S', base: 800, weight: 9, level: 1, flavor: 'シンプルなクッション。' }),
  I({ id: 'rug', name: 'オーバルラグ', category: 'furniture', model: 'items/rug_oval_A.glb', size: 0.9, sizeClass: 'M', base: 3200, weight: 5, level: 1, flavor: '丸みのあるラグ。' }),
  I({ id: 'cactus_m', name: 'フェイクグリーン (大)', category: 'furniture', model: 'items/cactus_medium_A.glb', size: 0.55, sizeClass: 'M', base: 2600, weight: 6, level: 1, flavor: '水やり不要のサボテン。' }),
  I({ id: 'cactus_s', name: 'フェイクグリーン (小)', category: 'furniture', model: 'items/cactus_small_A.glb', size: 0.3, sizeClass: 'S', base: 1200, weight: 8, level: 1, flavor: '机に置けるミニサボテン。' }),
  I({ id: 'cactus_s2', name: 'ミニ多肉ポット', category: 'furniture', model: 'items/cactus_small_B.glb', size: 0.3, sizeClass: 'S', base: 1100, weight: 8, level: 1, flavor: 'ころんとした多肉植物(造花)。' }),
  I({ id: 'plant', name: '観葉植物の鉢', category: 'furniture', model: 'items/khr_DiffuseTransmissionPlant.glb', size: 0.7, sizeClass: 'M', base: 6800, weight: 4, level: 2, flavor: '葉に光が透ける本物そっくりの鉢植え。' }),
  I({ id: 'vase', name: 'ガラスの花瓶', category: 'furniture', model: 'items/khr_GlassVaseFlowers.glb', size: 0.36, sizeClass: 'S', base: 5400, weight: 5, level: 1, flavor: '花付きのガラスベース。' }),
  I({ id: 'candle', name: 'キャンドルホルダー', category: 'furniture', model: 'items/khr_GlassHurricaneCandleHolder.glb', size: 0.3, sizeClass: 'S', base: 3800, weight: 5, level: 1, flavor: '風よけガラスのキャンドルホルダー。' }),
  I({ id: 'frame_stand_a', name: 'フォトフレーム', category: 'furniture', model: 'items/pictureframe_standing_A.glb', size: 0.3, sizeClass: 'S', base: 1200, weight: 8, level: 1, flavor: '卓上フォトフレーム。' }),
  I({ id: 'frame_stand_b', name: 'ワイドフォトフレーム', category: 'furniture', model: 'items/pictureframe_standing_B.glb', size: 0.34, sizeClass: 'S', base: 1400, weight: 7, level: 1, flavor: '横長の写真用。' }),

  // ───── キッチン・日用品 ─────
  I({ id: 'pot_a', name: '両手鍋', category: 'kitchen', model: 'items/pot_A.glb', size: 0.42, sizeClass: 'S', base: 2200, weight: 9, level: 1, flavor: '煮込み料理に。' }),
  I({ id: 'pot_b', name: 'ホーロー鍋', category: 'kitchen', model: 'items/pot_B.glb', size: 0.42, sizeClass: 'S', base: 4800, weight: 6, level: 1, accessories: ['元箱'], flavor: '人気ブランドのホーロー鍋。' }),
  I({ id: 'pot_large', name: '寸胴鍋', category: 'kitchen', model: 'items/pot_large.glb', size: 0.55, sizeClass: 'M', base: 3800, weight: 5, level: 1, flavor: '業務用の大きな鍋。' }),
  I({ id: 'pan_a', name: 'フライパン', category: 'kitchen', model: 'items/pan_A.glb', size: 0.45, sizeClass: 'S', base: 1500, weight: 9, level: 1, flavor: 'テフロン加工の定番。' }),
  I({ id: 'pan_b', name: '鉄のフライパン', category: 'kitchen', model: 'items/pan_B.glb', size: 0.45, sizeClass: 'S', base: 2800, weight: 6, level: 1, flavor: '育てるほど使いやすくなる鉄製。' }),
  I({ id: 'jar_a', name: '保存瓶 (大)', category: 'kitchen', model: 'items/jar_A_large.glb', size: 0.28, sizeClass: 'S', base: 700, weight: 10, level: 1, flavor: '梅酒づくりにも。' }),
  I({ id: 'jar_b', name: 'キャニスター', category: 'kitchen', model: 'items/jar_B_medium.glb', size: 0.24, sizeClass: 'S', base: 600, weight: 10, level: 1, flavor: 'パスタやコーヒー豆の保存に。' }),
  I({ id: 'jar_c', name: 'ガラスジャー', category: 'kitchen', model: 'items/jar_C_large.glb', size: 0.28, sizeClass: 'S', base: 800, weight: 9, level: 1, flavor: 'しっかり密閉。' }),
  I({ id: 'jar_d', name: '陶器のキャニスター', category: 'kitchen', model: 'items/jar_D_medium.glb', size: 0.24, sizeClass: 'S', base: 900, weight: 8, level: 1, flavor: '素朴な風合い。' }),
  I({ id: 'knife', name: '三徳包丁', category: 'kitchen', model: 'items/knife.glb', size: 0.33, sizeClass: 'S', base: 3200, weight: 6, accessories: ['元箱'], level: 1, flavor: '切れ味の鋭い鋼の包丁。' }),
  I({ id: 'cuttingboard', name: 'まな板', category: 'kitchen', model: 'items/cuttingboard.glb', size: 0.42, sizeClass: 'S', base: 900, weight: 8, level: 1, flavor: 'ひのき製。' }),
  I({ id: 'bowl', name: '陶器の鉢', category: 'kitchen', model: 'items/bowl.glb', size: 0.3, sizeClass: 'S', base: 1200, weight: 8, level: 1, flavor: '煮物を盛りたい深鉢。' }),
  I({ id: 'plate_imari', name: '古伊万里風 大皿', category: 'antique', model: 'items/plate.glb', size: 0.36, sizeClass: 'S', base: 28000, weight: 3, level: 3, auth: { brand: '伊万里', mark: '大明成化年製', fakeMarks: ['大明成化年制', '大朋成化年製', '大明成化年製造'], serial: 'IM-####-@', weight: 980 }, accessories: ['共箱'], flavor: '染付の大皿。写し(複製)も多く出回る。' }),
  I({ id: 'dishset', name: '食器セット', category: 'kitchen', model: 'items/dishrack_plates.glb', size: 0.48, sizeClass: 'M', base: 3200, weight: 6, level: 1, flavor: '水切りラック付きの食器一式。' }),
  I({ id: 'mug_beer', name: 'ビールジョッキ', category: 'kitchen', model: 'items/mug_full.glb', size: 0.2, sizeClass: 'S', base: 600, weight: 8, level: 1, flavor: 'ずっしり重いガラスジョッキ。' }),
  I({ id: 'mug', name: '木製マグ', category: 'kitchen', model: 'items/mug_empty.glb', size: 0.2, sizeClass: 'S', base: 700, weight: 8, level: 1, flavor: '手作りの木のマグカップ。' }),
  I({ id: 'bottle', name: 'ステンレスボトル', category: 'kitchen', model: 'items/khr_WaterBottle.glb', size: 0.26, sizeClass: 'S', base: 2600, weight: 7, level: 1, flavor: '保温保冷の真空ボトル。' }),
  I({ id: 'ketchup', name: 'ディスペンサー (赤)', category: 'kitchen', model: 'items/ketchup.glb', size: 0.24, sizeClass: 'S', base: 300, weight: 5, level: 1, flavor: 'ダイナー風の調味料入れ。' }),

  // ───── ブランド・ファッション ─────
  I({ id: 'watch', name: 'クロノグラフ腕時計', category: 'brand', model: 'items/khr_ChronographWatch.glb', size: 0.16, sizeClass: 'S', base: 185000, weight: 2, level: 3, accessories: ['元箱', '保証書', 'コマ'], auth: { brand: 'CHRONOVA', mark: 'CHRONOVA GENÈVE', fakeMarks: ['CHRONOVA GENEVE', 'CHRONOVA GENÉVE', 'CHR0NOVA GENÈVE'], serial: 'CV-####-@', weight: 142 }, flavor: 'スイスの名門クロノグラフ。偽物に要注意。' }),
  I({ id: 'sunglasses', name: 'サングラス', category: 'brand', model: 'items/khr_SunglassesKhronos.glb', size: 0.16, sizeClass: 'S', base: 28000, weight: 4, level: 2, accessories: ['ケース', '保証書'], auth: { brand: 'LUXEL', mark: 'LUXEL MILANO', fakeMarks: ['LUXEL MILAN', 'LUXELL MILANO', 'LUXEL MlLANO'], serial: 'LX-####-@', weight: 31 }, flavor: 'イタリアのアイウェアブランド。' }),
  I({ id: 'sneaker', name: 'スニーカー', category: 'brand', model: 'items/khr_MaterialsVariantsShoe.glb', size: 0.32, sizeClass: 'S', base: 24000, weight: 5, level: 2, accessories: ['元箱', '替え紐'], auth: { brand: 'AERO RUN', mark: 'AERO RUN ORIGINAL', fakeMarks: ['AER0 RUN ORIGINAL', 'AERO RUN ORlGINAL', 'AEROS RUN ORIGINAL'], serial: 'AR-####-@', weight: 410 }, flavor: '限定カラーはプレミア価格に。' }),
  I({ id: 'corset', name: 'ヴィンテージコルセット', category: 'brand', model: 'items/khr_Corset.glb', size: 0.42, sizeClass: 'S', base: 36000, weight: 2, level: 3, accessories: ['ハンガー'], auth: { brand: 'Maison Lila', mark: 'MAISON LILA PARIS', fakeMarks: ['MAISON LILA PARlS', 'MAISON LILAS PARIS', 'MASION LILA PARIS'], serial: 'ML-####-@', weight: 520 }, flavor: 'パリのメゾンによる一点物。' }),

  // ───── ホビー・おもちゃ ─────
  I({ id: 'toycar', name: 'ブリキのミニカー', category: 'hobby', model: 'items/khr_ToyCar.glb', size: 0.3, sizeClass: 'S', base: 16000, weight: 3, level: 2, accessories: ['元箱'], flavor: '昭和のブリキ玩具。箱付きは高値。' }),
  I({ id: 'sword1', name: 'コスプレ用ソード', category: 'hobby', model: 'items/sword_1handed.glb', size: 0.9, sizeClass: 'M', base: 4800, weight: 5, level: 1, flavor: 'イベントで映える片手剣の小道具。' }),
  I({ id: 'sword2', name: '大剣レプリカ', category: 'hobby', model: 'items/sword_2handed_color.glb', size: 1.1, sizeClass: 'M', base: 9800, weight: 3, level: 1, flavor: '人気ゲームの大剣を再現。' }),
  I({ id: 'dagger', name: 'ダガーレプリカ', category: 'hobby', model: 'items/dagger.glb', size: 0.45, sizeClass: 'S', base: 2800, weight: 5, level: 1, flavor: '刃のない安全な小道具。' }),
  I({ id: 'axe', name: 'バトルアックス (小道具)', category: 'hobby', model: 'items/axe_1handed.glb', size: 0.6, sizeClass: 'M', base: 3800, weight: 4, level: 1, flavor: 'ウレタン製で軽い。' }),
  I({ id: 'shield_r', name: 'ラウンドシールド', category: 'hobby', model: 'items/shield_round_color.glb', size: 0.6, sizeClass: 'M', base: 4200, weight: 4, level: 1, flavor: 'バイキング風の丸盾。' }),
  I({ id: 'shield_b', name: '紋章入りシールド', category: 'hobby', model: 'items/shield_badge_color.glb', size: 0.62, sizeClass: 'M', base: 5200, weight: 3, level: 1, flavor: '騎士団の紋章入り。' }),
  I({ id: 'staff', name: '魔法の杖 (大)', category: 'hobby', model: 'items/staff.glb', size: 1.2, sizeClass: 'M', base: 3600, weight: 4, level: 1, flavor: '宝石付きの杖。コスプレ用。' }),
  I({ id: 'wand', name: 'ステッキ', category: 'hobby', model: 'items/wand.glb', size: 0.4, sizeClass: 'S', base: 1600, weight: 5, level: 1, flavor: '手品にも使える。' }),
  I({ id: 'crossbow', name: 'おもちゃのボウガン', category: 'hobby', model: 'items/crossbow_1handed.glb', size: 0.55, sizeClass: 'M', base: 3200, weight: 4, level: 1, flavor: 'スポンジ矢を飛ばす。' }),
  I({ id: 'quiver', name: '矢筒', category: 'hobby', model: 'items/quiver.glb', size: 0.5, sizeClass: 'S', base: 1500, weight: 4, level: 1, flavor: '革製の矢筒。' }),
  I({ id: 'trophy', name: '優勝トロフィー', category: 'hobby', model: 'items/ken_trophy.glb', size: 0.3, sizeClass: 'S', base: 1800, weight: 6, level: 1, flavor: '誰かの栄光の証。名前入り。' }),
  I({ id: 'water_gun', name: '水鉄砲', category: 'hobby', model: 'items/ken_blaster-repeater.glb', size: 0.42, sizeClass: 'S', base: 1200, weight: 6, level: 1, flavor: '夏の必需品。' }),
  I({ id: 'diorama_house', name: 'ジオラマ (民家)', category: 'hobby', model: 'items/ken_building-small-a.glb', size: 0.36, sizeClass: 'S', base: 5200, weight: 4, level: 1, flavor: '精巧な建物模型。' }),
  I({ id: 'diorama_garage', name: 'ジオラマ (ガレージ)', category: 'hobby', model: 'items/ken_building-garage.glb', size: 0.36, sizeClass: 'S', base: 4600, weight: 4, level: 1, flavor: '鉄道模型のレイアウトに。' }),
  I({ id: 'diorama_fountain', name: 'ジオラマ (噴水広場)', category: 'hobby', model: 'items/ken_pavement-fountain.glb', size: 0.36, sizeClass: 'S', base: 5800, weight: 3, level: 1, flavor: '街の広場を再現。' }),

  // ───── 骨董・美術品 ─────
  I({ id: 'antique_camera', name: '蛇腹カメラと三脚', category: 'antique', model: 'items/khr_AntiqueCamera.glb', size: 1.55, fit: 'y', sizeClass: 'L', base: 58000, weight: 2, level: 3, flavor: '明治期の写真館で使われた大判カメラ。' }),
  I({ id: 'lantern', name: 'ガス灯ランタン', category: 'antique', model: 'items/khr_Lantern.glb', size: 1.5, fit: 'y', sizeClass: 'L', base: 34000, weight: 2, level: 3, flavor: '街角を照らしていたガス灯。' }),
  I({ id: 'stained_lamp', name: 'ステンドグラスランプ', category: 'antique', model: 'items/khr_StainedGlassLamp.glb', size: 0.62, sizeClass: 'M', base: 78000, weight: 2, electronic: true, level: 4, auth: { brand: 'TIFFANIA', mark: 'TIFFANIA STUDIOS N.Y.', fakeMarks: ['TIFFANIA STUDIO N.Y.', 'TIFFANIA STUDIOS NY.', 'TIFANIA STUDIOS N.Y.'], serial: 'TS-####-@', weight: 6400 }, flavor: '鉛線で組まれたガラスシェード。複製品も多い。' }),
  I({ id: 'amber', name: '虫入り琥珀', category: 'antique', model: 'items/khr_MosquitoInAmber.glb', size: 0.12, sizeClass: 'S', base: 58000, weight: 2, level: 3, auth: { brand: 'バルト産', mark: 'BALTIC AMBER CERT.', fakeMarks: ['BALTIC AMBAR CERT.', 'BALTlC AMBER CERT.', 'BALTIC AMBER CERTS.'], serial: 'BA-####-@', weight: 46 }, accessories: ['鑑別書'], flavor: '数千万年前の蚊が閉じ込められている。樹脂製の偽物も。' }),
  I({ id: 'hibachi', name: '鉄器の火鉢', category: 'antique', model: 'items/khr_PotOfCoals.glb', size: 0.4, sizeClass: 'S', base: 18000, weight: 3, level: 2, flavor: '炭を入れて使う鋳鉄の火鉢。' }),
  I({ id: 'painting_l', name: '油彩画 (風景)', category: 'antique', model: 'items/pictureframe_large_A.glb', size: 0.8, sizeClass: 'M', base: 42000, weight: 2, level: 3, auth: { brand: '画家サイン', mark: 'K. Morisaki 1962', fakeMarks: ['K. Morisaki 1926', 'K. Morizaki 1962', 'K Morisaki 1962'], serial: 'KM-####-@', weight: 3200 }, flavor: '地方画壇の巨匠の作とされる風景画。' }),
  I({ id: 'painting_m', name: '水彩画', category: 'antique', model: 'items/pictureframe_medium.glb', size: 0.6, sizeClass: 'M', base: 9800, weight: 4, level: 1, flavor: 'やさしいタッチの静物画。' }),
  I({ id: 'statue', name: '石膏像', category: 'antique', model: 'items/ken_statue.glb', size: 0.8, fit: 'y', sizeClass: 'M', base: 12000, weight: 3, level: 2, flavor: '美大生のデッサン用だったらしい。' }),
  I({ id: 'coin', name: '記念金貨', category: 'antique', model: 'items/ken_coin.glb', size: 0.1, sizeClass: 'S', base: 32000, weight: 3, level: 2, accessories: ['ケース', '証明書'], auth: { brand: '造幣局', mark: '天皇陛下御在位記念', fakeMarks: ['天皇陛下御在位紀念', '天皇陛下ご在位記念', '天皇陛下御在任記念'], serial: 'JM-####-@', weight: 20 }, flavor: '純金の記念硬貨。メッキの偽物に注意。' }),
  I({ id: 'old_book', name: '古い洋書', category: 'antique', model: 'items/spellbook_closed.glb', size: 0.32, sizeClass: 'S', base: 6800, weight: 5, level: 1, flavor: '革装丁の古書。初版なら…？' }),
  I({ id: 'old_book_open', name: '装飾写本', category: 'antique', model: 'items/spellbook_open.glb', size: 0.4, sizeClass: 'S', base: 14000, weight: 3, level: 2, flavor: '手書きの装飾が美しい写本。' }),
  I({ id: 'book', name: '古本', category: 'hobby', model: 'items/book_single.glb', size: 0.28, sizeClass: 'S', base: 500, weight: 10, level: 1, flavor: '読み込まれた文庫本。' }),
  I({ id: 'bookset', name: '文学全集セット', category: 'hobby', model: 'env/book_set.glb', size: 0.5, sizeClass: 'M', base: 5800, weight: 5, level: 1, flavor: '揃いの全集は根強い人気。' }),
];

export const ITEM_MAP = new Map(ITEMS.map((d) => [d.id, d]));
export const itemDef = (id: string) => {
  const d = ITEM_MAP.get(id);
  if (!d) throw new Error(`unknown item ${id}`);
  return d;
};

export const SIZE_ORDER: Record<SizeClass, number> = { S: 0, M: 1, L: 2, XL: 3 };
export const SIZE_LABEL: Record<SizeClass, string> = { S: '小物', M: '中型', L: '大型', XL: '特大' };
