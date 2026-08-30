class_name SkillComponent extends Node
## E スキル / Q アルティメット のスロット管理を担う。各スロットは AbilityData を保持するのみで、
## 発動ロジックは AbilityData.execution_scene の Node 側が持つ（第3.2章）。

var _ability_slots: Dictionary = {} ## StringName slot_id -> AbilityData


func assign_ability(slot_id: StringName, ability_data: AbilityData) -> void:
	_ability_slots[slot_id] = ability_data


func get_ability(slot_id: StringName) -> AbilityData:
	return _ability_slots.get(slot_id)
