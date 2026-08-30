class_name NetConfig extends Resource
## ネットワークの tick・バッファ・補間遅延を集約する Resource（第5章）。

@export var physics_ticks_per_second: int = 60
@export var snapshot_send_rate_hz: int = 30
@export var reconcile_threshold_meters: float = 0.02
@export var interpolation_delay_seconds: float = 0.1
@export var max_extrapolation_seconds: float = 0.2
@export var lag_compensation_history_seconds: float = 1.0
@export var max_rewind_seconds: float = 0.25
@export var input_jitter_buffer_ticks: int = 2
