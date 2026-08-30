extends GdUnitTestSuite
## サーバーリコンサイルの決定論性を検証する（第5.4章 / 第8.2章 リコンサイルテスト）。
## 意図的にサーバー状態をずらし、再シミュレーション後にクライアント予測へ収束することを
## 確認する。


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
	cmd.move = Vector2(0.0, -1.0)
	cmd.look_yaw = 0.0
	cmd.look_pitch = 0.0
	cmd.buttons = 0
	return cmd


func test_small_error_does_not_trigger_resimulation() -> void:
	var predicted_position: Vector3 = Vector3(1.0, 0.0, 1.0)
	var server_position: Vector3 = predicted_position + Vector3(0.005, 0.0, 0.0)

	assert_bool(
		Reconciliation.needs_resimulation(predicted_position, server_position, 0.02)
	).is_false()


func test_large_error_triggers_resimulation_and_converges() -> void:
	var config: MoveConfig = _make_config()
	var delta: float = 1.0 / 60.0

	# クライアントは tick 0..9 まで予測済み（サーバーの確定値とはズレているとする）。
	var pending_inputs: Array[InputCommand] = []
	for tick: int in range(10):
		pending_inputs.append(_make_command(tick, delta))

	# サーバーは tick 4 の時点で異なる位置を確定させた（例: 別プレイヤーとの衝突等）。
	var server_state := MoveState.new()
	server_state.position = Vector3(100.0, 0.0, 100.0)
	server_state.velocity = Vector3.ZERO
	server_state.is_grounded = true
	var server_tick: int = 4

	assert_bool(
		Reconciliation.needs_resimulation(Vector3.ZERO, server_state.position, 0.02)
	).is_true()

	var result: Reconciliation.ReconciliationResult = Reconciliation.reconcile(
		server_state, server_tick, pending_inputs, config, 0.02
	)

	# tick 5..9 (server_tickより後) の5入力だけが再適用され、サーバー確定位置を
	# 起点に前進しているはず。
	var expected_state: MoveState = server_state.duplicate_state()
	for cmd: InputCommand in pending_inputs:
		if cmd.tick <= server_tick:
			continue
		expected_state = MovementSimulation.step(expected_state, cmd, config)

	assert_vector(result.corrected_state.position).is_equal(expected_state.position)
	assert_vector(result.corrected_state.velocity).is_equal(expected_state.velocity)


func test_reconciliation_is_deterministic_across_repeated_runs() -> void:
	var config: MoveConfig = _make_config()
	var delta: float = 1.0 / 60.0
	var pending_inputs: Array[InputCommand] = []
	for tick: int in range(20):
		pending_inputs.append(_make_command(tick, delta))

	var server_state := MoveState.new()
	server_state.position = Vector3(5.0, 0.0, 5.0)
	server_state.is_grounded = true

	var first_result: Reconciliation.ReconciliationResult = Reconciliation.reconcile(
		server_state, 8, pending_inputs, config, 0.02
	)
	var second_result: Reconciliation.ReconciliationResult = Reconciliation.reconcile(
		server_state, 8, pending_inputs, config, 0.02
	)

	assert_vector(first_result.corrected_state.position).is_equal(second_result.corrected_state.position)
