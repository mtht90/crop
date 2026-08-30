class_name WeaponData extends Resource
## 武器の全パラメータを保持する Resource（第3.3章）。数値はここに集約し、コードに直書きしない。

enum FireModeType { HITSCAN, PROJECTILE, BEAM }

@export var weapon_id: StringName = &""
@export var fire_mode_type: FireModeType = FireModeType.HITSCAN
@export var damage_per_hit: float = 20.0
@export var fire_rate_rounds_per_second: float = 8.0
@export var magazine_size: int = 24
@export var reload_seconds: float = 1.8
@export var spread_curve: Curve
@export var recoil_pattern: Curve2D
@export var recoil_random_factor: float = 0.1
