class_name CameraRigComponent extends SpringArm3D
## TPS カメラリグ。マウス視点は _input で即座に反映し、物理tick待ちによる遅延を作らない
## （第4.1/4.3章）。top_level=true でヒーロー本体のTransformから独立し、Y座標のみを
## exponential smoothing で追従させることで段差でのカメラ跳ねを防ぐ（step smoothing）。
## ADS の FOV遷移、着地ディップ、トラウマ方式のカメラシェイクもここで扱う。

const TUNING: GameFeelTuning = preload("res://data/tuning/game_feel.tres")
const BASE_FOV_DEGREES: float = 75.0
const ADS_FOV_DEGREES: float = 55.0
const EYE_HEIGHT_METERS: float = 1.6
const LANDING_IMPACT_SPEED_FOR_MAX_DIP: float = 12.0
const SHAKE_NOISE_FREQUENCY: float = 4.0
const SHAKE_TIME_SCALE: float = 30.0
const SHAKE_MAX_OFFSET_METERS: float = 0.05
const SHAKE_DECAY_PER_SECOND: float = 2.0
const MAX_PITCH_RADIANS: float = 1.4

@onready var _camera: Camera3D = $Camera

var _yaw: float = 0.0
var _pitch: float = 0.0
var _ads_weight: float = 0.0
var _trauma: float = 0.0
var _shake_time_seconds: float = 0.0
var _shake_noise: FastNoiseLite = FastNoiseLite.new()
var _smoothed_y: float = 0.0
var _y_initialized: bool = false
var _landing_dip_offset_meters: float = 0.0
var _landing_dip_elapsed_seconds: float = 0.0
var _landing_dip_active: bool = false


func _ready() -> void:
	top_level = true
	_shake_noise.seed = randi()
	_shake_noise.frequency = SHAKE_NOISE_FREQUENCY
	var movement_component: MovementComponent = %MovementComponent
	movement_component.landed.connect(_on_movement_landed)


func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		var mouse_motion: InputEventMouseMotion = event as InputEventMouseMotion
		_yaw -= mouse_motion.relative.x * TUNING.mouse_sensitivity_base
		_pitch = clampf(
			_pitch - mouse_motion.relative.y * TUNING.mouse_sensitivity_base,
			-MAX_PITCH_RADIANS,
			MAX_PITCH_RADIANS
		)


func _process(delta: float) -> void:
	_update_position_and_rotation(delta)
	_update_ads_fov(delta)
	_update_landing_dip(delta)
	_update_camera_shake(delta)


func add_trauma(amount: float) -> void:
	_trauma = clampf(_trauma + amount, 0.0, 1.0)


func _update_position_and_rotation(delta: float) -> void:
	var hero: Node3D = get_parent() as Node3D
	var target_position: Vector3 = hero.global_position + Vector3(0.0, EYE_HEIGHT_METERS, 0.0)
	if not _y_initialized:
		_smoothed_y = target_position.y
		_y_initialized = true
	var y_smoothing_weight: float = 1.0 - exp(-delta / maxf(TUNING.step_smoothing_seconds, 0.001))
	_smoothed_y = lerpf(_smoothed_y, target_position.y, y_smoothing_weight)
	global_position = Vector3(target_position.x, _smoothed_y, target_position.z)
	rotation.y = _yaw
	rotation.x = _pitch


func _update_ads_fov(delta: float) -> void:
	var ads_target_weight: float = 1.0 if Input.is_action_pressed(&"ads") else 0.0
	var ads_smoothing_weight: float = 1.0 - exp(-delta / maxf(TUNING.ads_transition_seconds, 0.001))
	_ads_weight = lerpf(_ads_weight, ads_target_weight, ads_smoothing_weight)
	_camera.fov = lerpf(BASE_FOV_DEGREES, ADS_FOV_DEGREES, _ads_weight)


func _on_movement_landed(impact_speed: float) -> void:
	var dip_ratio: float = clampf(impact_speed / LANDING_IMPACT_SPEED_FOR_MAX_DIP, 0.0, 1.0)
	_landing_dip_offset_meters = TUNING.landing_dip_max_meters * dip_ratio
	_landing_dip_elapsed_seconds = 0.0
	_landing_dip_active = true


func _update_landing_dip(delta: float) -> void:
	if not _landing_dip_active:
		return
	_landing_dip_elapsed_seconds += delta
	var recovery_ratio: float = clampf(
		_landing_dip_elapsed_seconds / maxf(TUNING.landing_dip_recovery_seconds, 0.001), 0.0, 1.0
	)
	_camera.position.y = -_landing_dip_offset_meters * (1.0 - recovery_ratio)
	if recovery_ratio >= 1.0:
		_landing_dip_active = false
		_camera.position.y = 0.0


func _update_camera_shake(delta: float) -> void:
	_trauma = maxf(0.0, _trauma - SHAKE_DECAY_PER_SECOND * delta)
	_shake_time_seconds += delta
	var shake_amount: float = _trauma * _trauma
	var noise_x: float = _shake_noise.get_noise_2d(_shake_time_seconds * SHAKE_TIME_SCALE, 0.0)
	var noise_y: float = _shake_noise.get_noise_2d(0.0, _shake_time_seconds * SHAKE_TIME_SCALE)
	_camera.h_offset = noise_x * shake_amount * SHAKE_MAX_OFFSET_METERS
	_camera.v_offset = noise_y * shake_amount * SHAKE_MAX_OFFSET_METERS
