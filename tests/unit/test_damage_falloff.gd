extends GdUnitTestSuite
## DamageFalloff の距離減衰計算を検証する。


func test_full_damage_within_falloff_start() -> void:
	assert_float(DamageFalloff.compute_multiplier(5.0, 10.0, 30.0, 0.5)).is_equal(1.0)


func test_minimum_multiplier_beyond_falloff_end() -> void:
	assert_float(DamageFalloff.compute_multiplier(100.0, 10.0, 30.0, 0.5)).is_equal(0.5)


func test_linear_interpolation_at_midpoint() -> void:
	# start=10, end=30, midpoint=20 -> ちょうど半分減衰しているはず
	var multiplier: float = DamageFalloff.compute_multiplier(20.0, 10.0, 30.0, 0.5)
	assert_float(multiplier).is_equal_approx(0.75, 0.001)


func test_weapon_falloff_reduces_hit_damage_at_range() -> void:
	var weapon_data := WeaponData.new()
	weapon_data.damage_per_hit = 20.0
	weapon_data.damage_falloff_start_meters = 8.0
	weapon_data.damage_falloff_end_meters = 25.0
	weapon_data.damage_falloff_min_multiplier = 0.5

	var close_range_multiplier: float = DamageFalloff.compute_multiplier(
		2.0, weapon_data.damage_falloff_start_meters, weapon_data.damage_falloff_end_meters,
		weapon_data.damage_falloff_min_multiplier
	)
	var long_range_multiplier: float = DamageFalloff.compute_multiplier(
		25.0, weapon_data.damage_falloff_start_meters, weapon_data.damage_falloff_end_meters,
		weapon_data.damage_falloff_min_multiplier
	)

	assert_float(weapon_data.damage_per_hit * close_range_multiplier).is_equal(20.0)
	assert_float(weapon_data.damage_per_hit * long_range_multiplier).is_equal(10.0)
