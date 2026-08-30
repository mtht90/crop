class_name GameFeelTuning extends Resource
## 第4章「ゲームフィール仕様」の全数値を集約する Resource。
## コード中に生の数値を書かないため、移動・入力・カメラ・武器フィールの定数はすべてここに置く。

@export_group("Movement")
@export var ground_accel: float = 12.0
@export var ground_friction: float = 10.0
@export var air_control: float = 0.4
@export var dash_curve: Curve
@export var dash_duration_seconds: float = 0.2
@export var landing_dip_max_meters: float = 0.06
@export var landing_dip_recovery_seconds: float = 0.12

@export_group("Input")
@export var input_buffer_seconds: float = 0.12
@export var coyote_time_seconds: float = 0.1
@export var mouse_sensitivity_base: float = 0.0022

@export_group("Camera")
@export var ads_transition_seconds: float = 0.12
@export var camera_collision_smooth_seconds: float = 0.06
@export var step_smoothing_seconds: float = 0.08

@export_group("Weapon Feel")
@export var recoil_recovery_delay_seconds: float = 0.25
@export var hitmarker_fade_seconds: float = 0.06
