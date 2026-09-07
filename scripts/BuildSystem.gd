extends Node3D

# 仕様書2章・4章・5章: 設置・削除・向きの自動決定・素材の選択とプレビュー。
# 物理エンジンは使わず、DDARaycaster でセルグリッドを直接判定する。

const Grid = preload("res://scripts/Grid.gd")
const Materials = preload("res://scripts/Materials.gd")
const ShapeMesh = preload("res://scripts/ShapeMesh.gd")
const DDARaycaster = preload("res://scripts/DDARaycaster.gd")
const PieceInstance = preload("res://scripts/PieceInstance.gd")

const RAY_DISTANCE := 20.0
const PLACE_OFFSET := 0.02

var camera: Camera3D
var world       # World (data)
var renderer    # ChunkRenderer (MultiMesh描画)
var history     # History (アンドゥ/リドゥ)
var material_label: Label
var history_label: Label

var current_kind_is_wall := true # false ならFLOOR。ホイールで切替
var current_material_id: int = 0 # 数字キー 1〜8 で切替

var _preview: MeshInstance3D
var _last_place_key := ""
var _last_delete_key := ""

var _left_held := false
var _right_held := false
var _place_session # null または {"added": [], "removed": []}
var _delete_session # null または {"added": [], "removed": []}

func _ready() -> void:
	_preview = MeshInstance3D.new()
	_preview.visible = false
	add_child(_preview)
	_update_material_label()
	_update_history_label()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP or event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			current_kind_is_wall = not current_kind_is_wall
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.ctrl_pressed and event.keycode == KEY_Z:
			_undo()
		elif event.ctrl_pressed and event.keycode == KEY_Y:
			_redo()
		else:
			var slot: int = event.keycode - KEY_1
			if slot >= 0 and slot < Materials.count():
				current_material_id = slot
				_update_material_label()

func _process(_delta: float) -> void:
	if camera == null or world == null or renderer == null:
		return

	var target := _compute_target()
	_update_preview(target)

	var left_pressed := Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
	if left_pressed and not _left_held:
		_place_session = {"added": [], "removed": []}
	if left_pressed:
		_try_place(target)
	else:
		_last_place_key = ""
		if _left_held:
			_commit_session(_place_session)
			_place_session = null
	_left_held = left_pressed

	var right_pressed := Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
	if right_pressed and not _right_held:
		_delete_session = {"added": [], "removed": []}
	if right_pressed:
		_try_delete()
	else:
		_last_delete_key = ""
		if _right_held:
			_commit_session(_delete_session)
			_delete_session = null
	_right_held = right_pressed

func _update_material_label() -> void:
	if material_label != null:
		material_label.text = "素材: %s" % Materials.name_of(current_material_id)

func _update_history_label() -> void:
	if history_label != null and history != null:
		history_label.text = "履歴: %s" % history.position_text()

# 1操作＝1エントリ。ボタンを押してから離すまでの連続設置/削除をまとめて1件にする。
func _commit_session(session) -> void:
	if session == null or history == null:
		return
	if session["added"].is_empty() and session["removed"].is_empty():
		return
	history.push_entry(session)
	_update_history_label()

func _undo() -> void:
	if history == null or not history.can_undo():
		return
	var entry: Dictionary = history.pop_for_undo()
	for piece: PieceInstance in entry["added"]:
		var removed: PieceInstance = world.remove(piece.cell, piece.shape_id)
		if removed != null:
			renderer.on_piece_removed(removed)
	for piece: PieceInstance in entry["removed"]:
		var restored: PieceInstance = world.place(piece.cell, piece.shape_id, piece.material_id)
		if restored != null:
			renderer.on_piece_added(restored)
	_update_history_label()

func _redo() -> void:
	if history == null or not history.can_redo():
		return
	var entry: Dictionary = history.pop_for_redo()
	for piece: PieceInstance in entry["added"]:
		var placed: PieceInstance = world.place(piece.cell, piece.shape_id, piece.material_id)
		if placed != null:
			renderer.on_piece_added(placed)
	for piece: PieceInstance in entry["removed"]:
		var removed: PieceInstance = world.remove(piece.cell, piece.shape_id)
		if removed != null:
			renderer.on_piece_removed(removed)
	_update_history_label()

func _compute_target() -> Dictionary:
	var from := camera.global_position
	var dir := -camera.global_transform.basis.z
	var result := DDARaycaster.raycast(world, from, dir, RAY_DISTANCE)

	var point: Vector3
	if result.get("hit", false):
		point = (result["point"] as Vector3) + (result["normal"] as Vector3) * PLACE_OFFSET
	else:
		point = from + dir * RAY_DISTANCE

	var cell := Grid.world_to_cell(point)
	var shape_id: int
	if current_kind_is_wall:
		shape_id = _nearest_wall_face(cell, from)
	else:
		shape_id = Grid.Face.FLOOR

	return {"cell": cell, "shape_id": shape_id}

func _nearest_wall_face(cell: Vector3i, from_pos: Vector3) -> int:
	var center := Grid.cell_origin(cell) + Vector3.ONE * (Grid.CELL_SIZE / 2.0)
	var local := from_pos - center
	if abs(local.x) >= abs(local.z):
		return (Grid.Face.PX if local.x > 0.0 else Grid.Face.NX)
	else:
		return (Grid.Face.PZ if local.z > 0.0 else Grid.Face.NZ)

func _update_preview(target: Dictionary) -> void:
	var cell: Vector3i = target["cell"]
	var shape_id: int = target["shape_id"]

	if world.has_slot(cell, shape_id):
		_preview.visible = false
		return

	_preview.mesh = ShapeMesh.mesh_for(shape_id)
	_preview.material_override = Materials.get_material(current_material_id)
	_preview.transform = ShapeMesh.transform_for(cell, shape_id)
	_preview.visible = true

func _try_place(target: Dictionary) -> void:
	var cell: Vector3i = target["cell"]
	var shape_id: int = target["shape_id"]

	var slot_key := Grid.key(cell, shape_id)
	if slot_key == _last_place_key:
		return
	_last_place_key = slot_key

	var piece: PieceInstance = world.place(cell, shape_id, current_material_id)
	if piece != null:
		renderer.on_piece_added(piece)
		if _place_session != null:
			_place_session["added"].append(piece)

func _try_delete() -> void:
	var from := camera.global_position
	var dir := -camera.global_transform.basis.z
	var result := DDARaycaster.raycast(world, from, dir, RAY_DISTANCE)
	if not result.get("hit", false):
		return

	var cell: Vector3i = result["cell"]
	var face: int = result["face"]

	var slot_key := Grid.key(cell, face)
	if slot_key == _last_delete_key:
		return
	_last_delete_key = slot_key

	var piece: PieceInstance = world.remove(cell, face)
	if piece != null:
		renderer.on_piece_removed(piece)
		if _delete_session != null:
			_delete_session["removed"].append(piece)
