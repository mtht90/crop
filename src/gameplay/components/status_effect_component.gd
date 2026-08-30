class_name StatusEffectComponent extends Node
## スタン/スロウ/バフのスタック管理を担う。

var _active_effects: Dictionary = {} ## StringName effect_id -> float remaining_seconds


func apply_effect(effect_id: StringName, duration_seconds: float) -> void:
	_active_effects[effect_id] = duration_seconds


func has_effect(effect_id: StringName) -> bool:
	return _active_effects.has(effect_id)


func _process(delta: float) -> void:
	var expired_effect_ids: Array[StringName] = []
	for effect_id: StringName in _active_effects.keys():
		_active_effects[effect_id] -= delta
		if _active_effects[effect_id] <= 0.0:
			expired_effect_ids.append(effect_id)
	for effect_id: StringName in expired_effect_ids:
		_active_effects.erase(effect_id)
