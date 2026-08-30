class_name HealthComponent extends Node
## HP・被ダメ計算・死亡通知を担う。数値の初期化は initialize() を通じて明示的に行い、
## _ready() の実行順序（子が親より先に走る）に依存した暗黙の初期化を避ける。

signal health_changed(current_health: float, max_health: float)
signal damage_taken(damage_info: DamageInfo)
signal died(killer_hero_id: int)

var max_health: float = 0.0
var _current_health: float = 0.0
var _is_dead: bool = false


func initialize(new_max_health: float) -> void:
	max_health = new_max_health
	_current_health = new_max_health
	_is_dead = false


func apply_damage(damage_info: DamageInfo) -> void:
	if _is_dead:
		return
	_current_health = maxf(0.0, _current_health - damage_info.amount)
	health_changed.emit(_current_health, max_health)
	damage_taken.emit(damage_info)
	if _current_health <= 0.0:
		_is_dead = true
		died.emit(damage_info.source_hero_id)


func heal(amount: float) -> void:
	if _is_dead:
		return
	_current_health = minf(max_health, _current_health + amount)
	health_changed.emit(_current_health, max_health)


func get_current_health() -> float:
	return _current_health


func is_dead() -> bool:
	return _is_dead
