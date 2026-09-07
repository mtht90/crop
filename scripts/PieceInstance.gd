extends RefCounted

# 1つの設置枠に置かれたパーツのデータ。形状(shape_id)と素材(material_id)は独立しており、
# 同じ shape_id のまま material_id だけ差し替えられる。

var cell: Vector3i
var shape_id: int
var material_id: int

func _init(p_cell: Vector3i, p_shape_id: int, p_material_id: int) -> void:
	cell = p_cell
	shape_id = p_shape_id
	material_id = p_material_id
