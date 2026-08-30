class_name MoveState extends RefCounted
## MovementSimulation が入出力する不変っぽいスナップショット。
## step() は既存インスタンスを書き換えず、常に新しい MoveState を返す。

var position: Vector3 = Vector3.ZERO
var velocity: Vector3 = Vector3.ZERO
var is_grounded: bool = false
var time_since_grounded: float = 0.0
var time_since_jump_pressed: float = 999.0
var is_dashing: bool = false
var dash_elapsed_seconds: float = 0.0


func duplicate_state() -> MoveState:
	var copy := MoveState.new()
	copy.position = position
	copy.velocity = velocity
	copy.is_grounded = is_grounded
	copy.time_since_grounded = time_since_grounded
	copy.time_since_jump_pressed = time_since_jump_pressed
	copy.is_dashing = is_dashing
	copy.dash_elapsed_seconds = dash_elapsed_seconds
	return copy
