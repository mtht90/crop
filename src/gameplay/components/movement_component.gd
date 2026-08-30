class_name MovementComponent extends Node
## 加速/減速/空中制御/ダッシュを担う。実際の速度計算は純粋関数 MovementSimulation に委譲し、
## このコンポーネントは MoveState/MoveConfig の保持と、衝突解決前後の橋渡しのみを行う
## （クライアント予測との共有のため、ロジックの二重実装を禁止する）。

signal landed(impact_speed: float)

const TUNING: GameFeelTuning = preload("res://data/tuning/game_feel.tres")

var move_speed: float = 0.0
var state: MoveState = MoveState.new()
var _config: MoveConfig


func initialize(new_move_speed: float) -> void:
	move_speed = new_move_speed
	_config = MoveConfig.new()
	_config.move_speed = new_move_speed
	_config.acceleration = TUNING.ground_accel
	_config.ground_friction = TUNING.ground_friction
	_config.air_control = TUNING.air_control
	_config.jump_velocity = TUNING.jump_velocity
	_config.gravity = TUNING.gravity
	_config.coyote_time_seconds = TUNING.coyote_time_seconds
	_config.input_buffer_seconds = TUNING.input_buffer_seconds
	_config.dash_duration_seconds = TUNING.dash_duration_seconds
	_config.dash_speed = TUNING.dash_speed
	_config.dash_curve = TUNING.dash_curve


func compute_next_state(cmd: InputCommand) -> MoveState:
	state = MovementSimulation.step(state, cmd, _config)
	return state


func report_grounded(is_now_grounded: bool) -> void:
	var was_grounded: bool = state.is_grounded
	if not was_grounded and is_now_grounded:
		landed.emit(absf(state.velocity.y))
	state.is_grounded = is_now_grounded
