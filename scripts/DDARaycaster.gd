extends RefCounted

# 物理エンジンを使わず、セルグリッドを DDA (Amanatides & Woo) でたどって
# 最初にヒットするスロット(セル+面)を探すレイキャスト。
# パーツはもう個別の StaticBody3D を持たないため、World のデータに対して直接判定する。

const Grid = preload("res://scripts/Grid.gd")

# world_data: World インスタンス。占有チェックに使う。
# ("cast" という名前は GDScript の組み込み解決と衝突して呼び出せなかったため raycast とする。
static func raycast(world_data: RefCounted, origin: Vector3, dir: Vector3, max_distance: float) -> Dictionary:
	var cell := Grid.world_to_cell(origin)

	var step := Vector3i(
		(1 if dir.x > 0.0 else (-1 if dir.x < 0.0 else 0)),
		(1 if dir.y > 0.0 else (-1 if dir.y < 0.0 else 0)),
		(1 if dir.z > 0.0 else (-1 if dir.z < 0.0 else 0))
	)

	var t_delta := Vector3(
		(Grid.CELL_SIZE / abs(dir.x)) if dir.x != 0.0 else INF,
		(Grid.CELL_SIZE / abs(dir.y)) if dir.y != 0.0 else INF,
		(Grid.CELL_SIZE / abs(dir.z)) if dir.z != 0.0 else INF
	)

	var t_max := Vector3(
		_first_boundary_t(origin.x, dir.x, cell.x),
		_first_boundary_t(origin.y, dir.y, cell.y),
		_first_boundary_t(origin.z, dir.z, cell.z)
	)

	while true:
		var axis := 0
		if t_max.y < t_max.x and t_max.y < t_max.z:
			axis = 1
		elif t_max.z < t_max.x and t_max.z < t_max.y:
			axis = 2

		var next_t: float = t_max[axis]
		if next_t > max_distance:
			return {"hit": false}

		var prev_cell := cell
		match axis:
			0:
				cell.x += step.x
			1:
				cell.y += step.y
			2:
				cell.z += step.z

		var face: int
		var normal := Vector3.ZERO
		var hit_cell: Vector3i
		match axis:
			0:
				face = Grid.Face.PX
				if step.x > 0:
					hit_cell = prev_cell
					normal = Vector3(-1.0, 0.0, 0.0)
				else:
					hit_cell = cell
					normal = Vector3(1.0, 0.0, 0.0)
			2:
				face = Grid.Face.PZ
				if step.z > 0:
					hit_cell = prev_cell
					normal = Vector3(0.0, 0.0, -1.0)
				else:
					hit_cell = cell
					normal = Vector3(0.0, 0.0, 1.0)
			_:
				face = Grid.Face.FLOOR
				if step.y > 0:
					hit_cell = cell
					normal = Vector3(0.0, -1.0, 0.0)
				else:
					hit_cell = prev_cell
					normal = Vector3(0.0, 1.0, 0.0)

		if world_data.has_slot(hit_cell, face):
			return {
				"hit": true,
				"cell": hit_cell,
				"face": face,
				"normal": normal,
				"point": origin + dir * next_t,
				"distance": next_t,
			}

		t_max[axis] += t_delta[axis]

	# GDScript の静的解析は `while true` が必ず return することを認識しないため、
	# 到達しないが明示的な return を置いてコンパイルエラーを避ける。
	return {"hit": false}

static func _first_boundary_t(origin_axis: float, dir_axis: float, cell_axis: int) -> float:
	if dir_axis == 0.0:
		return INF
	var boundary: float
	if dir_axis > 0.0:
		boundary = float(cell_axis + 1) * Grid.CELL_SIZE
	else:
		boundary = float(cell_axis) * Grid.CELL_SIZE
	return (boundary - origin_axis) / dir_axis
