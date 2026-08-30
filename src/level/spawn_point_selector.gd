class_name SpawnPointSelector extends RefCounted
## 「敵から最も遠く、味方に近い」動的スポーン選択を行う純粋関数（第6.4章）。

static func select_best_spawn(
	candidate_positions: Array[Vector3], enemy_positions: Array[Vector3], ally_positions: Array[Vector3]
) -> Vector3:
	var best_position: Vector3 = candidate_positions[0]
	var best_score: float = -INF
	for candidate: Vector3 in candidate_positions:
		var score: float = _score_candidate(candidate, enemy_positions, ally_positions)
		if score > best_score:
			best_score = score
			best_position = candidate
	return best_position


static func _score_candidate(
	candidate: Vector3, enemy_positions: Array[Vector3], ally_positions: Array[Vector3]
) -> float:
	var distance_to_nearest_enemy: float = _nearest_distance(candidate, enemy_positions)
	var distance_to_nearest_ally: float = _nearest_distance(candidate, ally_positions)
	return distance_to_nearest_enemy - distance_to_nearest_ally


static func _nearest_distance(candidate: Vector3, positions: Array[Vector3]) -> float:
	if positions.is_empty():
		return 0.0
	var nearest_distance: float = INF
	for position: Vector3 in positions:
		nearest_distance = minf(nearest_distance, candidate.distance_to(position))
	return nearest_distance
