extends GdUnitTestSuite
## サーバー権威の入力検証（速度・発射レート）を検証する（第5.7章 チート耐性）。


func test_movement_within_max_speed_is_accepted() -> void:
	var previous_position := Vector3.ZERO
	var new_position := Vector3(1.0, 0.0, 0.0) # 6 m/s の移動速度で 1/60 秒 = 0.1m
	assert_bool(
		ServerValidation.is_movement_within_bounds(previous_position, new_position, 1.0, 6.0)
	).is_true()


func test_movement_beyond_max_speed_is_rejected() -> void:
	var previous_position := Vector3.ZERO
	var new_position := Vector3(100.0, 0.0, 0.0)
	assert_bool(
		ServerValidation.is_movement_within_bounds(previous_position, new_position, 1.0, 6.0)
	).is_false()


func test_fire_interval_at_full_rate_is_accepted() -> void:
	var fire_rate: float = 10.0 # 0.1秒間隔
	assert_bool(ServerValidation.is_fire_interval_within_bounds(0.1, fire_rate)).is_true()


func test_fire_interval_faster_than_95_percent_of_rate_is_rejected() -> void:
	var fire_rate: float = 10.0
	assert_bool(ServerValidation.is_fire_interval_within_bounds(0.05, fire_rate)).is_false()
