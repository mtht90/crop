class_name SkillComponent extends Node
## E スキル / Q アルティメット のスロット管理とクールダウンを担う。
## 発動ロジック本体は AbilityData.execution_scene の Node 側が持つ（第3.2章）。
## 遷移可否（クールダウン中は発動不可、等）は本コンポーネントが唯一の判定者とし、
## 暗黙のフラグ乱立を禁止する（第4.1章の AbilityStateMachine 方針に準拠）。

signal ability_activated(slot_id: StringName)
signal cooldown_changed(slot_id: StringName, remaining_seconds: float, total_seconds: float)

var _ability_slots: Dictionary = {} ## StringName slot_id -> AbilityData
var _cooldown_remaining_seconds: Dictionary = {} ## StringName slot_id -> float


func assign_ability(slot_id: StringName, ability_data: AbilityData) -> void:
	_ability_slots[slot_id] = ability_data
	_cooldown_remaining_seconds[slot_id] = 0.0


func get_ability(slot_id: StringName) -> AbilityData:
	return _ability_slots.get(slot_id)


func can_activate(slot_id: StringName) -> bool:
	if not _ability_slots.has(slot_id):
		return false
	return _cooldown_remaining_seconds.get(slot_id, 0.0) <= 0.0


func try_activate(slot_id: StringName) -> bool:
	if not can_activate(slot_id):
		return false
	var ability_data: AbilityData = _ability_slots[slot_id]
	_cooldown_remaining_seconds[slot_id] = ability_data.cooldown_seconds
	ability_activated.emit(slot_id)
	return true


func get_cooldown_ratio(slot_id: StringName) -> float:
	if not _ability_slots.has(slot_id):
		return 0.0
	var ability_data: AbilityData = _ability_slots[slot_id]
	if ability_data.cooldown_seconds <= 0.0:
		return 0.0
	return _cooldown_remaining_seconds.get(slot_id, 0.0) / ability_data.cooldown_seconds


func _process(delta: float) -> void:
	for slot_id: StringName in _cooldown_remaining_seconds.keys():
		var remaining: float = _cooldown_remaining_seconds[slot_id]
		if remaining <= 0.0:
			continue
		remaining = maxf(0.0, remaining - delta)
		_cooldown_remaining_seconds[slot_id] = remaining
		var ability_data: AbilityData = _ability_slots[slot_id]
		cooldown_changed.emit(slot_id, remaining, ability_data.cooldown_seconds)
