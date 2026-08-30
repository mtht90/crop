class_name MovementSimulation extends RefCounted
## 決定論的な移動計算の純粋関数。クライアント予測とサーバーは物理的に同一のこのコードを
## 呼び出さなければならない（第5.3章）。シーンツリー・move_and_slide には一切触れない。
## 衝突解決（実際の move_and_slide 呼び出し）は呼び出し側の MovementComponent が担う。

## 速度は velocity = lerp(velocity, target, 1.0 - exp(-accel * delta)) の指数減衰式で
## 更新する。この式は分割ステップの積み重ねに対して数学的に厳密なため、
## フレームレートが変わっても最終速度は変わらない（第4.2章）。
static func step(state: MoveState, cmd: InputCommand, config: MoveConfig) -> MoveState:
	var next_state: MoveState = state.duplicate_state()

	next_state.time_since_grounded = 0.0 if state.is_grounded else state.time_since_grounded + cmd.delta
	var jump_pressed: bool = (cmd.buttons & InputButtons.JUMP) != 0
	next_state.time_since_jump_pressed = 0.0 if jump_pressed else state.time_since_jump_pressed + cmd.delta

	_step_dash_phase(state, next_state, cmd, config)

	var move_direction: Vector3 = _compute_move_direction(cmd)

	if next_state.is_dashing:
		_apply_dash_velocity(next_state, move_direction, config)
	else:
		_apply_ground_air_velocity(state, next_state, move_direction, config, cmd.delta)

	_apply_jump_or_gravity(state, next_state, config, cmd.delta)

	next_state.position = state.position + next_state.velocity * cmd.delta

	return next_state


static func _step_dash_phase(
	state: MoveState, next_state: MoveState, cmd: InputCommand, config: MoveConfig
) -> void:
	var wants_dash: bool = (cmd.buttons & InputButtons.DASH) != 0
	if wants_dash and not state.is_dashing:
		next_state.is_dashing = true
		next_state.dash_elapsed_seconds = 0.0
	elif state.is_dashing:
		next_state.dash_elapsed_seconds = state.dash_elapsed_seconds + cmd.delta
		if next_state.dash_elapsed_seconds >= config.dash_duration_seconds:
			next_state.is_dashing = false
			next_state.dash_elapsed_seconds = 0.0


static func _compute_move_direction(cmd: InputCommand) -> Vector3:
	var horizontal_input: Vector2 = cmd.move
	if horizontal_input.length_squared() > 1.0:
		horizontal_input = horizontal_input.normalized()
	return Vector3(horizontal_input.x, 0.0, horizontal_input.y).rotated(Vector3.UP, cmd.look_yaw)


static func _apply_dash_velocity(next_state: MoveState, move_direction: Vector3, config: MoveConfig) -> void:
	var dash_curve_factor: float = 1.0
	if config.dash_curve != null:
		dash_curve_factor = config.dash_curve.sample(
			clampf(next_state.dash_elapsed_seconds / config.dash_duration_seconds, 0.0, 1.0)
		)
	var dash_velocity: Vector3 = move_direction * config.dash_speed * dash_curve_factor
	next_state.velocity.x = dash_velocity.x
	next_state.velocity.z = dash_velocity.z


static func _apply_ground_air_velocity(
	state: MoveState, next_state: MoveState, move_direction: Vector3, config: MoveConfig, delta: float
) -> void:
	var target_horizontal_velocity: Vector3 = move_direction * config.move_speed
	var control_factor: float = 1.0 if state.is_grounded else config.air_control
	var accel_this_step: float = config.acceleration * control_factor
	var lerp_weight: float = 1.0 - exp(-accel_this_step * delta)
	next_state.velocity.x = lerpf(state.velocity.x, target_horizontal_velocity.x, lerp_weight)
	next_state.velocity.z = lerpf(state.velocity.z, target_horizontal_velocity.z, lerp_weight)


static func _apply_jump_or_gravity(
	state: MoveState, next_state: MoveState, config: MoveConfig, delta: float
) -> void:
	var can_jump: bool = next_state.time_since_grounded <= config.coyote_time_seconds
	var jump_buffered: bool = next_state.time_since_jump_pressed <= config.input_buffer_seconds
	if jump_buffered and can_jump and state.velocity.y <= 0.0:
		next_state.velocity.y = config.jump_velocity
		next_state.time_since_grounded = config.coyote_time_seconds + 1.0
		next_state.time_since_jump_pressed = config.input_buffer_seconds + 1.0
	else:
		next_state.velocity.y = state.velocity.y - config.gravity * delta
