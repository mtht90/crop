extends Node3D

# 仕様書12章: (shape_id, material_id) ごと、チャンクごとに MultiMeshInstance3D へまとめる。
# パーツの追加・削除では、影響する (チャンク, shape_id, material_id) の
# MultiMesh だけを再構築する。全体やチャンク全部の作り直しはしない。

const Grid = preload("res://scripts/Grid.gd")
const ShapeMesh = preload("res://scripts/ShapeMesh.gd")
const Materials = preload("res://scripts/Materials.gd")
const PieceInstance = preload("res://scripts/PieceInstance.gd")

const CHUNK_SIZE_CELLS := 16

var _groups: Dictionary = {}       # group_key(String) -> Dictionary(slot_key -> PieceInstance)
var _group_nodes: Dictionary = {}  # group_key(String) -> MultiMeshInstance3D

func on_piece_added(piece: PieceInstance) -> void:
	var gkey := _group_key(piece)
	var slot_key := Grid.key(piece.cell, piece.shape_id)

	if not _groups.has(gkey):
		_groups[gkey] = {}
	_groups[gkey][slot_key] = piece

	_rebuild_group(gkey, piece.shape_id, piece.material_id)

func on_piece_removed(piece: PieceInstance) -> void:
	if piece == null:
		return

	var gkey := _group_key(piece)
	var slot_key := Grid.key(piece.cell, piece.shape_id)
	if not _groups.has(gkey):
		return

	var pieces: Dictionary = _groups[gkey]
	pieces.erase(slot_key)

	if pieces.is_empty():
		_groups.erase(gkey)
		if _group_nodes.has(gkey):
			(_group_nodes[gkey] as Node).queue_free()
			_group_nodes.erase(gkey)
	else:
		_rebuild_group(gkey, piece.shape_id, piece.material_id)

func _rebuild_group(gkey: String, shape_id: int, material_id: int) -> void:
	var pieces: Dictionary = _groups[gkey]

	var mmi: MultiMeshInstance3D
	if _group_nodes.has(gkey):
		mmi = _group_nodes[gkey]
	else:
		mmi = MultiMeshInstance3D.new()
		var new_mm := MultiMesh.new()
		new_mm.transform_format = MultiMesh.TRANSFORM_3D
		new_mm.mesh = ShapeMesh.mesh_for(shape_id)
		mmi.multimesh = new_mm
		mmi.material_override = Materials.get_material(material_id)
		add_child(mmi)
		_group_nodes[gkey] = mmi

	var mm: MultiMesh = mmi.multimesh
	mm.instance_count = pieces.size()

	var i := 0
	for slot_key in pieces:
		var piece: PieceInstance = pieces[slot_key]
		mm.set_instance_transform(i, ShapeMesh.transform_for(piece.cell, piece.shape_id))
		i += 1

func _chunk_of(cell: Vector3i) -> Vector3i:
	return Vector3i(
		int(floor(float(cell.x) / CHUNK_SIZE_CELLS)),
		int(floor(float(cell.y) / CHUNK_SIZE_CELLS)),
		int(floor(float(cell.z) / CHUNK_SIZE_CELLS))
	)

func _group_key(piece: PieceInstance) -> String:
	var chunk := _chunk_of(piece.cell)
	return "%d_%d_%d_%d_%d" % [chunk.x, chunk.y, chunk.z, piece.shape_id, piece.material_id]
