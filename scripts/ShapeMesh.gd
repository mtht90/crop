extends RefCounted

# shape_id（Grid.Face の値）ごとのメッシュ形状とセル内配置。
# 仕様書3.3の方針どおり、メッシュは shape_id ごとに1回だけ生成してキャッシュする。

const Grid = preload("res://scripts/Grid.gd")

const WALL_THICKNESS := 0.12
const FLOOR_THICKNESS := 0.12

static var _mesh_cache: Dictionary = {}

static func mesh_for(shape_id: int) -> BoxMesh:
	if _mesh_cache.has(shape_id):
		return _mesh_cache[shape_id]

	var box := BoxMesh.new()
	match shape_id:
		Grid.Face.PX, Grid.Face.NX:
			box.size = Vector3(WALL_THICKNESS, Grid.CELL_SIZE, Grid.CELL_SIZE)
		Grid.Face.PZ, Grid.Face.NZ:
			box.size = Vector3(Grid.CELL_SIZE, Grid.CELL_SIZE, WALL_THICKNESS)
		Grid.Face.FLOOR:
			box.size = Vector3(Grid.CELL_SIZE, FLOOR_THICKNESS, Grid.CELL_SIZE)
	_mesh_cache[shape_id] = box
	return box

static func local_offset_for(shape_id: int) -> Vector3:
	var half := Grid.CELL_SIZE / 2.0
	match shape_id:
		Grid.Face.PX:
			return Vector3(Grid.CELL_SIZE, half, half)
		Grid.Face.NX:
			return Vector3(0.0, half, half)
		Grid.Face.PZ:
			return Vector3(half, half, Grid.CELL_SIZE)
		Grid.Face.NZ:
			return Vector3(half, half, 0.0)
		Grid.Face.FLOOR:
			return Vector3(half, 0.0, half)
	return Vector3.ZERO

static func transform_for(cell: Vector3i, shape_id: int) -> Transform3D:
	return Transform3D(Basis(), Grid.cell_origin(cell) + local_offset_for(shape_id))
