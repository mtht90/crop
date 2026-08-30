extends GdUnitTestSuite
## GameModeBase / TdmMode / CrystalAssaultMode / SpawnPointSelector を検証する（第6章）。


func test_game_mode_state_machine_follows_allowed_transitions() -> void:
	var mode := GameModeBase.new()
	add_child(mode)
	auto_free(mode)

	assert_that(mode.get_current_state()).is_equal(&"warmup")
	mode.start_round()
	assert_that(mode.get_current_state()).is_equal(&"live")
	assert_int(mode.get_round_number()).is_equal(1)

	mode.end_round(0)
	assert_that(mode.get_current_state()).is_equal(&"round_end")

	mode.start_round()
	assert_that(mode.get_current_state()).is_equal(&"live")
	assert_int(mode.get_round_number()).is_equal(2)


func test_tdm_win_condition_triggers_at_kill_limit() -> void:
	var tdm := TdmMode.new()
	add_child(tdm)
	auto_free(tdm)

	for _kill: int in range(TdmMode.CONFIG.kill_limit - 1):
		tdm.register_kill(0)
	assert_int(tdm.check_win_condition()).is_equal(-1)

	tdm.register_kill(0)
	assert_int(tdm.check_win_condition()).is_equal(0)


func test_tdm_win_condition_at_time_limit_picks_leading_team() -> void:
	var tdm := TdmMode.new()
	add_child(tdm)
	auto_free(tdm)

	tdm.register_kill(0)
	tdm.register_kill(0)
	tdm.register_kill(1)
	tdm.advance_time(TdmMode.CONFIG.time_limit_seconds + 1.0)

	assert_int(tdm.check_win_condition()).is_equal(0)


func test_spawn_point_selector_prefers_far_from_enemies_and_close_to_allies() -> void:
	var candidates: Array[Vector3] = [Vector3(0, 0, 0), Vector3(10, 0, 0), Vector3(-10, 0, 0)]
	var enemy_positions: Array[Vector3] = [Vector3(10, 0, 0)]
	var ally_positions: Array[Vector3] = [Vector3(-10, 0, 0)]

	var chosen: Vector3 = SpawnPointSelector.select_best_spawn(
		candidates, enemy_positions, ally_positions
	)
	assert_vector(chosen).is_equal(Vector3(-10, 0, 0))


func test_crystal_assault_captures_faster_with_more_attackers() -> void:
	var mode_with_one_attacker := CrystalAssaultMode.new()
	add_child(mode_with_one_attacker)
	auto_free(mode_with_one_attacker)
	mode_with_one_attacker.advance_capture(1.0, 0, 1)

	var mode_with_three_attackers := CrystalAssaultMode.new()
	add_child(mode_with_three_attackers)
	auto_free(mode_with_three_attackers)
	mode_with_three_attackers.advance_capture(1.0, 0, 3)

	assert_float(mode_with_three_attackers.get_progress_ratio()).is_greater(
		mode_with_one_attacker.get_progress_ratio()
	)


func test_crystal_assault_switching_team_resets_progress() -> void:
	var mode := CrystalAssaultMode.new()
	add_child(mode)
	auto_free(mode)

	mode.advance_capture(1.0, 0, 1)
	var progress_before_switch: float = mode.get_progress_ratio()
	assert_float(progress_before_switch).is_greater(0.0)

	mode.advance_capture(0.1, 1, 1)
	assert_int(mode.get_capturing_team_id()).is_equal(1)
	assert_float(mode.get_progress_ratio()).is_less(progress_before_switch)


func test_crystal_assault_emits_point_captured_when_progress_reaches_full() -> void:
	var mode := CrystalAssaultMode.new()
	add_child(mode)
	auto_free(mode)

	# GDScript のラムダはローカル変数を値でキャプチャするため、シグナル経由で
	# 外側の変数を書き換えるには可変コンテナ（配列）越しに参照する必要がある。
	var captured_team_id_box: Array[int] = [-999]
	mode.point_captured.connect(func(team_id: int) -> void: captured_team_id_box[0] = team_id)

	mode.advance_capture(CrystalAssaultMode.CONFIG.capture_seconds_at_one_attacker + 1.0, 0, 1)

	assert_int(captured_team_id_box[0]).is_equal(0)
