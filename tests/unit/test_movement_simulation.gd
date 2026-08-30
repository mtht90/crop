extends GdUnitTestSuite
## MovementSimulation の決定論性とフレームレート非依存性を検証する（第8.2/Phase2 DoD）。
## サーバー/クライアントが同一コードパスを共有する前提が崩れていないかを、
## 同一入力列を2回流した際にビット一致することで確認する。


func _make_config() -> MoveConfig:
	var config := MoveConfig.new()
	config.move_speed = 6.0
	config.acceleration = 12.0
	config.ground_friction = 10.0
	config.air_control = 0.4
	config.jump_velocity = 6.0
	config.gravity = 20.0
	config.coyote_time_seconds = 0.1
	config.input_buffer_seconds = 0.12
	config.dash_duration_seconds = 0.2
	config.dash_speed = 14.0
	return config


func _make_commands(step_count: int, delta: float) -> Array[InputCommand]:
	var commands: Array[InputCommand] = []
	for tick: int in range(step_count):
		var cmd := InputCommand.new()
		cmd.tick = tick
		cmd.delta = delta
		cmd.move = Vector2(0.0, -1.0)
		cmd.look_yaw = 0.0
		cmd.look_pitch = 0.0
		cmd.buttons = InputButtons.JUMP if tick == 5 else 0
		commands.append(cmd)
	return commands


## 簡易接地判定: y<=0 なら地面に接地しているとみなす。物理エンジンを介さずに
## MovementSimulation 単体の決定論性を確認する目的のため、コリジョンは扱わない。
func _run_simulation(commands: Array[InputCommand], config: MoveConfig) -> MoveState:
	var state := MoveState.new()
	state.is_grounded = true
	for cmd: InputCommand in commands:
		state = MovementSimulation.step(state, cmd, config)
		if state.position.y <= 0.0 and state.velocity.y <= 0.0:
			state.position.y = 0.0
			state.velocity.y = 0.0
			state.is_grounded = true
		else:
			state.is_grounded = false
	return state


func test_movement_simulation_is_deterministic_across_runs() -> void:
	var config: MoveConfig = _make_config()
	var delta: float = 1.0 / 60.0
	var first_run_state: MoveState = _run_simulation(_make_commands(60, delta), config)
	var second_run_state: MoveState = _run_simulation(_make_commands(60, delta), config)

	assert_vector(first_run_state.position).is_equal(second_run_state.position)
	assert_vector(first_run_state.velocity).is_equal(second_run_state.velocity)
	assert_bool(first_run_state.is_dashing).is_equal(second_run_state.is_dashing)


## velocity の指数減衰式 v = lerp(v, target, 1-exp(-a*dt)) は、同じ経過時間であれば
## 分割ステップ数(=フレームレート)に依らず数学的に厳密に一致する（第4.2章）。
func test_velocity_is_framerate_independent_for_constant_target() -> void:
	var config: MoveConfig = _make_config()
	var total_seconds: float = 1.0

	var state_30fps: MoveState = _run_simulation(_make_commands(int(total_seconds * 30.0), 1.0 / 30.0), config)
	var state_60fps: MoveState = _run_simulation(_make_commands(int(total_seconds * 60.0), 1.0 / 60.0), config)
	var state_144fps: MoveState = _run_simulation(_make_commands(int(total_seconds * 144.0), 1.0 / 144.0), config)

	assert_float(state_30fps.velocity.z).is_equal_approx(state_60fps.velocity.z, 0.001)
	assert_float(state_60fps.velocity.z).is_equal_approx(state_144fps.velocity.z, 0.001)


func test_dash_ends_after_its_configured_duration() -> void:
	var config: MoveConfig = _make_config()
	var delta: float = 1.0 / 60.0
	var ticks_within_dash: int = int(config.dash_duration_seconds / delta) - 2
	var ticks_after_dash: int = int(config.dash_duration_seconds / delta) + 5

	var commands_within_dash: Array[InputCommand] = _make_commands(ticks_within_dash, delta)
	commands_within_dash[0].buttons = InputButtons.DASH
	var state_within_dash: MoveState = _run_simulation(commands_within_dash, config)
	assert_bool(state_within_dash.is_dashing).is_true()

	var commands_after_dash: Array[InputCommand] = _make_commands(ticks_after_dash, delta)
	commands_after_dash[0].buttons = InputButtons.DASH
	var state_after_dash: MoveState = _run_simulation(commands_after_dash, config)
	assert_bool(state_after_dash.is_dashing).is_false()
