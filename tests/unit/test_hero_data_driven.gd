extends GdUnitTestSuite
## 新ヒーローの追加が「.tres を1つ足すだけ」で完結することを証明するテスト（Phase 1 DoD）。
## HeroBase・各コンポーネントに一切のヒーロー固有分岐を書いていないことを、
## 実際に data/heroes/*.tres を全走査してインスタンス化することで検証する。

const HERO_BASE_SCENE: PackedScene = preload("res://scenes/hero/hero_base.tscn")
const HEROES_DIRECTORY: String = "res://data/heroes"


func test_every_hero_resource_drives_hero_base_without_code_changes() -> void:
	var hero_paths: Array[String] = _list_hero_resource_paths()
	assert_int(hero_paths.size()).is_greater_equal(2)

	for hero_path: String in hero_paths:
		var hero_data: HeroData = load(hero_path) as HeroData
		assert_object(hero_data).is_not_null()
		assert_float(hero_data.base_health).is_greater(0.0)
		assert_float(hero_data.move_speed).is_greater(0.0)
		assert_object(hero_data.weapon_data).is_not_null()

		var hero_instance: HeroBase = HERO_BASE_SCENE.instantiate() as HeroBase
		hero_instance.hero_data = hero_data
		add_child(hero_instance)
		auto_free(hero_instance)

		var health_component: HealthComponent = hero_instance.get_health_component()
		assert_float(health_component.max_health).is_equal(hero_data.base_health)
		assert_float(health_component.get_current_health()).is_equal(hero_data.base_health)

		var movement_component: MovementComponent = hero_instance.get_movement_component()
		assert_float(movement_component.move_speed).is_equal(hero_data.move_speed)

		var weapon_component: WeaponComponent = hero_instance.get_weapon_component()
		assert_object(weapon_component.weapon_data).is_equal(hero_data.weapon_data)

		var skill_component: SkillComponent = hero_instance.get_skill_component()
		assert_object(skill_component.get_ability(&"skill")).is_equal(hero_data.ability_primary)
		assert_object(skill_component.get_ability(&"ultimate")).is_equal(hero_data.ability_ultimate)


func _list_hero_resource_paths() -> Array[String]:
	var hero_paths: Array[String] = []
	var directory: DirAccess = DirAccess.open(HEROES_DIRECTORY)
	assert_object(directory).is_not_null()
	directory.list_dir_begin()
	var file_name: String = directory.get_next()
	while file_name != "":
		if file_name.ends_with(".tres"):
			hero_paths.append("%s/%s" % [HEROES_DIRECTORY, file_name])
		file_name = directory.get_next()
	directory.list_dir_end()
	return hero_paths
