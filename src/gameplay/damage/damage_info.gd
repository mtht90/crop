class_name DamageInfo extends RefCounted
## ダメージ発生源・部位・種別・距離を保持する。ダメージ計算はすべてサーバー権威で行われ、
## クライアントからの「ダメージを与えた」という主張は信用しない（第5.7章）。

var source_hero_id: int
var amount: float
var damage_type: StringName
var hit_part: StringName
var distance_meters: float


func _init(
	new_source_hero_id: int,
	new_amount: float,
	new_damage_type: StringName,
	new_hit_part: StringName,
	new_distance_meters: float
) -> void:
	source_hero_id = new_source_hero_id
	amount = new_amount
	damage_type = new_damage_type
	hit_part = new_hit_part
	distance_meters = new_distance_meters
