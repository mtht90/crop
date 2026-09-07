extends RefCounted

# セル・スロット単位のワールドデータ（純粋にデータのみ。描画は ChunkRenderer が担当）。
# キーは Grid.key() による正規化済みスロットキー。1スロットにつきパーツは1つだけ。

const Grid = preload("res://scripts/Grid.gd")
const PieceInstance = preload("res://scripts/PieceInstance.gd")

var _slots: Dictionary = {} # slot_key(String) -> PieceInstance

func has_slot(cell: Vector3i, shape_id: int) -> bool:
	return _slots.has(Grid.key(cell, shape_id))

func get_slot(cell: Vector3i, shape_id: int) -> PieceInstance:
	return _slots.get(Grid.key(cell, shape_id))

# 配置できたら PieceInstance を返す。既に埋まっていれば null。
func place(cell: Vector3i, shape_id: int, material_id: int) -> PieceInstance:
	var slot_key := Grid.key(cell, shape_id)
	if _slots.has(slot_key):
		return null
	var piece := PieceInstance.new(cell, shape_id, material_id)
	_slots[slot_key] = piece
	return piece

# 削除できたら削除された PieceInstance を返す。無ければ null。
func remove(cell: Vector3i, shape_id: int) -> PieceInstance:
	var slot_key := Grid.key(cell, shape_id)
	if not _slots.has(slot_key):
		return null
	var piece: PieceInstance = _slots[slot_key]
	_slots.erase(slot_key)
	return piece
