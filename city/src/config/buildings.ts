// 建物の素材（SimplePoly City を変換した .glb）と、業種・店のレベルの対応表。
// model には .import-cache/catalog.json に出てくるモデル名を書く。
// ここに書いたモデルだけが public/assets/models/ にコピーされ、ビルドに入る。
//
// ※ 素材がまだ届いていないため、モデル名は仮。取り込み後に実際の名前に直す。

export type IndustryId = 'food' | 'retail' | 'factory' | 'logistics' | 'it';

export interface BuildingVisual {
  model: string;
  /** モデルを区画に収めるときの倍率（1 = 区画にぴったり合わせる自動倍率のまま） */
  scale?: number;
  /** 回転の補正（度） */
  rotateDeg?: number;
}

/** 業種 → 店のレベル（1始まり）ごとの見た目 */
export const BUILDING_VISUALS: Record<IndustryId, BuildingVisual[]> = {
  food: [{ model: 'Cafe' }, { model: 'FastFood' }, { model: 'Building_Small' }],
  retail: [{ model: 'Shop' }, { model: 'Supermarket' }, { model: 'Building_Medium' }],
  factory: [{ model: 'Factory' }],
  logistics: [], // 倉庫は素材に無い可能性あり。届いたら相談
  it: [{ model: 'Office' }, { model: 'Building_Tall' }],
};

/** 道路・飾り */
export const ROAD_VISUALS = {
  straight: { model: 'Road_Straight' } as BuildingVisual,
  cross: { model: 'Road_Cross' } as BuildingVisual,
};

export const DECOR_VISUALS = {
  trees: [{ model: 'Tree' }] as BuildingVisual[],
  cars: [{ model: 'Car' }] as BuildingVisual[],
};
