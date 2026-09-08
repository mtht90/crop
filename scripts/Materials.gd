extends RefCounted

# 仕様書4章: 形状とは独立した素材レイヤー。
#
# res://materials/<folder>/ に ambientCG 由来の4枚組を置くとテクスチャ付きの
# ORMMaterial3D として読み込む。ファイル名は展開したままでよく、末尾が
# 「_Color.png」「_NormalGL.png」「_Roughness.png」「_AmbientOcclusion.png」で
# あることだけを見る（解像度や製品名を含む接頭辞は問わない）。
# 4枚のうち1枚でも見つからない素材は、単色の ORMMaterial3D にフォールバックする
# （落ちない）。
#
# 素材を増やすときはこの DEFS 配列に1行足すだけでよい。
const DEFS := [
	{ "name": "コンクリート", "folder": "concrete",    "fallback_color": Color(0.62, 0.62, 0.60), "fallback_roughness": 0.9 },
	{ "name": "木材",         "folder": "wood",        "fallback_color": Color(0.52, 0.37, 0.24), "fallback_roughness": 0.75 },
	{ "name": "トタン",       "folder": "tin",         "fallback_color": Color(0.55, 0.58, 0.60), "fallback_roughness": 0.3 },
	{ "name": "タイル",       "folder": "tile",        "fallback_color": Color(0.80, 0.77, 0.68), "fallback_roughness": 0.45 },
	{ "name": "土壁",         "folder": "mud_wall",    "fallback_color": Color(0.68, 0.52, 0.32), "fallback_roughness": 0.95 },
	{ "name": "ガラス",       "folder": "glass",       "fallback_color": Color(0.75, 0.85, 0.85), "fallback_roughness": 0.05 },
	{ "name": "れんが",       "folder": "brick",       "fallback_color": Color(0.55, 0.27, 0.20), "fallback_roughness": 0.85 },
	{ "name": "白ペンキ",     "folder": "white_paint", "fallback_color": Color(0.90, 0.90, 0.86), "fallback_roughness": 0.55 },
]

const TEXTURE_ROOT := "res://materials"
const SUFFIX_COLOR := "_Color.png"
const SUFFIX_NORMAL := "_NormalGL.png"
const SUFFIX_ROUGHNESS := "_Roughness.png"
const SUFFIX_AO := "_AmbientOcclusion.png"

static var _cache: Dictionary = {}

static func count() -> int:
	return DEFS.size()

static func name_of(material_id: int) -> String:
	return DEFS[material_id]["name"]

static func get_material(material_id: int) -> ORMMaterial3D:
	if _cache.has(material_id):
		return _cache[material_id]

	var def: Dictionary = DEFS[material_id]
	var mat := _build_textured_material(def["folder"])
	if mat == null:
		mat = _build_fallback_material(def["fallback_color"], def["fallback_roughness"])

	_cache[material_id] = mat
	return mat

static func _build_fallback_material(color: Color, roughness: float) -> ORMMaterial3D:
	var mat := ORMMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = roughness
	mat.metallic = 0.0
	return mat

# 4枚すべて見つかったときだけテクスチャ付きマテリアルを返す。1枚でも欠けていれば null。
static func _build_textured_material(folder: String) -> ORMMaterial3D:
	var dir_path := "%s/%s" % [TEXTURE_ROOT, folder]

	var color_path := _find_texture(dir_path, SUFFIX_COLOR)
	var normal_path := _find_texture(dir_path, SUFFIX_NORMAL)
	var roughness_path := _find_texture(dir_path, SUFFIX_ROUGHNESS)
	var ao_path := _find_texture(dir_path, SUFFIX_AO)

	if color_path == "" or normal_path == "" or roughness_path == "" or ao_path == "":
		return null

	var albedo_tex: Texture2D = load(color_path)
	var normal_tex: Texture2D = load(normal_path)
	var orm_tex := _pack_orm_texture(roughness_path, ao_path)
	if albedo_tex == null or normal_tex == null or orm_tex == null:
		return null

	var mat := ORMMaterial3D.new()
	mat.albedo_texture = albedo_tex
	mat.normal_enabled = true
	mat.normal_texture = normal_tex
	mat.ao_enabled = true
	mat.orm_texture = orm_tex
	mat.roughness = 1.0
	mat.metallic = 0.0
	return mat

# ORMMaterial3D は Occlusion(R) / Roughness(G) / Metallic(B) を1枚に詰めた
# orm_texture しか受け取れない。ambientCGはRoughnessとAOが別ファイルなので、
# ここでピクセル単位に合成した1枚のテクスチャを作る。
static func _pack_orm_texture(roughness_path: String, ao_path: String) -> ImageTexture:
	var roughness_tex: Texture2D = load(roughness_path)
	var ao_tex: Texture2D = load(ao_path)
	if roughness_tex == null or ao_tex == null:
		return null

	var roughness_img := roughness_tex.get_image()
	var ao_img := ao_tex.get_image()
	if roughness_img == null or ao_img == null:
		return null

	roughness_img = roughness_img.duplicate()
	ao_img = ao_img.duplicate()
	roughness_img.convert(Image.FORMAT_L8)
	ao_img.convert(Image.FORMAT_L8)

	var size := roughness_img.get_size()
	if ao_img.get_size() != size:
		ao_img.resize(size.x, size.y)

	var rough_data := roughness_img.get_data()
	var ao_data := ao_img.get_data()
	var pixel_count := size.x * size.y

	var orm_data := PackedByteArray()
	orm_data.resize(pixel_count * 4)
	for i in pixel_count:
		orm_data[i * 4 + 0] = ao_data[i]    # R = Occlusion
		orm_data[i * 4 + 1] = rough_data[i] # G = Roughness
		orm_data[i * 4 + 2] = 0             # B = Metallic（非金属のみのため常に0）
		orm_data[i * 4 + 3] = 255

	var orm_img := Image.create_from_data(size.x, size.y, false, Image.FORMAT_RGBA8, orm_data)
	return ImageTexture.create_from_image(orm_img)

# dir_path 内で末尾が suffix のファイルを探す（接頭辞・解像度は問わない）。
static func _find_texture(dir_path: String, suffix: String) -> String:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return ""

	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if not dir.current_is_dir() and file_name.ends_with(suffix):
			dir.list_dir_end()
			return "%s/%s" % [dir_path, file_name]
		file_name = dir.get_next()
	dir.list_dir_end()
	return ""
