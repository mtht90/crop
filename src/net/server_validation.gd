class_name ServerValidation extends RefCounted
## サーバー権威の入力検証（第5.7章）。クライアントの主張を信用せず、
## 移動距離等をサーバー側で必ず再検証する。

const MAX_SPEED_TOLERANCE_FACTOR: float = 1.1


static func is_movement_within_bounds(
	previous_position: Vector3, new_position: Vector3, delta: float, max_speed: float
) -> bool:
	if delta <= 0.0:
		return true
	var traveled_distance: float = previous_position.distance_to(new_position)
	var max_allowed_distance: float = max_speed * delta * MAX_SPEED_TOLERANCE_FACTOR
	return traveled_distance <= max_allowed_distance


static func is_fire_interval_within_bounds(
	time_since_last_shot: float, fire_rate_rounds_per_second: float
) -> bool:
	var min_interval_seconds: float = 1.0 / fire_rate_rounds_per_second
	## 95%未満の間隔（過度な連射)を拒否する（第5.7章）。
	return time_since_last_shot >= min_interval_seconds * 0.95
