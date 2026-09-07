extends Node3D

# 第1段階の土台（壁・床の設置/削除、自由飛行、DDAレイキャスト、チャンク単位の
# MultiMesh描画、設置プレビュー）+ 4章の素材システム + 7章のアンドゥ/リドゥ履歴。
# 編集（3×3格子）・セーブ・チャンクの動的生成/解放はまだ未実装。

const WorldData = preload("res://scripts/World.gd")
const ChunkRenderer = preload("res://scripts/ChunkRenderer.gd")
const History = preload("res://scripts/History.gd")

const WORLD_SIZE := 200.0 # 固定ワールドの一辺（m）

func _ready() -> void:
	_setup_environment()
	_setup_ground()
	var player := _setup_player()
	var labels := _setup_ui()

	var world := WorldData.new()

	var renderer := ChunkRenderer.new()
	renderer.name = "ChunkRenderer"
	add_child(renderer)

	var history := History.new()

	var build_system := preload("res://scripts/BuildSystem.gd").new()
	build_system.name = "BuildSystem"
	build_system.camera = player.get("camera")
	build_system.world = world
	build_system.renderer = renderer
	build_system.history = history
	build_system.material_label = labels["material"]
	build_system.history_label = labels["history"]
	add_child(build_system)

# 仕様書10章末尾: 建築中は常に明るい固定光。時刻・天候は撮影モード専用（未実装）。
func _setup_environment() -> void:
	var env := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	sky.sky_material = ProceduralSkyMaterial.new()
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	environment.ambient_light_energy = 1.2
	env.environment = environment
	add_child(env)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55.0, -30.0, 0.0)
	sun.light_energy = 1.3
	add_child(sun)

# 仕様書8.3: 地形はない。y=0 に固定サイズの平面。
# 物理エンジンは使わない方針のため、当たり判定は持たせない（見た目のみ）。
func _setup_ground() -> void:
	var box := BoxMesh.new()
	box.size = Vector3(WORLD_SIZE, 0.2, WORLD_SIZE)

	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = "Ground"
	mesh_instance.mesh = box
	mesh_instance.position.y = -0.1
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.55, 0.55, 0.58)
	mesh_instance.material_override = mat

	add_child(mesh_instance)

func _setup_player() -> Node3D:
	var player: Node3D = preload("res://scripts/FreeCamera.gd").new()
	player.name = "Player"
	player.position = Vector3(0.0, 3.0, 6.0)
	add_child(player)
	return player

func _setup_ui() -> Dictionary:
	var layer := CanvasLayer.new()

	var crosshair := ColorRect.new()
	crosshair.color = Color(1.0, 1.0, 1.0, 0.85)
	crosshair.size = Vector2(4.0, 4.0)
	crosshair.anchor_left = 0.5
	crosshair.anchor_top = 0.5
	crosshair.anchor_right = 0.5
	crosshair.anchor_bottom = 0.5
	crosshair.position = Vector2(-2.0, -2.0)
	layer.add_child(crosshair)

	var material_label := _make_corner_label(Vector2(16.0, 16.0))
	layer.add_child(material_label)

	var history_label := _make_corner_label(Vector2(16.0, 40.0))
	layer.add_child(history_label)

	add_child(layer)
	return {"material": material_label, "history": history_label}

func _make_corner_label(pos: Vector2) -> Label:
	var label := Label.new()
	label.position = pos
	label.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
	label.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.85))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)
	return label
