extends RefCounted

# 仕様書4章: 形状とは独立した素材レイヤー。
# テクスチャは後で差し込む前提で、今は色+粗さのみの ORMMaterial3D を用意する。
# 10種に増やす場合はこの配列に定義を1件足すだけでよい。
const DEFS := [
	{ "name": "コンクリート", "color": Color(0.62, 0.62, 0.60), "roughness": 0.9 },
	{ "name": "木材",         "color": Color(0.52, 0.37, 0.24), "roughness": 0.75 },
	{ "name": "トタン",       "color": Color(0.55, 0.58, 0.60), "roughness": 0.3 },
	{ "name": "タイル",       "color": Color(0.80, 0.77, 0.68), "roughness": 0.45 },
	{ "name": "土壁",         "color": Color(0.68, 0.52, 0.32), "roughness": 0.95 },
	{ "name": "ガラス",       "color": Color(0.75, 0.85, 0.85), "roughness": 0.05 },
	{ "name": "れんが",       "color": Color(0.55, 0.27, 0.20), "roughness": 0.85 },
	{ "name": "白ペンキ",     "color": Color(0.90, 0.90, 0.86), "roughness": 0.55 },
]

static var _cache: Dictionary = {}

static func count() -> int:
	return DEFS.size()

static func name_of(material_id: int) -> String:
	return DEFS[material_id]["name"]

static func get_material(material_id: int) -> ORMMaterial3D:
	if _cache.has(material_id):
		return _cache[material_id]

	var def: Dictionary = DEFS[material_id]
	var mat := ORMMaterial3D.new()
	mat.albedo_color = def["color"]
	mat.roughness = def["roughness"]
	mat.metallic = 0.0
	# albedo_texture / orm_texture は未設定のまま。後からテクスチャを差し込める。
	_cache[material_id] = mat
	return mat
