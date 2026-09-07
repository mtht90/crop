class_name Grid

# 仕様書 1.1 / 1.2: セル寸法とパーツの枠、壁の所有権の正規化。
const CELL_SIZE := 2.5

enum Face { PX, NX, PZ, NZ, FLOOR }

static func world_to_cell(p: Vector3) -> Vector3i:
	return Vector3i(
		int(floor(p.x / CELL_SIZE)),
		int(floor(p.y / CELL_SIZE)),
		int(floor(p.z / CELL_SIZE))
	)

static func cell_origin(cell: Vector3i) -> Vector3:
	return Vector3(cell.x, cell.y, cell.z) * CELL_SIZE

# -X / -Z 側の壁は隣接セルの +X / +Z 側として一意化する。
static func canonical(cell: Vector3i, face: Face) -> Array:
	match face:
		Face.NX:
			return [cell + Vector3i(-1, 0, 0), Face.PX]
		Face.NZ:
			return [cell + Vector3i(0, 0, -1), Face.PZ]
		_:
			return [cell, face]

static func key(cell: Vector3i, face: Face) -> String:
	var canon: Array = canonical(cell, face)
	var canon_cell: Vector3i = canon[0]
	var canon_face: int = canon[1]
	return "%d_%d_%d_%d" % [canon_cell.x, canon_cell.y, canon_cell.z, canon_face]
