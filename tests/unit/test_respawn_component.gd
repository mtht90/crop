extends GdUnitTestSuite
## RespawnComponent の無敵時間管理を検証する（第6.4章）。


func test_starts_and_expires_invulnerability_after_configured_duration() -> void:
	var respawn_component := RespawnComponent.new()
	add_child(respawn_component)
	auto_free(respawn_component)

	assert_bool(respawn_component.is_invulnerable()).is_false()

	respawn_component.start_invulnerability()
	assert_bool(respawn_component.is_invulnerable()).is_true()

	respawn_component._process(RespawnComponent.INVULNERABILITY_DURATION_SECONDS - 0.1)
	assert_bool(respawn_component.is_invulnerable()).is_true()

	respawn_component._process(0.2)
	assert_bool(respawn_component.is_invulnerable()).is_false()


func test_invulnerability_ended_signal_fires_exactly_once() -> void:
	var respawn_component := RespawnComponent.new()
	add_child(respawn_component)
	auto_free(respawn_component)

	var ended_count_box: Array[int] = [0]
	respawn_component.invulnerability_ended.connect(
		func() -> void: ended_count_box[0] += 1
	)

	respawn_component.start_invulnerability()
	respawn_component._process(RespawnComponent.INVULNERABILITY_DURATION_SECONDS + 0.1)
	respawn_component._process(1.0)

	assert_int(ended_count_box[0]).is_equal(1)
