extends Node2D

## 発射ハンドル。強度(0.0〜1.0)に応じて玉を発射する。
## AAA品質の物理挙動を狙うため、発射強度は連続値として扱い、
## 実機同様に「ちょい打ち」による釘への絡み方の違いを再現できるようにする。

@export var ball_scene: PackedScene
@export var min_launch_speed: float = 600.0
@export var max_launch_speed: float = 1400.0
@export var launch_direction: Vector2 = Vector2(-0.06, -1.0) # わずかに左へ逃がす、実機のレール角に相当

var strength: float = 0.8 : set = set_strength

func set_strength(value: float) -> void:
	strength = clampf(value, 0.0, 1.0)

func launch() -> RigidBody2D:
	var ball := ball_scene.instantiate() as RigidBody2D
	get_tree().current_scene.add_child(ball)
	ball.global_position = global_position
	var speed := lerpf(min_launch_speed, max_launch_speed, strength)
	ball.linear_velocity = launch_direction.normalized() * speed
	return ball
