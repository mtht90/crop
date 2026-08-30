extends GdUnitTestSuite
## NetworkComponent の入力バッファとリコンサイル起点を検証する。


func _make_config() -> MoveConfig:
	var config := MoveConfig.new()
	config.move_speed = 6.0
	config.acceleration = 12.0
	config.air_control = 0.4
	config.jump_velocity = 6.0
	config.gravity = 20.0
	config.coyote_time_seconds = 0.1
	config.input_buffer_seconds = 0.12
	config.dash_duration_seconds = 0.2
	config.dash_speed = 14.0
	return config


func _make_command(tick: int, delta: float) -> InputCommand:
	var cmd := InputCommand.new()
	cmd.tick = tick
	cmd.delta = delta
	cmd.move = Vector2.ZERO
	cmd.buttons = 0
	return cmd


func test_acknowledge_up_to_tick_trims_confirmed_inputs() -> void:
	var network_component := NetworkComponent.new()
	add_child(network_component)
	auto_free(network_component)

	for tick: int in range(10):
		network_component.record_input(_make_command(tick, 1.0 / 60.0))

	network_component.acknowledge_up_to_tick(5)

	assert_int(network_component.pending_inputs.size()).is_equal(4)
	for cmd: InputCommand in network_component.pending_inputs:
		assert_int(cmd.tick).is_greater(5)


func test_small_drift_does_not_trigger_reconciliation() -> void:
	var network_component := NetworkComponent.new()
	add_child(network_component)
	auto_free(network_component)
	network_component.record_input(_make_command(0, 1.0 / 60.0))

	var server_state := MoveState.new()
	server_state.position = Vector3(0.005, 0.0, 0.0)

	var result: Variant = network_component.reconcile_with_server(
		Vector3.ZERO, server_state, 0, _make_config(), 0.02
	)
	assert_object(result).is_null()


func test_large_drift_triggers_reconciliation() -> void:
	var network_component := NetworkComponent.new()
	add_child(network_component)
	auto_free(network_component)
	network_component.record_input(_make_command(0, 1.0 / 60.0))
	network_component.record_input(_make_command(1, 1.0 / 60.0))

	var server_state := MoveState.new()
	server_state.position = Vector3(50.0, 0.0, 0.0)
	server_state.is_grounded = true

	var result: MoveState = network_component.reconcile_with_server(
		Vector3.ZERO, server_state, 0, _make_config(), 0.02
	)
	assert_object(result).is_not_null()
	assert_int(network_component.get_last_resimulation_count()).is_equal(1)
