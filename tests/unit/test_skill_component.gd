extends GdUnitTestSuite
## SkillComponent のクールダウンゲートを検証する。


func _make_ability(cooldown_seconds: float) -> AbilityData:
	var ability_data := AbilityData.new()
	ability_data.ability_id = &"test_ability"
	ability_data.cooldown_seconds = cooldown_seconds
	return ability_data


func test_cannot_reactivate_ability_before_cooldown_elapses() -> void:
	var skill_component := SkillComponent.new()
	add_child(skill_component)
	auto_free(skill_component)
	skill_component.assign_ability(&"skill", _make_ability(4.0))

	assert_bool(skill_component.try_activate(&"skill")).is_true()
	assert_bool(skill_component.can_activate(&"skill")).is_false()
	assert_bool(skill_component.try_activate(&"skill")).is_false()

	skill_component._process(4.1)
	assert_bool(skill_component.can_activate(&"skill")).is_true()
	assert_bool(skill_component.try_activate(&"skill")).is_true()


func test_unassigned_slot_cannot_be_activated() -> void:
	var skill_component := SkillComponent.new()
	add_child(skill_component)
	auto_free(skill_component)

	assert_bool(skill_component.can_activate(&"ultimate")).is_false()
	assert_bool(skill_component.try_activate(&"ultimate")).is_false()
