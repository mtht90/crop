extends GdUnitTestSuite
## RespawnFlow の死亡→キルカメラ→復帰の状態遷移を検証する（第6.2/6.4章）。


func test_death_starts_kill_cam_and_respawns_after_duration() -> void:
	var flow := RespawnFlow.new()
	assert_that(flow.get_current_state()).is_equal(&"alive")

	flow.handle_death(42)
	assert_that(flow.get_current_state()).is_equal(&"kill_cam")
	assert_int(flow.get_killer_hero_id()).is_equal(42)

	flow.advance(RespawnFlow.KILL_CAM_DURATION_SECONDS - 0.1)
	assert_that(flow.get_current_state()).is_equal(&"kill_cam")

	flow.advance(0.2)
	assert_that(flow.get_current_state()).is_equal(&"alive")


func test_respawned_signal_fires_when_kill_cam_completes() -> void:
	var flow := RespawnFlow.new()
	var respawned_count_box: Array[int] = [0]
	flow.respawned.connect(func() -> void: respawned_count_box[0] += 1)

	flow.handle_death(1)
	flow.advance(RespawnFlow.KILL_CAM_DURATION_SECONDS + 1.0)

	assert_int(respawned_count_box[0]).is_equal(1)


func test_death_while_already_in_kill_cam_is_ignored() -> void:
	var flow := RespawnFlow.new()
	flow.handle_death(1)
	flow.handle_death(2) # 既にkill_cam中なので無視されるはず

	assert_int(flow.get_killer_hero_id()).is_equal(1)
