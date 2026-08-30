class_name InputComponent extends Node
## ローカル入力から InputCommand を生成する。マウス視点用の相対値は _input で即座に
## 蓄積し、ジャンプ/ダッシュ/リロードは _input のエッジ（is_action_pressed）で検出する。
## _process でのポーリングによる1フレーム遅延を作らない（第4.1章）。
## 先行入力バッファ・コヨーテタイムの実際の判定は MovementSimulation 側の状態
## （time_since_jump_pressed/time_since_grounded）が担うため、ここでは
## 「このtickで押されたか」という単発のエッジのみを報告すればよい。

var _accumulated_mouse_delta: Vector2 = Vector2.ZERO
var _jump_pressed_this_tick: bool = false
var _dash_pressed_this_tick: bool = false
var _reload_pressed_this_tick: bool = false


func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_accumulated_mouse_delta += (event as InputEventMouseMotion).relative
		return
	if event.is_action_pressed(&"jump"):
		_jump_pressed_this_tick = true
	elif event.is_action_pressed(&"dash"):
		_dash_pressed_this_tick = true
	elif event.is_action_pressed(&"reload"):
		_reload_pressed_this_tick = true


func consume_mouse_delta() -> Vector2:
	var delta: Vector2 = _accumulated_mouse_delta
	_accumulated_mouse_delta = Vector2.ZERO
	return delta


func build_input_command(tick: int, delta: float) -> InputCommand:
	var command := InputCommand.new()
	command.tick = tick
	command.delta = delta
	command.move = Input.get_vector(&"move_left", &"move_right", &"move_forward", &"move_back")
	command.look_yaw = 0.0
	command.look_pitch = 0.0

	var buttons: int = 0
	if Input.is_action_pressed(&"fire"):
		buttons |= InputButtons.FIRE
	if Input.is_action_pressed(&"ads"):
		buttons |= InputButtons.ADS
	if Input.is_action_pressed(&"skill"):
		buttons |= InputButtons.SKILL
	if Input.is_action_pressed(&"ultimate"):
		buttons |= InputButtons.ULTIMATE
	if _jump_pressed_this_tick:
		buttons |= InputButtons.JUMP
	if _dash_pressed_this_tick:
		buttons |= InputButtons.DASH
	if _reload_pressed_this_tick:
		buttons |= InputButtons.RELOAD
	command.buttons = buttons

	_jump_pressed_this_tick = false
	_dash_pressed_this_tick = false
	_reload_pressed_this_tick = false

	return command
