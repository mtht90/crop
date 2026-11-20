// 建物の素材（dglopez「Low Poly City Builder Asset Pack」無料版の GLB）と、業種・店のレベルの対応表。
// model には `npm run import-assets -- --list` で出てくるモデル名を書く。
// ここ（と src/config/ の他のファイル）に書いたモデルだけが素材パックに入り、ビルドに含まれる。
//
// 素材の1マス = 1ワールド単位。建物の多くは 1×1 マス、公園・リサイクル施設などは 2×2 マス。

export type IndustryId = 'food' | 'retail' | 'factory' | 'logistics' | 'it';

export interface BuildingVisual {
  model: string;
  /** 倍率（1 = 素材そのままの大きさ） */
  scale?: number;
  /** 回転の補正（度） */
  rotateDeg?: number;
}

/** 業種 → 店のレベル（1始まり）ごとの見た目。レベルが配列より大きいときは最後のものを使う */
export const BUILDING_VISUALS: Record<IndustryId, BuildingVisual[]> = {
  // 飲食と小売は同じ「Commercial」系。業種の違いは看板アイコン・色で見分ける（要相談）
  food: [{ model: 'Commercial_N1' }, { model: 'Commercial_N2' }, { model: 'Commercial_N3' }],
  retail: [{ model: 'Commercial_N1' }, { model: 'Commercial_N2' }, { model: 'Commercial_N3' }],
  factory: [{ model: 'Light_Industry_N1' }, { model: 'Light_Industry_N2' }, { model: 'Light_Industry_N3' }],
  // 倉庫は素材に無いため仮。要相談
  logistics: [{ model: 'Transit_N1' }, { model: 'Transit_N2' }],
  it: [{ model: 'Office_N1' }, { model: 'Office_N2' }],
};

/** 本社（研究をする場所） */
export const HQ_VISUAL: BuildingVisual = { model: 'Office_N2' };

/** 道路（素材の向き：直線は X 方向に伸びる） */
export const ROAD_VISUALS = {
  straight: { model: 'Road_Straight_N4' } as BuildingVisual,
  cross: { model: 'Road_Cross_N4' } as BuildingVisual,
  tee: { model: 'Road_T_N4' } as BuildingVisual,
  corner: { model: 'Road_Corner_N4' } as BuildingVisual,
};

/** 区画の地面 */
export const GROUND_VISUALS = {
  open: { model: 'Ground_Urban_A' } as BuildingVisual,
  locked: { model: 'Ground_Locked_A' } as BuildingVisual,
};

export const DECOR_VISUALS = {
  trees: [{ model: 'Tree_Dark' }, { model: 'Tree_Fresh' }, { model: 'Tree_Light' }] as BuildingVisual[],
  cars: [{ model: 'Car_Blue' }, { model: 'Car_Coral' }, { model: 'Bus' }, { model: 'Freight_Truck_Blue' }] as BuildingVisual[],
};
