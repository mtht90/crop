class_name MoveConfig extends RefCounted
## MovementSimulation.step() が参照する不変パラメータ。GameFeelTuning + ヒーロー固有の
## move_speed から MovementComponent が組み立てる。

var move_speed: float = 0.0
var acceleration: float = 0.0
var ground_friction: float = 0.0
var air_control: float = 1.0
var jump_velocity: float = 0.0
var gravity: float = 0.0
var coyote_time_seconds: float = 0.0
var input_buffer_seconds: float = 0.0
var dash_duration_seconds: float = 0.0
var dash_speed: float = 0.0
var dash_curve: Curve
