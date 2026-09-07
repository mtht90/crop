extends Node3D

# 仕様書 6章: 建築モード = 自由飛行（重力なし）。WASD + QEで上下、Shiftで加速。

@export var move_speed := 6.0
@export var sprint_multiplier := 3.0
@export var mouse_sensitivity := 0.0025

var camera: Camera3D
var pitch := 0.0

func _ready() -> void:
	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.current = true
	camera.fov = 70.0
	camera.near = 0.05
	add_child(camera)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotate_y(-event.relative.x * mouse_sensitivity)
		pitch = clamp(pitch - event.relative.y * mouse_sensitivity, -1.5, 1.5)
		camera.rotation.x = pitch
	elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		else:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _process(delta: float) -> void:
	var input_dir := Vector3.ZERO
	if Input.is_key_pressed(KEY_W):
		input_dir -= transform.basis.z
	if Input.is_key_pressed(KEY_S):
		input_dir += transform.basis.z
	if Input.is_key_pressed(KEY_A):
		input_dir -= transform.basis.x
	if Input.is_key_pressed(KEY_D):
		input_dir += transform.basis.x
	if Input.is_key_pressed(KEY_E):
		input_dir += Vector3.UP
	if Input.is_key_pressed(KEY_Q):
		input_dir += Vector3.DOWN

	if input_dir.length() > 0.0:
		input_dir = input_dir.normalized()

	var speed := move_speed
	if Input.is_key_pressed(KEY_SHIFT):
		speed *= sprint_multiplier

	global_position += input_dir * speed * delta
