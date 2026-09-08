extends RefCounted

# shape_id（Grid.Face の値）ごとのメッシュ形状とセル内配置。
# 仕様書3.3の方針どおり、メッシュは shape_id ごとに1回だけ生成してキャッシュする。
#
# UVはBoxMeshの既定（面ごとに単純0〜1）に任せず、面の実寸をもとに自前で張る。
# 「セル1辺 TILE_SIZE でテクスチャ1タイル」を壁・床・将来の階段/屋根すべてで
# 揃えるため（仕様書4章）、面のサイズが変わってもタイル密度が変わらないようにする。

const Grid = preload("res://scripts/Grid.gd")

const WALL_THICKNESS := 0.12
const FLOOR_THICKNESS := 0.12
const TILE_SIZE := Grid.CELL_SIZE

static var _mesh_cache: Dictionary = {}

static func mesh_for(shape_id: int) -> ArrayMesh:
	if _mesh_cache.has(shape_id):
		return _mesh_cache[shape_id]

	var mesh := _build_box_mesh(_size_for(shape_id))
	_mesh_cache[shape_id] = mesh
	return mesh

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

static func _size_for(shape_id: int) -> Vector3:
	match shape_id:
		Grid.Face.PX, Grid.Face.NX:
			return Vector3(WALL_THICKNESS, Grid.CELL_SIZE, Grid.CELL_SIZE)
		Grid.Face.PZ, Grid.Face.NZ:
			return Vector3(Grid.CELL_SIZE, Grid.CELL_SIZE, WALL_THICKNESS)
		_:
			return Vector3(Grid.CELL_SIZE, FLOOR_THICKNESS, Grid.CELL_SIZE)

# 中心を原点とした直方体を6面ぶん自前で組み立てる。各面のUVは実寸/TILE_SIZEで
# 張るので、法線マップ付きテクスチャを貼ってもタイルの大きさが面ごとに揃う。
static func _build_box_mesh(size: Vector3) -> ArrayMesh:
	var hx := size.x / 2.0
	var hy := size.y / 2.0
	var hz := size.z / 2.0

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	_add_face(st, Vector3(hx, 0.0, 0.0), Vector3.RIGHT, Vector3.UP, Vector3.BACK, size.y, size.z)
	_add_face(st, Vector3(-hx, 0.0, 0.0), Vector3.LEFT, Vector3.BACK, Vector3.UP, size.z, size.y)
	_add_face(st, Vector3(0.0, hy, 0.0), Vector3.UP, Vector3.BACK, Vector3.RIGHT, size.z, size.x)
	_add_face(st, Vector3(0.0, -hy, 0.0), Vector3.DOWN, Vector3.RIGHT, Vector3.BACK, size.x, size.z)
	_add_face(st, Vector3(0.0, 0.0, hz), Vector3.BACK, Vector3.RIGHT, Vector3.UP, size.x, size.y)
	_add_face(st, Vector3(0.0, 0.0, -hz), Vector3.FORWARD, Vector3.UP, Vector3.RIGHT, size.y, size.x)

	st.generate_tangents()
	return st.commit()

# u_axis × v_axis は必ず normal と一致させること（面の表裏とワインディングのため）。
static func _add_face(st: SurfaceTool, center: Vector3, normal: Vector3, u_axis: Vector3, v_axis: Vector3, u_len: float, v_len: float) -> void:
	var u_half := u_axis * (u_len / 2.0)
	var v_half := v_axis * (v_len / 2.0)

	var p00 := center - u_half - v_half
	var p10 := center + u_half - v_half
	var p11 := center + u_half + v_half
	var p01 := center - u_half + v_half

	var uv00 := Vector2(0.0, 0.0)
	var uv10 := Vector2(u_len / TILE_SIZE, 0.0)
	var uv11 := Vector2(u_len / TILE_SIZE, v_len / TILE_SIZE)
	var uv01 := Vector2(0.0, v_len / TILE_SIZE)

	_add_tri(st, normal, p00, p10, p11, uv00, uv10, uv11)
	_add_tri(st, normal, p00, p11, p01, uv00, uv11, uv01)

static func _add_tri(st: SurfaceTool, normal: Vector3, p0: Vector3, p1: Vector3, p2: Vector3, uv0: Vector2, uv1: Vector2, uv2: Vector2) -> void:
	st.set_normal(normal)
	st.set_uv(uv0)
	st.add_vertex(p0)
	st.set_normal(normal)
	st.set_uv(uv1)
	st.add_vertex(p1)
	st.set_normal(normal)
	st.set_uv(uv2)
	st.add_vertex(p2)
