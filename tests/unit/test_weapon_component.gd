extends GdUnitTestSuite
## WeaponComponent の発射レート制限・弾数管理・リロード・スプレッド減衰を検証する。

const HERO_BASE_SCENE: PackedScene = preload("res://scenes/hero/hero_base.tscn")
const NO_HIT_TRANSFORM: Transform3D = Transform3D.IDENTITY


func _make_weapon_data() -> WeaponData:
	var weapon_data := WeaponData.new()
	weapon_data.weapon_id = &"test_weapon"
	weapon_data.fire_mode_type = WeaponData.FireModeType.HITSCAN
	weapon_data.damage_per_hit = 10.0
	weapon_data.fire_rate_rounds_per_second = 10.0
	weapon_data.magazine_size = 3
	weapon_data.reload_seconds = 1.0
	weapon_data.recoil_random_factor = 0.0
	return weapon_data


func _make_weapon_component() -> WeaponComponent:
	var weapon_component := WeaponComponent.new()
	add_child(weapon_component)
	auto_free(weapon_component)
	weapon_component.initialize(_make_weapon_data())
	return weapon_component


func test_fire_rate_gates_shots_within_the_minimum_interval() -> void:
	var weapon_component: WeaponComponent = _make_weapon_component()
	var space_state: PhysicsDirectSpaceState3D = get_tree().root.get_world_3d().direct_space_state

	# fire_rate=10rps -> 最小間隔0.1秒。deltaを0.05秒ずつ与えれば、1発目は発射され
	# 2発目(0.05秒後)はまだゲートされているはず。
	weapon_component.process_tick(0.05, true, NO_HIT_TRANSFORM, space_state, 1)
	assert_int(weapon_component.get_current_ammo()).is_equal(2)

	weapon_component.process_tick(0.05, true, NO_HIT_TRANSFORM, space_state, 1)
	assert_int(weapon_component.get_current_ammo()).is_equal(2)

	weapon_component.process_tick(0.05, true, NO_HIT_TRANSFORM, space_state, 1)
	assert_int(weapon_component.get_current_ammo()).is_equal(1)


func test_reload_restores_full_magazine_after_configured_duration() -> void:
	var weapon_component: WeaponComponent = _make_weapon_component()
	var space_state: PhysicsDirectSpaceState3D = get_tree().root.get_world_3d().direct_space_state

	weapon_component.process_tick(0.2, true, NO_HIT_TRANSFORM, space_state, 1)
	assert_int(weapon_component.get_current_ammo()).is_equal(2)

	weapon_component.request_reload()
	assert_bool(weapon_component.is_reloading()).is_true()

	weapon_component.process_tick(0.5, false, NO_HIT_TRANSFORM, space_state, 1)
	assert_bool(weapon_component.is_reloading()).is_true()

	weapon_component.process_tick(0.6, false, NO_HIT_TRANSFORM, space_state, 1)
	assert_bool(weapon_component.is_reloading()).is_false()
	assert_int(weapon_component.get_current_ammo()).is_equal(3)


func test_cannot_fire_with_an_empty_magazine() -> void:
	var weapon_component: WeaponComponent = _make_weapon_component()
	var space_state: PhysicsDirectSpaceState3D = get_tree().root.get_world_3d().direct_space_state

	for _shot: int in range(3):
		weapon_component.process_tick(0.2, true, NO_HIT_TRANSFORM, space_state, 1)
	assert_int(weapon_component.get_current_ammo()).is_equal(0)

	weapon_component.process_tick(0.2, true, NO_HIT_TRANSFORM, space_state, 1)
	assert_int(weapon_component.get_current_ammo()).is_equal(0)


func test_spread_increases_on_fire_and_decays_over_time() -> void:
	var weapon_component: WeaponComponent = _make_weapon_component()
	weapon_component.weapon_data.recoil_random_factor = 0.05
	var space_state: PhysicsDirectSpaceState3D = get_tree().root.get_world_3d().direct_space_state

	weapon_component.process_tick(0.2, true, NO_HIT_TRANSFORM, space_state, 1)
	assert_float(weapon_component.get_spread_radians()).is_greater(0.0)

	var spread_after_fire: float = weapon_component.get_spread_radians()
	weapon_component.process_tick(1.0, false, NO_HIT_TRANSFORM, space_state, 1)
	assert_float(weapon_component.get_spread_radians()).is_less(spread_after_fire)
