extends Node3D

# 第1段階（仕様書14章）: 壁・床のみ、素材1種、固定サイズの平地、
# 編集なし、保存なし。自由飛行と設置・削除だけを実装する。

const WORLD_SIZE := 200.0 # 固定ワールドの一辺（m）

func _ready() -> void:
	_setup_environment()
	_setup_ground()
	var player := _setup_player()
	_setup_build_system(player)
	_setup_ui()

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

# 仕様書8.3: 地形はない。y=0 に固定サイズの平面（第1〜3段階は固定ワールドで可）。
func _setup_ground() -> void:
	var body := StaticBody3D.new()
	body.name = "Ground"

	var box := BoxMesh.new()
	box.size = Vector3(WORLD_SIZE, 0.2, WORLD_SIZE)

	var mesh_instance := MeshInstance3D.new()
	mesh_instance.mesh = box
	mesh_instance.position.y = -0.1
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.55, 0.55, 0.58)
	mesh_instance.material_override = mat
	body.add_child(mesh_instance)

	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = box.size
	collision.shape = shape
	collision.position.y = -0.1
	body.add_child(collision)

	add_child(body)

func _setup_player() -> Node3D:
	var player: Node3D = preload("res://scripts/FreeCamera.gd").new()
	player.name = "Player"
	player.position = Vector3(0.0, 3.0, 6.0)
	add_child(player)
	return player

func _setup_build_system(player: Node3D) -> void:
	var build_system := preload("res://scripts/BuildSystem.gd").new()
	build_system.name = "BuildSystem"
	build_system.camera = player.get("camera")
	build_system.parts_root = self
	add_child(build_system)

func _setup_ui() -> void:
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
	add_child(layer)
