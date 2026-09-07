extends Node3D

# 仕様書 2章・5章（第1段階の範囲）: 壁・床のみ、素材1種、編集なし。
# 設置は向きを自動決定し、削除は照準したパーツを1つ消す。連続設置/削除に対応。

# class_name によるグローバル解決は初回エディタ起動でキャッシュが作られるまで
# 効かないため、preload で明示的に参照する。
const Grid = preload("res://scripts/Grid.gd")

const RAY_DISTANCE := 20.0
const WALL_THICKNESS := 0.12
const FLOOR_THICKNESS := 0.12
const PLACE_OFFSET := 0.05

enum PartKind { WALL, FLOOR }

var camera: Camera3D
var parts_root: Node3D

var current_kind: PartKind = PartKind.WALL
var placed_parts: Dictionary = {} # key(String) -> StaticBody3D
var last_place_key := ""
var last_delete_key := ""

func _process(_delta: float) -> void:
	if camera == null:
		return
	_handle_type_switch()

	if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		_try_place()
	else:
		last_place_key = ""

	if Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		_try_delete()
	else:
		last_delete_key = ""

func _handle_type_switch() -> void:
	if Input.is_key_pressed(KEY_1):
		current_kind = PartKind.WALL
	elif Input.is_key_pressed(KEY_2):
		current_kind = PartKind.FLOOR

func _camera_ray() -> Dictionary:
	var from := camera.global_position
	var dir := -camera.global_transform.basis.z
	var to := from + dir * RAY_DISTANCE
	var space_state := camera.get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(from, to)
	return space_state.intersect_ray(query)

func _try_place() -> void:
	var from := camera.global_position
	var dir := -camera.global_transform.basis.z
	var result := _camera_ray()

	var point: Vector3
	if result.size() > 0:
		point = (result["position"] as Vector3) + (result["normal"] as Vector3) * PLACE_OFFSET
	else:
		point = from + dir * RAY_DISTANCE

	var cell := Grid.world_to_cell(point)
	var face: int
	if current_kind == PartKind.FLOOR:
		face = Grid.Face.FLOOR
	else:
		face = _nearest_wall_face(cell, from)

	var k := Grid.key(cell, face)
	if k == last_place_key:
		return
	last_place_key = k

	if placed_parts.has(k):
		return
	_spawn_part(cell, face, k)

func _try_delete() -> void:
	var result := _camera_ray()
	if result.size() == 0:
		return

	var collider: Object = result["collider"]
	if collider == null or not (collider as Node).has_meta("part_key"):
		return

	var k: String = (collider as Node).get_meta("part_key")
	if k == last_delete_key:
		return
	last_delete_key = k

	if placed_parts.has(k):
		(placed_parts[k] as Node).queue_free()
		placed_parts.erase(k)

func _nearest_wall_face(cell: Vector3i, from_pos: Vector3) -> int:
	var center := Grid.cell_origin(cell) + Vector3.ONE * (Grid.CELL_SIZE / 2.0)
	var local := from_pos - center
	if abs(local.x) >= abs(local.z):
		return (Grid.Face.PX if local.x > 0.0 else Grid.Face.NX)
	else:
		return (Grid.Face.PZ if local.z > 0.0 else Grid.Face.NZ)

func _spawn_part(cell: Vector3i, face: int, part_key: String) -> void:
	var body := StaticBody3D.new()
	body.set_meta("part_key", part_key)

	var box := BoxMesh.new()
	var origin := Grid.cell_origin(cell)
	var half := Grid.CELL_SIZE / 2.0

	match face:
		Grid.Face.PX:
			box.size = Vector3(WALL_THICKNESS, Grid.CELL_SIZE, Grid.CELL_SIZE)
			body.position = origin + Vector3(Grid.CELL_SIZE, half, half)
		Grid.Face.NX:
			box.size = Vector3(WALL_THICKNESS, Grid.CELL_SIZE, Grid.CELL_SIZE)
			body.position = origin + Vector3(0.0, half, half)
		Grid.Face.PZ:
			box.size = Vector3(Grid.CELL_SIZE, Grid.CELL_SIZE, WALL_THICKNESS)
			body.position = origin + Vector3(half, half, Grid.CELL_SIZE)
		Grid.Face.NZ:
			box.size = Vector3(Grid.CELL_SIZE, Grid.CELL_SIZE, WALL_THICKNESS)
			body.position = origin + Vector3(half, half, 0.0)
		Grid.Face.FLOOR:
			box.size = Vector3(Grid.CELL_SIZE, FLOOR_THICKNESS, Grid.CELL_SIZE)
			body.position = origin + Vector3(half, 0.0, half)

	var mesh_instance := MeshInstance3D.new()
	mesh_instance.mesh = box
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.85, 0.83, 0.78)
	mesh_instance.material_override = mat
	body.add_child(mesh_instance)

	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = box.size
	collision.shape = shape
	body.add_child(collision)

	parts_root.add_child(body)
	placed_parts[part_key] = body
