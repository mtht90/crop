class_name HeroBase extends CharacterBody3D
## コンポーネントの容れ物。振る舞いはすべてコンポーネントと HeroData が持つ（第3.2章）。
## 新ヒーローの追加は hero_data に別の HeroData リソースを差し込むだけで完結しなければならない。
## このクラス自身にヒーロー固有の分岐を書いてはならない。

@export var hero_data: HeroData

@onready var _health_component: HealthComponent = %HealthComponent
@onready var _movement_component: MovementComponent = %MovementComponent
@onready var _input_component: InputComponent = %InputComponent
@onready var _weapon_component: WeaponComponent = %WeaponComponent
@onready var _skill_component: SkillComponent = %SkillComponent
@onready var _ultimate_charge_component: UltimateChargeComponent = %UltimateChargeComponent
@onready var _status_effect_component: StatusEffectComponent = %StatusEffectComponent
@onready var _team_component: TeamComponent = %TeamComponent


func _ready() -> void:
	assert(hero_data != null, "HeroBase には _ready() より前に hero_data を割り当てる必要があります。")
	_health_component.initialize(hero_data.base_health)
	_health_component.died.connect(_on_health_component_died)
	_health_component.health_changed.connect(_on_health_component_health_changed)
	_movement_component.initialize(hero_data.move_speed)
	_weapon_component.initialize(hero_data.weapon_data)
	_ultimate_charge_component.initialize(hero_data.ultimate_cost)
	if hero_data.ability_primary != null:
		_skill_component.assign_ability(&"skill", hero_data.ability_primary)
	if hero_data.ability_ultimate != null:
		_skill_component.assign_ability(&"ultimate", hero_data.ability_ultimate)


func _on_health_component_died(killer_hero_id: int) -> void:
	GameEvents.hero_died.emit(get_instance_id(), killer_hero_id)


func _on_health_component_health_changed(current_health: float, max_health: float) -> void:
	GameEvents.health_changed.emit(get_instance_id(), current_health, max_health)


func get_health_component() -> HealthComponent:
	return _health_component


func get_movement_component() -> MovementComponent:
	return _movement_component


func get_weapon_component() -> WeaponComponent:
	return _weapon_component


func get_skill_component() -> SkillComponent:
	return _skill_component


func get_ultimate_charge_component() -> UltimateChargeComponent:
	return _ultimate_charge_component


func get_team_component() -> TeamComponent:
	return _team_component
