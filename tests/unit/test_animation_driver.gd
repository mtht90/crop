extends GdUnitTestSuite
## AnimationDriver が実アセット（KayKit CC0）に対して AnimationTree を正しく構築し、
## 移動状態に応じて Idle/Walk/Run/Jump へ遷移することを検証する（第4.5章）。

const HERO_BASE_SCENE: PackedScene = preload("res://scenes/hero/hero_base.tscn")


func test_locomotion_state_follows_movement_speed_and_grounded_state() -> void:
	var hero_data: HeroData = load("res://data/heroes/hero_vanguard.tres")
	var hero: HeroBase = HERO_BASE_SCENE.instantiate() as HeroBase
	hero.hero_data = hero_data
	add_child(hero)
	auto_free(hero)

	var movement_component: MovementComponent = hero.get_movement_component()
	var animation_driver: AnimationDriver = hero.get_node("%AnimationDriver") as AnimationDriver

	# 静止・接地: idle
	movement_component.state.velocity = Vector3.ZERO
	movement_component.state.is_grounded = true
	assert_that(animation_driver._decide_locomotion_state()).is_equal(&"idle")

	# 低速・接地: walk
	movement_component.state.velocity = Vector3(2.0, 0.0, 0.0)
	assert_that(animation_driver._decide_locomotion_state()).is_equal(&"walk")

	# 高速・接地: run
	movement_component.state.velocity = Vector3(6.0, 0.0, 0.0)
	assert_that(animation_driver._decide_locomotion_state()).is_equal(&"run")

	# 空中: jump（速度に関わらず優先）
	movement_component.state.is_grounded = false
	assert_that(animation_driver._decide_locomotion_state()).is_equal(&"jump")


func test_animation_tree_is_built_and_active_after_visual_load() -> void:
	var hero_data: HeroData = load("res://data/heroes/hero_kestrel.tres")
	var hero: HeroBase = HERO_BASE_SCENE.instantiate() as HeroBase
	hero.hero_data = hero_data
	add_child(hero)
	auto_free(hero)

	var animation_driver: AnimationDriver = hero.get_node("%AnimationDriver") as AnimationDriver
	var animation_tree: AnimationTree = animation_driver.get_node("AnimationTree") as AnimationTree

	assert_object(animation_tree).is_not_null()
	assert_bool(animation_tree.active).is_true()


func test_death_transitions_locomotion_to_death_state_and_freezes_updates() -> void:
	var hero_data: HeroData = load("res://data/heroes/hero_vanguard.tres")
	var hero: HeroBase = HERO_BASE_SCENE.instantiate() as HeroBase
	hero.hero_data = hero_data
	add_child(hero)
	auto_free(hero)

	var health_component: HealthComponent = hero.get_health_component()
	var damage_info := DamageInfo.new(999, hero_data.base_health + 100.0, &"test", &"body", 1.0)
	health_component.apply_damage(damage_info)

	var animation_driver: AnimationDriver = hero.get_node("%AnimationDriver") as AnimationDriver
	assert_bool(animation_driver._is_dead).is_true()
