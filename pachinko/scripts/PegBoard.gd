@tool
class_name PegBoard
extends Node2D

## 釘の集合を管理するコンテナ。addons/peg_layout_editorから操作される。
## エディタ上で追加/削除した釘はシーンに直接保存されるほか、
## PegLayoutResource(.tres)への書き出し/読込にも対応し、盤面デザインを
## 差し替え可能なアセットとして扱えるようにする。

const PegScene: PackedScene = preload("res://scenes/Peg.tscn")

@export var layout_path: String = "res://resources/layouts/phase1_default_layout.tres"
@export var auto_load_on_ready: bool = true
@export var remove_distance: float = 12.0

func _ready() -> void:
	if Engine.is_editor_hint():
		return
	if auto_load_on_ready and get_child_count() == 0:
		load_layout()

func add_peg(local_position: Vector2) -> StaticBody2D:
	var peg: StaticBody2D = PegScene.instantiate()
	add_child(peg)
	if Engine.is_editor_hint():
		var edited_root := get_tree().edited_scene_root
		if edited_root != null:
			peg.owner = edited_root
	peg.position = local_position
	peg.name = "Peg%d" % get_child_count()
	return peg

func remove_peg_near(local_position: Vector2) -> bool:
	var closest: Node = null
	var closest_dist: float = INF
	for child in get_children():
		var dist: float = (child as Node2D).position.distance_to(local_position)
		if dist < closest_dist:
			closest_dist = dist
			closest = child
	if closest != null and closest_dist <= remove_distance:
		closest.queue_free()
		return true
	return false

func clear_pegs() -> void:
	# load_layout()がclear_pegs()直後に新しい釘を追加するため、queue_free()の
	# 遅延破棄だと同名ノードが一時的に共存し命名がずれる。ここでは即時破棄する。
	for child in get_children():
		remove_child(child)
		child.free()

func save_layout() -> void:
	var res := PegLayoutResource.new()
	res.peg_positions = []
	for child in get_children():
		res.peg_positions.append((child as Node2D).position)
	var err := ResourceSaver.save(res, layout_path)
	if err != OK:
		push_error("PegBoard: レイアウトの保存に失敗しました (%s): %s" % [layout_path, err])

func load_layout() -> void:
	if not ResourceLoader.exists(layout_path):
		push_warning("PegBoard: レイアウトが見つかりません: %s" % layout_path)
		return
	var res := ResourceLoader.load(layout_path) as PegLayoutResource
	if res == null:
		push_error("PegBoard: レイアウトの読込に失敗しました: %s" % layout_path)
		return
	clear_pegs()
	for pos in res.peg_positions:
		add_peg(pos)
